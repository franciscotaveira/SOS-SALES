#!/usr/bin/env node
/**
 * sync-all-workspaces.mjs
 * Dispara sync manual de conversas WAHA para os 3 workspaces principais.
 * Usa a rota interna: POST /api/v1/workspaces/:id/channels/whatsapp/sync
 *
 * Uso:
 *   node scripts/sync-all-workspaces.mjs
 *   API_URL=http://localhost:4335 node scripts/sync-all-workspaces.mjs
 */

const API_URL = process.env.API_URL || 'http://localhost:4335';

const WORKSPACES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'SOS Sales (Matriz / default)' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Haven' },
  { id: '33333333-3333-3333-3333-333333333333', name: 'Sora' },
];

async function syncWorkspace({ id, name }) {
  const url = `${API_URL}/api/v1/workspaces/${id}/channels/whatsapp/sync`;
  console.log(`\n🔄 Sincronizando: ${name} (${id})`);
  console.log(`   → POST ${url}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      console.log(`   ✅ OK | Contatos: ${body.syncedContacts ?? '?'} | Mensagens: ${body.syncedMessages ?? '?'} | Channel: ${body.channelConnectionId ?? '?'}`);
    } else {
      console.log(`   ❌ ERRO ${res.status}: ${JSON.stringify(body)}`);
    }
    return { id, name, ok: res.ok, body };
  } catch (err) {
    console.log(`   ❌ FALHA DE REDE: ${err.message}`);
    return { id, name, ok: false, error: err.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SOS Sales — Sync Manual de Conversas WAHA');
  console.log(`  Target: ${API_URL}`);
  console.log('═══════════════════════════════════════════════════════');

  // Checa se a API está up
  try {
    const health = await fetch(`${API_URL}/health`);
    const hBody = await health.json().catch(() => ({}));
    console.log(`\n🏥 Health check: ${health.status} ${JSON.stringify(hBody)}`);
  } catch (err) {
    console.error(`\n❌ API não acessível em ${API_URL}: ${err.message}`);
    console.error('   Certifique-se de que o Docker Lab está rodando:');
    console.error('   docker compose -f docker-compose.lab.yml up -d');
    process.exit(1);
  }

  const results = [];
  for (const ws of WORKSPACES) {
    const result = await syncWorkspace(ws);
    results.push(result);
    // Aguarda 1s entre syncs para não sobrecarregar o WAHA
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    const status = r.ok ? '✅' : '❌';
    const contacts = r.body?.syncedContacts ?? '-';
    const messages = r.body?.syncedMessages ?? '-';
    console.log(`  ${status} ${r.name.padEnd(30)} contatos: ${String(contacts).padStart(3)} | msgs: ${String(messages).padStart(5)}`);
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length} workspace(s) falharam. Verifique se o WAHA está conectado para essas sessões.`);
    console.log('   Para reconectar, acesse Configurações > Canais no CRM.\n');
  } else {
    console.log('\n🎉 Sync concluído com sucesso para todos os workspaces!\n');
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
