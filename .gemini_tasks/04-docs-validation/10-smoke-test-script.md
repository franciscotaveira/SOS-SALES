# PROMPT PARA GEMINI — Task 10: Smoke Test Script (Validação Local Automatizada)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Objetivo: Script único que valida MVP completo local (health + auth + fluxo core)

## ARQUIVO A CRIAR
`scripts/smoke-test.sh`

## REQUISITOS FUNCIONAIS

### 1. Pré-requisitos
- Supabase local rodando (`npm run db:status` → healthy)
- API rodando (`npm run dev:api` ou container)
- Web rodando (`npm run dev:web` ou container)
- WAHA local rodando (porta 3002)

### 2. Testes Sequenciais (Exit Code 0 = Sucesso, 1 = Falha)

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_API="http://localhost:4334/api/v1"
BASE_WEB="http://localhost:3000"
JWT=""  # Preenchido após login

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# 1. Health Check
echo "🔍 1/8 Health Check..."
curl -sf "$BASE_API/../health" > /dev/null && pass "API /health" || fail "API /health"

# 2. Ready Check
echo "🔍 2/8 Ready Check..."
curl -sf "$BASE_API/../ready" | jq -e '.checks[] | select(.healthy==false)' > /dev/null && fail "Dependencies unhealthy" || pass "All deps healthy"

# 3. Auth Login (test user)
echo "🔍 3/8 Auth Login..."
# Usar test user do Supabase local (seed) ou criar via script
JWT=$(curl -sf -X POST "$BASE_API/../auth/test-login" -H "Content-Type: application/json" -d '{"email":"test@sos.local","password":"test123"}' | jq -r '.access_token')
[ -n "$JWT" ] && [ "$JWT" != "null" ] && pass "JWT obtido" || fail "Login falhou"

# 4. Workspaces List
echo "🔍 4/8 Workspaces..."
WS=$(curl -sf -H "Authorization: Bearer $JWT" "$BASE_API/workspaces" | jq -r '.data[0].id')
[ -n "$WS" ] && [ "$WS" != "null" ] && pass "Workspace: $WS" || fail "Sem workspace"

# 5. Cockpit Priority Queue
echo "🔍 5/8 Cockpit Queue..."
curl -sf -H "Authorization: Bearer $JWT" "$BASE_API/workspaces/$WS/priorities?limit=5" > /dev/null && pass "Priorities OK" || fail "Priorities falhou"

# 6. Cockpit Get Journey (se houver)
echo "🔍 6/8 Cockpit Journey..."
JOURNEY=$(curl -sf -H "Authorization: Bearer $JWT" "$BASE_API/workspaces/$WS/priorities?limit=1" | jq -r '.data[0].journeyId // empty')
if [ -n "$JOURNEY" ]; then
  curl -sf -H "Authorization: Bearer $JWT" "$BASE_API/workspaces/$WS/journeys/$JOURNEY/cockpit" > /dev/null && pass "Cockpit OK" || fail "Cockpit falhou"
else
  pass "Cockpit (sem jornadas - OK)"
fi

# 7. Traffic Proof
echo "🔍 7/8 Traffic Proof..."
curl -sf -H "Authorization: Bearer $JWT" "$BASE_API/workspaces/$WS/traffic-proof?start=2026-08-01&end=2026-08-15" > /dev/null && pass "Traffic Proof OK" || fail "Traffic Proof falhou"

# 8. Web Frontend Loads
echo "🔍 8/8 Web Frontend..."
curl -sf "$BASE_WEB" | grep -q "SOS Sales" && pass "Web carrega" || fail "Web não carrega"

echo -e "\n${GREEN}🎉 ALL SMOKE TESTS PASSED${NC}"
exit 0
```

### 3. Integração no `package.json` (root)
```json
{
  "scripts": {
    "smoke": "bash scripts/smoke-test.sh",
    "smoke:ci": "npm run dev:api & npm run dev:web & sleep 10 && npm run smoke"
  }
}
```

## CRITÉRIO DE ACEITE

1. `chmod +x scripts/smoke-test.sh && npm run smoke` → **exit 0** (tudo verde)
2. Se qualquer dependência cai (API, DB, Redis, WAHA) → exit 1 + mensagem clara
3. Funciona em CI (GitHub Actions) com containers
4. Tempo total < 30s

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
chmod +x scripts/smoke-test.sh
npm run smoke
```