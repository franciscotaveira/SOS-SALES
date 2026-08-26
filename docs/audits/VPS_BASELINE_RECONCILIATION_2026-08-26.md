# Reconciliação VPS → Docker Lab — 2026-08-26

## Decisão

O VPS passa a ser a referência observada para auditoria de regressão. O Docker Lab possui dois frontends independentes:

- `http://localhost:3334`: baseline extraído dos artefatos implantados no VPS;
- `http://localhost:3333`: candidato construído do código-fonte com correções.

Nenhum arquivo, container ou configuração do VPS foi alterado.

## Proveniência congelada

| Item | VPS / baseline |
|---|---|
| Release | `v2.0.0-prod` |
| Commit declarado | `e773ec7a40a69fb50ea53facf1ce82c98bb2e55b` |
| Árvore declarada | `cleanTree:false` |
| API `index.js` SHA-256 | `1ff83128bf0206f3275234a88d93f874d7cf72b3dbc5a9f480b7ae3455cf01b7` |
| Frontend implantado | `assets/index-DFe6Nq_B.js` |

O VPS não possui o checkout Git completo. Como a release foi construída com árvore suja, o source exato do frontend não é recuperável somente a partir do bundle minificado. O artefato implantado foi preservado como baseline de comportamento.

## Isolamento do baseline

O snapshot local fica em `.audit/vps-baseline-e773ec7/`, ignorado pelo Git. O frontend é byte a byte o artefato do VPS antes da construção da imagem. Dentro da imagem de Lab, somente três valores são relocalizados:

1. URL Supabase de produção → Supabase local;
2. origem da API de produção → proxy relativo do Lab;
3. chave pública Supabase de produção → chave pública do Lab.

Credenciais, `.env`, sessões WAHA, banco, mídia e dados de clientes não são copiados.

## Evidência antes/depois

| Cenário | Baseline VPS `3334` | Candidato `3333` |
|---|---|---|
| Login Supabase Lab | PASS | PASS |
| `/workspaces`, `/journeys`, `/priorities`, `/cockpit`, `/agent/config` | HTTP 200 | HTTP 200 |
| Avatar do contato | FAIL: consulta workspace hardcoded `2222...`, HTTP 403 | PASS: usa workspace autenticado `a000...` |
| Command Palette | Declara busca de leads sem implementá-la | Declara apenas telas e comandos |
| Copilot local | Possuía caminhos capazes de fabricar agenda/preço | Removido; sugestão depende do backend |
| Console após estabilização | Erros 403 do avatar | Sem erros |

## Gate de continuidade

Antes de qualquer deploy:

1. atualizar o snapshot com `scripts/sync-vps-baseline.sh`;
2. confirmar o SHA da API do Lab contra o VPS;
3. executar a mesma matriz no baseline e no candidato;
4. impedir qualquer request do baseline para domínios de produção;
5. executar build, TypeScript e testes da API;
6. obter autorização explícita para publicar;
7. implantar API antes do frontend e executar smoke autenticado.

Status atual: `READY_FOR_RETEST_IN_LAB`; não autorizado para deploy.
