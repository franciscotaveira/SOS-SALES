# <ID CANÔNICO> — Título

> Nome do arquivo: `<ID>-<SLUG>.md`, por exemplo `CH-01-WORKER-RLS.md`.

## Identidade

- Parent objective:
- Estado:
- Owner:
- Reviewer:
- Dependências:
- ADRs:

## Objetivo único

Resultado verificável deste pacote.

## Fora do escopo

Itens explicitamente proibidos nesta execução.

## Arquivos sob ownership

Lista fechada. Sobreposição exige decisão do orquestrador.

## Fatos confirmados

Separar `[KNOWN]`, `[INFERRED]` e `[SPECULATIVE]`.

## Invariantes

Condições que não podem ser violadas.

## Fluxos e falhas

Happy path, erros, concorrência, indisponibilidade e recuperação.

## Critérios de aceite

Given/When/Then com AC-IDs.

## Plano de testes

- testes que falham antes;
- unitários;
- banco/roles;
- contrato/HTTP;
- concorrência;
- E2E;
- browser, quando aplicável.

## Observabilidade

Logs, métricas, traces, alertas e correlation IDs.

## Migração e rollback

Compatibilidade, feature flag, backfill e reversão.

## Gates

Comandos exatos e evidências esperadas.

## Limitações e riscos

Não esconder dependências externas ou itens não testados.

## Parecer independente

Revisor read-only diferente do implementador.
