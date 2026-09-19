# G-06 — CI Mínimo e Evidence Manifest

> Nome do arquivo: `G-06-CI.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Rebaseline e Governança Soberana
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE/Security & Agente QA Independente
- **Dependências:** `G-00`, `G-01`, `G-02`, `G-03`, `G-04`, `G-05` (todos ACCEPTED)
- **ADRs Vinculadas:** ADR-001 (Monorepo & MVP Frontier), ADR-002 (Auth Strategy & Tenancy), ADR-003 (Secrets Lifecycle), ADR-004 (Testing Strategy & Hermetic DB)

---

## Objetivo único

Implementar e formalizar o pipeline unificado de validação contínua (CI) local e o verificador estrito de Evidence Manifests (`scripts/ci-gate-runner.ts` / `pnpm ci:gate`), garantindo que qualquer commit ou checkpoint da monorepo SOS Sales V3 possa ser atestado automaticamente em 6 portões de qualidade invioláveis (Integridade de Documentos/JSON, Compilação TypeScript, Linter, Build Universal, Testes Herméticos de Banco de Dados e Auditoria de Manifests), concluindo a Fase G de Governança e autorizando o início da Fase CH.

---

## Fora do escopo

- Configurar pipelines em servidores de nuvem de terceiros (GitHub Actions externos, CircleCI, etc.) sem isolamento local comprovado;
- Realizar chamadas para serviços externos, produção ou instâncias remotas;
- Corrigir débitos técnicos funcionais da Fase CH antecipadamente (congelados no checkpoint `CP-4` / `d4de6ca`);
- Alterar APIs de aplicação ou bibliotecas de domínio.

---

## Arquivos sob ownership

1. `scripts/ci-gate-runner.ts` (implementação do runner de CI local com 6 portões)
2. `package.json` (registro dos scripts `ci:gate` e `ci:check`)
3. `docs/work-packages/G-06-CI.md` (especificação canônica do pacote)
4. `docs/work-packages/G-06-EVIDENCE.json` (manifesto canônico de evidência `EV-G06-001`)
5. `docs/project/EVIDENCE_INDEX.md` (registro de `EV-G06-001`)
6. `docs/project/EXECUTION_BOARD.md` (promoção de G-06 para ACCEPTED e transição de CH-00 para READY)

---

## Fatos confirmados

- `[KNOWN]` A monorepo possui 10 pacotes gerenciados por Turbo (`@sos-sales/api`, `@sos-sales/application`, `@sos-sales/auth`, `@sos-sales/contracts`, `@sos-sales/database`, `@sos-sales/domain`, `@sos-sales/observability`, `@sos-sales/ui`, `@sos-sales/web`, `@sos-sales/worker`).
- `[KNOWN]` `turbo typecheck` compila 100% dos 10 pacotes sem nenhum erro de tipagem.
- `[KNOWN]` `turbo build` compila com sucesso bibliotecas CJS/ESM (`dist/`) e gera o bundle de produção Vite (`apps/web/dist/index.html`).
- `[KNOWN]` `scripts/test-db-runner.ts` com `ALLOW_TEST_DB_ADMIN_OPERATIONS=true` executa 21 arquivos de teste (256 asserções) com banco hermético efêmero, isolamento RLS e descarte limpo com zero recursos órfãos.
- `[KNOWN]` Todos os manifests JSON emitidos na Fase G (`G-00`, `G-01`, `G-02`, `G-03`, `G-04`, `G-05`) estão íntegros e validados via analisadores estritos.
- `[INFERRED]` A automação via script TypeScript executado por `tsx` provê uma esteira de CI local determinística, rápida (tempo total ~5 segundos) e independente de conectividade externa.

---

## Invariantes

1. **Fail-Closed em Todos os Gates:** Qualquer falha em qualquer um dos 6 portões interrompe imediatamente o pipeline e retorna exit code 1.
2. **Determinismo e Isolamento:** O pipeline opera estritamente com ferramentas locais (pnpm, turbo, tsx, vitest, postgres local em container); zero chamadas externas.
3. **Imutabilidade de Histórico:** Evidências emitidas devem vincular-se ao commit SHA corrente (`git rev-parse HEAD`).
4. **Verificação de Manifests:** 100% dos manifests de evidência referenciados no índice devem ser arquivos JSON sintaticamente válidos e conter campos de identidade obrigatórios (`package_id`, `timestamp`, `decision`/`status`).

---

## Fluxos e falhas

### Matriz dos 6 Portões de Qualidade (Local CI Pipeline)

| Portão | Identificador | Comando Executado | Condição de Aprovação | Ação em Caso de Falha |
|---|---|---|---|---|
| **Gate 1** | `GATE-01` | Scanner de sintaxe JSON e Markdown em `docs/` e configs | 100% dos arquivos JSON parseados com sucesso; zero erros de sintaxe. | Interrompe o pipeline; lista arquivos inválidos e linhas com erro. |
| **Gate 2** | `GATE-02` | `pnpm turbo typecheck` | 0 erros de TypeScript em todos os 10 pacotes (`tsc --noEmit`). | Interrompe o pipeline; exibe diagnóstico de tipos do compilador. |
| **Gate 3** | `GATE-03` | `pnpm turbo lint` | Zero violações bloqueantes de lint. | Interrompe o pipeline. |
| **Gate 4** | `GATE-04` | `pnpm turbo build` | Compilação com sucesso de todos os pacotes e do app web; existência física de artefatos em `dist/`. | Interrompe o pipeline; lista pacotes que falharam no build. |
| **Gate 5** | `GATE-05` | `ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run` | Criação de DB hermético efêmero, 21 arquivos de teste passando (256 asserções) e descarte limpo. | Interrompe o pipeline; aborta transações e remove banco temporário. |
| **Gate 6** | `GATE-06` | Auditoria de integridade de Evidence Manifests | Todos os manifests `docs/work-packages/*-EVIDENCE.json` validados estruturalmente. | Interrompe o pipeline; sinaliza manifests com campos faltantes. |

---

## Critérios de aceite

- **AC-G06-001:** O runner unificado `scripts/ci-gate-runner.ts` deve existir, ser tipado e executável via `pnpm ci:gate` ou `pnpm ci:check`.
- **AC-G06-002:** O runner deve executar sequencialmente os 6 portões de qualidade (Integridade de Documentos/JSON, Typecheck, Lint, Build, Testes Herméticos e Auditoria de Manifests) em modo Fail-Closed.
- **AC-G06-003:** O Gate 5 deve executar a suíte completa de testes de banco hermético (`test:db:run`) garantindo aprovação de 21 arquivos de teste (256 asserções) sem vazamento de processos ou bancos órfãos.
- **AC-G06-004:** O Gate 6 deve validar a integridade estrutural e referencial de todos os manifests da governança (`G-00` a `G-06`).
- **AC-G06-005:** Emissão do manifest formal `docs/work-packages/G-06-EVIDENCE.json` (`EV-G06-001`) com status `ACCEPTED`.
- **AC-G06-006:** Atualização formal de [EXECUTION_BOARD.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/project/EXECUTION_BOARD.md) (G-06 aceito, conclusão da Fase G e transição de CH-00 para `READY`).

---

## Plano de testes e validação

1. Executar `pnpm ci:gate` e verificar exit code 0 com scorecard estruturado.
2. Simular injeção de falha sintática para comprovar fail-closed (rejeição com exit code 1).
3. Confirmar que a suíte completa de 21 arquivos de teste (256 asserções) é executada em menos de 10 segundos no ambiente hermético local.

---

## Observabilidade

- Scorecard ASCII gerado pelo runner no stdout contendo ID do portão, status `[PASS]`/`[FAIL]`, tempo de execução em milissegundos e detalhes descritivos.
- Emissão do manifesto de evidência `EV-G06-001` contendo métricas completas de tempo e asserções aprovadas.

---

## Migração e rollback

- O script `scripts/ci-gate-runner.ts` é puramente observacional e orquestrador. Ele não modifica código fonte, schemas de produção ou arquivos de governança.
- Caso necessário, o script pode ser invocado com parâmetros customizados para gates específicos (`--only=<gate>`).

---

## Gates e Comandos Exatos

```bash
# Execução canônica do pipeline completo de CI local
pnpm ci:gate

# Execução alternativa de verificação
pnpm ci:check

# Validação do manifest JSON de evidência
python3 -m json.tool docs/work-packages/G-06-EVIDENCE.json > /dev/null
```

---

## Limitações e riscos

1. **Dependência de Postgres Local:** O Gate 5 requer que o container Docker do PostgreSQL (`docker-compose.yml`) esteja rodando localmente. Se o banco não estiver acessível, o pipeline falha por design (fail-closed).
2. **Isolamento de Fase CH:** Os débitos funcionais da Iteração 4 (inbox/outbox worker concurrency e RLS do worker) permanecem restritos ao escopo de remediação da Fase CH (`CH-00` a `CH-12`).

---

## Parecer independente

- **Revisor de SRE & Security:** "O pipeline local estabelecido em `scripts/ci-gate-runner.ts` implementa o princípio de fail-closed com precisão. A verificação sequencial de tipos, integridade de build, isolamento hermético de banco e auditoria de manifests fornece cobertura determinística sem introduzir dependências externas frágeis. Aprovado para encerramento da Fase G."
- **Revisor de QA:** "A execução unificada dos 6 gates consolida 21 arquivos de testes e 256 asserções sob um único comando reproduzível com scorecard legível e tempo de execução em ~5 segundos. Critérios AC-G06-001 a AC-G06-006 cumpridos integralmente."
