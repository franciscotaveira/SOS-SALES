# PROMPT GEMINI — TSTACK: Validação RLS + Funções Supabase Remoto

## Contexto
Projeto **SOS-SALES** — Clean Architecture + DDD + Multi-tenancy (RLS).
- **VPS**: 179.197.72.221 (Ubuntu 24.04, Docker, Caddy, API, Web, Redis, WAHA)
- **Supabase Remoto**: projeto `yiiuebhyqixzluguxsqi` (pooler `aws-0-ca-central-1.pooler.supabase.com:6543`)
- **Role API**: `sos_sales_runtime` (conecta via pooler)
- **Role Gateway**: `authenticated` (usada via `SET LOCAL ROLE authenticated` + `request.jwt.claims`)

## Problema
8 migrations locais **NÃO APLICADAS** no remoto. Banco remoto está vazio.
Preciso validar **RLS + Grants + Functions** antes do deploy.

---

## 🎯 OBJETIVO DO PROMPT
Gerar **plano de teste executável** (SQL + Node.js) para validar:
1. Migrations 0001-0008 aplicadas corretamente
2. RLS policies ativas em todas as tabelas multi-tenant
3. Functions helper (`current_user_workspace_ids`, `is_service_role`, etc.) com **GRANT EXECUTE TO authenticated**
4. Gateway pattern: `SET LOCAL ROLE authenticated; SELECT current_user_workspace_ids()` funciona
5. Isolamento total entre 2+ workspaces (zero vazamento)

---

## 📋 TAREFAS (TSTACK — Plan → Review → Ship)

### PHASE 1: PLAN — Checklist de Validação
```markdown
[ ] Migration 0001: schema base (workspaces, memberships, channels, contacts, RLS helpers)
[ ] Migration 0002: inbound_channel_events + ingest_channel_event (service_role only)
[ ] Migration 0003: handoff + supervision controls
[ ] Migration 0004: cockpit operations (pipeline, appointments, outcomes)
[ ] Migration 0005: supervised outbound (dispatch, controls, kill switch)
[ ] Migration 0006: traffic_proof (UTM, attribution, outcome linking)
[ ] Migration 0007: known_fact audit hardening
[ ] Migration 0008: appointments + notes
```

### PHASE 2: REVIEW — SQL de Validação (rodar no Dashboard Supabase SQL Editor)

```sql
-- 1. VERIFICAR MIGRATIONS APLICADAS
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;

-- 2. VERIFICAR GRANTS NAS FUNCTIONS RLS (CRÍTICO)
SELECT 
  p.proname,
  p.proacl,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_exec,
  has_function_privilege('sos_sales_runtime', p.oid, 'EXECUTE') as runtime_can_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_user_workspace_ids', 'current_workspace_id',
    'is_workspace_member', 'assert_workspace_member',
    'can_access_conversation', 'can_manage_appointment',
    'can_manage_pipeline', 'can_manage_workspace_settings',
    'get_operator_workspace_role', 'is_service_role',
    'normalize_waha_inbound_message', 'ingest_channel_event',
    'claim_outbox_batch_for_events', 'mark_outbox_events_processed'
  )
ORDER BY p.proname;

-- 3. VERIFICAR RLS ATIVO EM TABELAS MULTI-TENANT
SELECT 
  schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'workspaces', 'workspace_memberships', 'channel_connections',
    'contacts', 'commercial_journeys', 'conversation_messages',
    'inbound_channel_events', 'outbox_events', 'known_facts',
    'commercial_appointments', 'operational_notes', 'handoff_cases',
    'commercial_outcomes', 'outbound_dispatches', 'traffic_proofs'
  )
ORDER BY tablename;

-- 4. VERIFICAR POLICIES
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. TESTE GATEWAY PATTERN (simular request.jwt.claims)
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","email":"test@test.com"}', true);
SELECT public.current_user_workspace_ids();  -- DEVE RETORNAR workspace_ids do user
RESET ROLE;
```

### PHASE 3: SHIP — Node.js Test Suite (rodar no VPS via `docker exec sos-sales-api node`)

```javascript
// test-rls-validation.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function runTests() {
  const results = [];
  
  // Test 1: Gateway pattern com role authenticated
  try {
    await pool.query("SET LOCAL ROLE authenticated");
    await pool.query(`SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true)`);
    const r = await pool.query('SELECT public.current_user_workspace_ids()');
    results.push({ test: 'gateway_pattern', pass: r.rowCount > 0, detail: r.rows });
  } catch (e) { results.push({ test: 'gateway_pattern', pass: false, error: e.message }); }
  
  // Test 2: Isolamento workspace A vs B
  try {
    // Setup: criar 2 workspaces + memberships (via service_role)
    await pool.query("SET LOCAL ROLE service_role");
    const wsA = await pool.query("INSERT INTO public.workspaces (name) VALUES ('WS A') RETURNING id");
    const wsB = await pool.query("INSERT INTO public.workspaces (name) VALUES ('WS B') RETURNING id");
    const user1 = '11111111-1111-1111-1111-111111111111';
    const user2 = '22222222-2222-2222-2222-222222222222';
    await pool.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsA.rows[0].id, user1]);
    await pool.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsB.rows[0].id, user2]);
    
    // Test: user1 só vê wsA
    await pool.query("SET LOCAL ROLE authenticated");
    await pool.query(`SELECT set_config('request.jwt.claims', '{"sub":"' + user1 + '","role":"authenticated"}', true)`);
    const visible = await pool.query('SELECT * FROM public.workspaces');
    const pass = visible.rows.every(w => w.id === wsA.rows[0].id);
    results.push({ test: 'workspace_isolation', pass, detail: visible.rows });
  } catch (e) { results.push({ test: 'workspace_isolation', pass: false, error: e.message }); }
  
  // Test 3: ingest_channel_event requer service_role
  try {
    await pool.query("SET LOCAL ROLE authenticated");
    await pool.query(`SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true)`;
    await pool.query("SELECT public.ingest_channel_event('00000000-0000-0000-0000-000000000000', 'evt-1', 'message', '{}')");
    results.push({ test: 'ingest_requires_service_role', pass: false, error: 'Should have thrown' });
  } catch (e) { 
    results.push({ test: 'ingest_requires_service_role', pass: e.message.includes('service_role'), error: e.message });
  }
  
  // Test 4: normalize_waha_inbound_message acessível por authenticated
  try {
    await pool.query("SET LOCAL ROLE authenticated");
    await pool.query(`SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true)`;
    const r = await pool.query("SELECT public.normalize_waha_inbound_message('{\"id\":\"msg-1\",\"from\":\"5511999999999@c.us\",\"body\":\"test\"}'::jsonb)");
    results.push({ test: 'normalize_accessible', pass: !!r.rows[0], detail: r.rows[0] });
  } catch (e) { results.push({ test: 'normalize_accessible', pass: false, error: e.message }); }
  
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  process.exit(results.every(r => r.pass) ? 0 : 1);
}

runTests();
```

---

## ✅ CRITÉRIOS DE ACEITAÇÃO (Definition of Done)

| Critério | Pass/Fail |
|----------|-----------|
| Todas 8 migrations aparecem em `supabase_migrations.schema_migrations` |  |
| Todas functions RLS têm `GRANT EXECUTE TO authenticated` |  |
| `current_user_workspace_ids()` executa via `SET ROLE authenticated` |  |
| RLS ativo (`rowsecurity = true`) em 15+ tabelas multi-tenant |  |
| Policies usam `current_user_workspace_ids()` para filtro |  |
| Teste isolamento: user1 vê só wsA, user2 vê só wsB |  |
| `ingest_channel_event` rejeita `authenticated`, aceita `service_role` |  |
| `normalize_waha_inbound_message` acessível por `authenticated` |  |
| Node.js test suite roda sem erros no VPS |  |

---

## 🚀 COMO EXECUTAR

1. **Aplicar migrations** (Dashboard SQL Editor → copiar/colar 8 arquivos em ordem)
2. **Rodar SQL validação** (Dashboard SQL Editor → colar queries PHASE 2)
3. **Rodar Node.js tests** no VPS:
   ```bash
   ssh deploy@179.197.72.221 'docker exec -i sos-sales-api node' < test-rls-validation.js
   ```

---

## 📤 OUTPUT ESPERADO DO GEMINI

Retorne **apenas**:
1. Confirmação se migrations já aplicadas ou precisam ser aplicadas
2. Resultado das queries SQL (copiar/colar output)
3. Resultado do `node test-rls-validation.js` (JSON)
4. **Lista de gaps** (o que falhou) + **comandos exatos para corrigir** (GRANTs faltando, policies faltando, etc.)

**Formato**: Markdown com blocos de código copiáveis. Sem explicação teórica — só ação.

---

## ⚠️ CONTEXTO ADICIONAL (não vazar credenciais)
- `DATABASE_URL` usa `sos_sales_runtime.yiiuebhyqixzluguxsqi:***@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`
- `WAHA_WEBHOOK_SECRET=mct_sos_waha_webhook_secret_2026`
- Role `authenticated` é **reservada do Supabase** — não pode `CREATE ROLE`, só `GRANT`
- Gateway pattern: `SET LOCAL ROLE authenticated; SELECT current_user_workspace_ids()` — **precisa funcionar**