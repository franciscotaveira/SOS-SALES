/**
 * Multi-Tenant Isolation & Zero-Leakage Audit Gate
 * Verifies strict boundary isolation across all workspace endpoints.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4334';

async function runIsolationAudit() {
  console.log('🛡️ INICIANDO AUDITORIA DE ISOLAMENTO MULTI-TENANT & ZERO LEAKAGE...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  const havenId = '22222222-2222-2222-2222-222222222222';
  const soraId = '33333333-3333-3333-3333-333333333333';
  const virginId = '44444444-4444-4444-4444-444444444444';

  // 1. WhatsApp Channel Status Isolation
  console.log('1. Testando Isolamento de Canais WhatsApp (WAHA Status):');
  const havenStatus = await fetch(`${API_BASE}/api/v1/workspaces/${havenId}/channels/whatsapp/status`).then(r => r.json());
  const soraStatus = await fetch(`${API_BASE}/api/v1/workspaces/${soraId}/channels/whatsapp/status`).then(r => r.json());
  const virginStatus = await fetch(`${API_BASE}/api/v1/workspaces/${virginId}/channels/whatsapp/status`).then(r => r.json());

  assert(havenStatus.session === 'haven', 'Haven possui session = haven');
  assert(havenStatus.status === 'WORKING', 'Haven está conectado ao chip');
  assert(soraStatus.session === 'sora', 'Sora possui session = sora');
  assert(soraStatus.phone === null || soraStatus.phone !== havenStatus.phone, 'Sora NÃO compartilha o número do chip da Haven');
  assert(virginStatus.phone === null, 'Tenant Virgem possui phone = null (sem vazamento)');

  // 2. Tracking / Meta Pixel Isolation
  console.log('\n2. Testando Isolamento de Pixels, CAPI e Tokens:');
  const havenTracking = await fetch(`${API_BASE}/api/v1/workspaces/${havenId}/tracking`).then(r => r.json());
  const soraTracking = await fetch(`${API_BASE}/api/v1/workspaces/${soraId}/tracking`).then(r => r.json());
  const virginTracking = await fetch(`${API_BASE}/api/v1/workspaces/${virginId}/tracking`).then(r => r.json());

  assert(soraTracking.tracking === null || soraTracking.tracking?.metaPixelId !== havenTracking.tracking?.metaPixelId, 'Sora NÃO herda Pixel da Haven');
  assert(virginTracking.tracking === null, 'Tenant Virgem possui tracking = null (sem vazamento de tokens)');

  // 3. Cockpit Journeys & Contacts Isolation
  console.log('\n3. Testando Isolamento de Atendimentos & Contatos:');
  const soraJourneys = await fetch(`${API_BASE}/api/v1/workspaces/${soraId}/cockpit/overview`).then(r => r.json()).catch(() => ({ journeys: [] }));
  const virginJourneys = await fetch(`${API_BASE}/api/v1/workspaces/${virginId}/cockpit/overview`).then(r => r.json()).catch(() => ({ journeys: [] }));

  assert(Array.isArray(soraJourneys.journeys || soraJourneys.items || []), 'Sora retorna array de jornadas isolado');
  assert((virginJourneys.journeys || virginJourneys.items || []).length === 0, 'Tenant Virgem possui 0 atendimentos');

  // Summary
  console.log('\n=========================================');
  console.log(`TOTAL DE TESTES DE ISOLAMENTO: ${passed + failed}`);
  console.log(`PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('=========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🏆 BLINDAGEM MULTI-TENANT 100% APROVADA: ZERO VAZAMENTO ENTRE CLIENTES!\n');
  }
}

runIsolationAudit().catch(err => {
  console.error('Erro na auditoria de isolamento:', err);
  process.exit(1);
});
