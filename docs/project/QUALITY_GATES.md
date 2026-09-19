# Quality Gates — SOS Sales V3

## G0 — Charter

- problema, público e valor definidos;
- fronteira e non-goals aprovados;
- métrica de resultado definida.

## G1 — Spec

- fluxo normal e falhas;
- contratos, dados e estados;
- critérios Given/When/Then;
- dependências e métricas;
- requisitos congelados antes do código.

## G2 — Design e arquitetura

- UX e estados universais quando houver interface;
- ADR/diagrama quando houver decisão durável;
- threat model e RLS/PII;
- estratégia de migration e rollback;
- revisões CEO, design, engenharia e DevEx aplicáveis.

## G3 — Ready to build

- ownership de arquivos sem sobreposição;
- ordem de integração;
- test plan e fixtures;
- feature flags para efeitos externos;
- observabilidade e runbook previstos;
- prompt técnico com ID único do pacote.

## G4 — Code complete

- diff delimitado;
- typecheck e build;
- lint real quando configurado;
- unitários, contratos e DB tests;
- sem segredos, mocks de produção ou escopo extra;
- migration compatível.

## G5 — Revisão independente

- revisor diferente do executor;
- contexto limpo e modo read-only;
- confrontação spec → diff → teste → evidência;
- zero P0/P1;
- P2 com responsável e prazo.

## G6 — QA integrado

- checkout limpo do SHA candidato;
- Docker Lab;
- PostgreSQL, Redis e servidor HTTP reais;
- concorrência e falhas proporcionais ao risco;
- browser/a11y quando houver UI;
- E2E e negative paths.

## G7 — Release readiness

- imagem imutável por digest;
- SBOM e scan;
- migration expand/contract;
- backup/restore e rollback ensaiados;
- dashboards, alertas e runbooks;
- sem credenciais de laboratório.

## G8 — Piloto

- Haven em shadow primeiro;
- side effects habilitados separadamente;
- writer único;
- inbound antes de outbound;
- CAPI Test Events antes de produção;
- janela, suporte e rollback definidos.

## G9 — Verificação em produção

- smoke no mesmo digest;
- verificação 24h, 72h e 7d;
- reconciliação de dados;
- SLO e error budget;
- status `VERIFIED_PRODUCTION` somente após evidência real.

## G10 — Fechamento

- evidência indexada ao SHA;
- dívida residual registrada;
- retro e learnings;
- decisão explícita de continuar, adiar ou parar.

## Evidência mínima

Cada evidência registra:

- `evidence_id`;
- commit SHA ou image digest;
- comando exato e exit code;
- timestamp e ambiente;
- artefato/log redigido;
- limitação e validade;
- executor e revisor.

Mudança posterior ao SHA invalida a evidência. Mock comprova contrato local, não integração externa. Screenshot comprova apenas o estado visual mostrado.
