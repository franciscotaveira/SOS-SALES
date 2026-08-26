# Workflow WABA Vendável — Goal Loop

> Pipeline encadeado de skills onde cada fase alimenta a próxima, com agentes paralelos dentro de cada fase.
> Insumo inicial: `REVISAO_DIFF_2026-08-18.md` (problemas já mapeados).
> Executor: Claude Code (Sonnet 5) em modo goal loop (`/loop`).

---

## Objetivo (condição de parada do loop)

O WABA está "vendável" quando TODAS as condições abaixo forem verdadeiras:

1. **Zero dados fabricados** em UI de produção (WabaActionsModal, MessengerInsightsPanel, ConnectionManager) — tudo vem de API real ou é ocultado.
2. **Zero credenciais hardcoded** (Meta App ID, Config ID, verify token, workspace UUID → env/config).
3. **4 bugs de backend corrigidos**: tenant scoping no `account_update`, escritores de `pipeline_stage` coordenados, mismatch WON/NEGOTIATION, throttle `delaySeconds` aplicado.
4. **1 único ponto de entrada** para Embedded Signup; CTA WABA em 1 lugar, não 3.
5. **`npm run check` verde** (check:web + check:api).
6. **`/qa` aprova os 5 fluxos críticos**: conectar canal WABA, enviar mensagem supervisionada, mass broadcast com throttle, embedded signup, recebimento via webhook.
7. Classes Tailwind inválidas removidas; conformidade com `PROMPT_REFINAMENTO_VISUAL.md`.

---

## Arquitetura de fases (cada uma alimenta a próxima)

```
FASE 0 — DIAGNÓSTICO (3 agentes em PARALELO)
├── Agente A: /qa-only        → fluxos WABA no browser: o que funciona vs. fachada
├── Agente B: /investigate    → causa raiz dos 4 bugs backend (§1 do relatório)
└── Agente C: /design-review  → conformidade visual vs. PROMPT_REFINAMENTO_VISUAL.md
        ↓ (merge: MATRIZ REAL×FACHADA — insumo da Fase 1)

FASE 1 — PRODUTO (sequencial, precisa do diagnóstico completo)
├── /office-hours       → definir "WABA vendável": as 3-5 funções que fecham venda
└── /plan-ceo-review    → priorizar escopo, cortar o que não vende (ex.: aba LTV, card Roadmap 2026)
        ↓ (output: ESCOPO PRIORIZADO)

FASE 2 — ENGENHARIA (paralelo parcial)
├── /spec ×4 em PARALELO (1 agente por workstream, ver abaixo)
└── /plan-eng-review    → trava arquitetura dos 4 specs juntos (sequencial, após specs)
        ↓ (output: 4 SPECS APROVADOS)

FASE 3 — EXECUÇÃO (4 agentes em PARALELO, workstreams sem interseção de arquivos)
├── WS1 backend-fixes   : waba-webhook.ts, pipeline_stage, WON/NEGOTIATION, throttle broadcast
├── WS2 dados-reais     : WabaActionsModal, MessengerInsightsPanel, ConnectionManager (card roadmap)
├── WS3 seguranca       : EmbeddedSignupModal (creds→env), SupervisedComposer (UUID→config)
└── WS4 visual-ux       : Tailwind inválido (AppShell, EmbeddedSignupModal), CTA triplicado,
                          Embedded Signup ponto único, regressões AppShell (§5)
        ↓ (gate: npm run check verde por workstream)

FASE 4 — VERIFICAÇÃO (sequencial)
├── /review             → revisão do diff completo das 4 workstreams
├── /qa                 → re-teste dos 5 fluxos críticos no browser
└── se falhar → volta à Fase 3 só com os itens reprovados (é isso que o goal loop itera)

FASE 5 — ENTREGA
└── /ship               → commit(s) por workstream + push (pedir confirmação antes do push)
```

### Regras de paralelismo

- Fase 0: os 3 agentes são independentes — disparar juntos numa única mensagem.
- Fase 2: os 4 `/spec` são independentes — paralelo; `/plan-eng-review` só depois, pois precisa ver os 4 juntos (evita specs que colidem na mesma tabela/rota).
- Fase 3: workstreams desenhadas para **não tocar os mesmos arquivos**. Exceção conhecida: `EmbeddedSignupModal.tsx` aparece em WS3 (creds) e WS4 (Tailwind/ponto único) → WS3 executa PRIMEIRO nesse arquivo, WS4 rebaseia depois. Alternativa: usar `isolation: worktree` por agente.
- Fases 1, 4, 5: sequenciais por natureza (decisão humana / verificação de estado global).

### Restrições invioláveis (repassar a TODO agente)

1. Raiz usa **Bun** (`bun.lock`); `apps/api` usa **npm** (`package-lock.json`). Nunca misturar.
2. Nenhum segredo em código-fonte — env/config apenas. Nunca commitar `.env*`.
3. Isolamento multi-tenant é lei (commits 216d43b, 1ed4cc9, 8c64a00): toda query nova escopada por tenant.
4. Gates: `npm run check:web`, `npm run check:api` antes de considerar workstream pronta.
5. Não reverter os acertos listados no §5 do relatório (espaçamento nav, footer, h-9, tokens `--sos-*`).
6. Fluxo: dev local → Docker Lab (localhost:3333) → VPS. Nunca pular etapas; deploy só via `/ship`.

---

## PROMPT DE ATIVAÇÃO (copiar e colar no Claude Code / Sonnet 5)

```
/loop Objetivo: tornar o canal WABA do SOS-SALES vendável, eliminando toda função-fachada.

Leia primeiro: WORKFLOW_WABA_GOAL_LOOP.md (este arquivo define fases, agentes paralelos, workstreams, restrições e a condição de parada) e REVISAO_DIFF_2026-08-18.md (problemas já mapeados — não redescubra, parta deles).

Execute o pipeline fase a fase:

FASE 0: dispare em paralelo /qa-only (5 fluxos WABA: conectar canal, mensagem supervisionada, mass broadcast, embedded signup, webhook), /investigate (4 bugs backend do §1) e /design-review (contra PROMPT_REFINAMENTO_VISUAL.md). Consolide numa matriz REAL×FACHADA.

FASE 1: /office-hours para definir as 3-5 funções WABA que fecham venda, depois /plan-ceo-review para priorizar e cortar escopo morto (aba LTV, card Roadmap 2026). Se eu não responder em modo autônomo, adote a recomendação padrão do relatório e registre a decisão em DECISION_LOG.md.

FASE 2: gere 4 /spec em paralelo (backend-fixes, dados-reais, seguranca, visual-ux) e trave com /plan-eng-review.

FASE 3: execute as 4 workstreams em agentes paralelos (arquivos sem interseção; EmbeddedSignupModal: WS3 antes de WS4). Gate por workstream: npm run check verde. Restrições: Bun na raiz / npm em apps/api, nunca misturar; zero segredos em código; toda query escopada por tenant; não reverter os acertos do §5.

FASE 4: /review no diff completo, depois /qa nos 5 fluxos. Itens reprovados voltam à Fase 3 — este é o corpo do loop.

FASE 5: /ship com commits separados por workstream. Pare ANTES do push e peça minha confirmação.

Condição de parada do loop: as 7 condições da seção "Objetivo" do WORKFLOW_WABA_GOAL_LOOP.md verdadeiras, OU 3 iterações completas de Fase 3→4 sem progresso (nesse caso, pare e apresente o bloqueio).

A cada iteração, registre progresso em WORKFLOW_WABA_PROGRESS.md (fase atual, condições ✅/❌, próximo passo).
```

---

## Observações de operação

- **Modelo**: Sonnet 5 no loop principal; workstreams da Fase 3 podem rodar em Sonnet; diagnóstico da Fase 0 e `/plan-eng-review` beneficiam de effort alto.
- **Fase 1 em modo autônomo**: `/office-hours` e `/plan-ceo-review` são interativas. No goal loop, o agente adota a recomendação padrão e registra em `DECISION_LOG.md` — revisar depois.
- **Retomada**: se o loop for interrompido, `WORKFLOW_WABA_PROGRESS.md` é o checkpoint; reative com o mesmo prompt.
- **Custo**: Fase 0 e Fase 3 são os picos (7 agentes no total). Fases 1-2 são leves.
