# SOS Sales — Estado de Continuidade para Implementação

Atualizado em: 2026-08-15

Branch: `codex/import-latest-zip`

Baseline remoto: `bff6c1f`

## Regra de leitura

Este documento registra somente o que foi verificado no checkout. Use quatro estados:

- `IMPLEMENTED_AND_VERIFIED`
- `IMPLEMENTED_NOT_HOMOLOGATED`
- `BLOCKED_EXTERNAL`
- `NOT_IMPLEMENTED`

Não confunda testes locais com homologação de fornecedor ou produção.

## Baseline verificado

| Componente | Estado | Evidência |
|---|---|---|
| Monorepo frontend + API | IMPLEMENTED_AND_VERIFIED | `npm run check` passou |
| Frontend TypeScript/build | IMPLEMENTED_AND_VERIFIED | Vite build; bundle principal ~305 KB |
| API TypeScript/testes/build | IMPLEMENTED_AND_VERIFIED | 27 arquivos e 191 testes passaram |
| Migrations locais 00001–00007 | IMPLEMENTED_AND_VERIFIED | `npm run db:reset` e `npm run db:wait` passaram |
| Known Facts HTTP auditável | IMPLEMENTED_AND_VERIFIED | JWT, RLS, idempotência e 4 testes de API |
| Traffic Proof API-mode | IMPLEMENTED_AND_VERIFIED | tela real; gasto/ROAS ausentes permanecem `null` |
| Supabase remoto | BLOCKED_EXTERNAL | acesso de escrita e migrations remotas ainda não homologados |
| VPS | BLOCKED_EXTERNAL | falta acesso SSH válido após recriação |
| WAHA inbound real | IMPLEMENTED_NOT_HOMOLOGATED | código local existe; sessão SOS isolada e webhook HTTPS ainda não provados |
| WAHA outbound real | NOT_IMPLEMENTED | state machine existe, mas não há envio homologado nem retry seguro |
| Meta spend/CAPI real | NOT_IMPLEMENTED | não apresentar ROAS sem importação factual |

## Próxima ordem obrigatória

1. Inspecionar Supabase remoto e aplicar migrations em staging somente com acesso oficial de escrita.
2. Implementar e testar adapters server-only do runtime de produção; nunca contornar o guard com `NODE_ENV=development`.
3. Conectar no frontend as mutações reais de handoff, fatos, follow-up, estágio e outcome.
4. Ocultar em API mode tudo que ainda for simulação: Group Hub, ping/failover, QA, troca de role e automação fictícia.
5. Criar Dockerfiles, Compose de produção, Caddy/TLS, env templates, backup e rollback.
6. Obter acesso SSH novo à VPS `179.197.72.221` e publicar primeiro com outbound desabilitado.
7. Homologar WAHA inbound isolado em `127.0.0.1:3002` com webhook HTTPS e deduplicação real.
8. Só considerar outbound após prova determinística de idempotência e reconciliação de timeout.
9. Executar E2E Golden Path e registrar evidências de produção.

## Gates locais

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
git status --short --branch
git diff --check
npm run check

cd apps/api
npm run db:reset
npm run db:wait
```

## Bloqueios que exigem Francisco

### Supabase

- Habilitar acesso controlado de escrita ou fornecer o mecanismo oficial de deployment de migrations.
- Nunca fornecer `service_role` ao frontend.

### VPS

- Fornecer chave SSH/usuário autorizado ou senha temporária nova.
- Não reutilizar credenciais do CRM-TX.

### WAHA

- Ler o QR Code da nova sessão isolada quando solicitado.
- Não reutilizar a sessão/volume legado.

## Critério de produção

Produção somente após Supabase remoto, Auth/RLS, VPS/TLS/firewall, health/readiness, WAHA inbound real, restart, backup/restore, isolamento de tenant e Golden Path E2E apresentarem evidência executada. Outbound pode permanecer desligado durante o piloto supervisionado.
