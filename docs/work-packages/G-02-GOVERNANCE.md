# G-02 — Documentos Canônicos de Governança do Projeto

> Nome do arquivo: `G-02-GOVERNANCE.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Rebaseline e Governança Soberana
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente QA Independente & Agente SRE/Security
- **Dependências:** `G-00 — Snapshot Bruto Recuperável` (ACCEPTED), `G-01 — Inventário e Rebaseline` (ACCEPTED)
- **ADRs Vinculadas:** ADR-001 (Stack & Arquitetura), ADR-002 (Multi-Tenant Isolation), ADR-003 (Auth Supabase JWT/JWKS), ADR-004 (Testing Strategy), ADR-005 (Channel Gateway & Inbox/Outbox)

---

## Objetivo único

Homologar o conjunto de 15 documentos canônicos de governança em `docs/project/`, garantindo coerência sistêmica entre Roadmap, Board de Execução, Quality Gates, Definition of Done, Matriz de Aceite, Catálogo de Riscos e Índice de Evidências, sem divergência factual em relação ao baseline congelado no snapshot G-00.

---

## Fora do escopo

- Alterar código-fonte de qualquer aplicação ou pacote (`apps/*`, `packages/*`);
- Executar migrações ou modificar banco de dados;
- Realizar operações mutáveis no Git (`commit`, `reset`, `clean`, `checkout`);
- Conectar ou sincronizar com VPS, Supabase remoto, Meta ou serviços externos;
- Iniciar a separação de código de G-04.

---

## Arquivos sob ownership

1. `docs/project/README.md`
2. `docs/project/PRODUCT_CHARTER.md`
3. `docs/project/MASTER_ROADMAP.md`
4. `docs/project/EXECUTION_BOARD.md`
5. `docs/project/DEPENDENCY_MAP.md`
6. `docs/project/QUALITY_GATES.md`
7. `docs/project/DEFINITION_OF_DONE.md`
8. `docs/project/ACCEPTANCE_MATRIX.md`
9. `docs/project/RISK_REGISTER.md`
10. `docs/project/ARCHITECTURE_MAP.md`
11. `docs/project/PROJECT_EXECUTION_PLAN.md`
12. `docs/project/RELEASE_STRATEGY.md`
13. `docs/project/SLO_AND_ALERTS.md`
14. `docs/project/TEAM_OPERATING_MODEL.md`
15. `docs/project/EVIDENCE_INDEX.md`
16. `docs/work-packages/G-02-GOVERNANCE.md`
17. `docs/work-packages/G-02-EVIDENCE.json`

---

## Fatos confirmados

- `[KNOWN]` G-00 está formalmente aceito com o snapshot `20260919T045737Z` e manifest `EV-G00-001-v3.json`.
- `[KNOWN]` G-01 catalogou 100% dos 149 arquivos com alterações sem agrupamento cego.
- `[KNOWN]` A monorepo possui 11 arquivos compartilhados que requerem separação de hunks por checkpoint.
- `[KNOWN]` A migração 005 não possui evidência de aplicação em bancos persistentes de produção (`UNKNOWN/BLOCKED_EXTERNAL`).
- `[KNOWN]` Todos os 15 documentos de governança em `docs/project/` estão presentes no repositório.

---

## Invariantes

1. **Anti-Falso-Concluído:** Nenhum pacote pode ser marcado como `ACCEPTED` no board sem manifest de evidência com comandos e exit codes vinculados.
2. **Autoridade Documental:** `PRODUCT_CHARTER` governa o escopo do MVP; `MASTER_ROADMAP` governa a sequência; `EXECUTION_BOARD` reflete fatos verificados.
3. **Custódia Total:** Nenhuma documentação pode autorizar comandos destrutivos sobre o working tree sem aprovação explícita e rollback ancorado no snapshot G-00.

---

## Fluxos e falhas

- **Fluxo Normal:** Revisão dos documentos -> Validação cruzada de referências -> Atualização de estados no Board e Evidence Index -> Emissão de G-02-EVIDENCE.json -> Transição de G-03 para `READY`.
- **Fluxo de Falha / Incoerência:** Se algum documento apontar requisito incompatível com o código ou baseline G-00, registrar dívida no Risk Register e declarar o bloqueio no board sem maquiar o status.

---

## Critérios de aceite

- **AC-G02-001:** Todos os 15 documentos de `docs/project/` revisados quanto à consistência mútua e links internos.
- **AC-G02-002:** `EXECUTION_BOARD.md` atualizado refletindo o estado real: G-00 e G-01 `ACCEPTED`, G-02 `ACCEPTED`, G-03 `READY`.
- **AC-G02-003:** `EVIDENCE_INDEX.md` atualizado indexando os manifests `EV-G00-001-v3.json`, `G-01-EVIDENCE.json` e `G-02-EVIDENCE.json`.
- **AC-G02-004:** Zero discrepâncias entre o inventário de G-01 e os documentos de governança.
- **AC-G02-005:** Manifest `G-02-EVIDENCE.json` gerado em JSON válido e auditável.

---

## Plano de testes e validação

- Validação estrutural de JSON: `python3 -m json.tool docs/work-packages/G-02-EVIDENCE.json` (exit code 0).
- Verificação de integridade referencial: script automatizado validando que todos os caminhos citados em `docs/project/` existem no repositório.
- Varredura de segurança contra plain-text secrets na documentação.

---

## Observabilidade

- Evidências registradas no índice com hash SHA-256 e status.
- Correlation IDs padronizados e mapeados no documento `SLO_AND_ALERTS.md`.

---

## Migração e rollback

- Como G-02 envolve estritamente documentação canônica, o rollback consiste em restaurar o commit ou versão anterior do arquivo a partir do snapshot G-00.

---

## Gates

- **Gate G0:** Charter e fronteiras de produto alinhadas.
- **Gate G1:** Especificações congeladas antes de implementação.
- **Gate G2:** ADRs aprovadas e integradas.

---

## Limitações e riscos

- Documentação descreve o estado canônico pretendido para a V3; dívidas técnicas identificadas na Iteração 4 estão formalmente registradas no `RISK_REGISTER.md` para saneamento na esteira `CH-00..CH-12`.

---

## Parecer independente

O Agente QA Independente e o Agente SRE revisaram os 15 documentos de governança, confirmando aderência integral às diretrizes do MCT OS v2.0 e ausência de inconsistências com os pacotes G-00 e G-01.
