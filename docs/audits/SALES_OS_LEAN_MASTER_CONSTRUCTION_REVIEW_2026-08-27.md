# Revisão Crítica — Prompt Mestre de Construção (Sales OS Lean)

> **Tipo:** revisão read-only (nenhum código escrito, nenhuma alteração de runtime/WABA/produção).
> **Alvo:** `docs/audits/SALES_OS_LEAN_MASTER_CONSTRUCTION_PROMPT_2026-08-27.md`
> **Base de comparação:** `Sales-OS-Lean` branch `codex/lean-foundation` (commit base `d5a1eca`), `docs/NEXT_SESSION.md` (Onda 0→1), e portas hexagonais do SOS-SALES (`apps/api/src/application/ports/*`).
> **Data:** 27 Ago 2026
> **Estado do gate:** GSTACK marca CLEARED para Sessão A / Onda 0, condicionado a `GO ONDA 1` textual. Esta revisão não constitui `GO ONDA 1`.

---

## Veredito curto

O spec é forte e defensável. Os invariantes centrais estão bem escolhidos e coerentes entre si:

- `ownership_epoch` monotónico com dono único por `phone_number_id` (nunca reutilizar epoch em rollback).
- Concorrência por `conversation_control` com `control_generation` monotónico + versão optimista.
- Outbox/worker durável em Postgres (nunca `setImmediate`/fire-and-forget para efeitos críticos externos).
- Fail-closed por omissão (`DisabledAgentProvider`, `UNKNOWN_PROVIDER_STATUS`, quarentena de órfãos).
- Abstração de provider de IA por porta (`ConversationAgentPort`).
- Truth labels (`[KNOWN]`/`[INFERRED]`/`[SPECULATIVE]`/`[UNVERIFIED EXTERNAL]`) e gates falsificáveis.

Está pronto para evolução no Lab. Há dívidas transitórias, ambiguidades operacionais e lacunas que só mordem nas ondas WABA/CAPI e devem ser registadas como blockers agora. Nem todos os pontos são contradições lógicas, e nenhum autoriza produção.

---

## Riscos críticos

### 1. Auth transitória sem critério de retirada fechado
- **Baseline (fechada):** `NEXT_SESSION.md` item 2 — identidade derivada de **JWT NextAuth verificado (HS256)**, caminho Lab atrás de gate.
- **Alvo (canónico):** §3.2 / ADR 2 tornam **Supabase Auth** a fonte de verdade; NextAuth fica `RETIRE_AFTER_PARITY`.
- **Problema:** não é contradição fatal, mas a etapa foi fechada sem critério de retirada falsificável.
- **Acção:** como ainda estamos no Lab, fazer cutover direto para Supabase Auth e evitar dois emissores sem necessidade produtiva.

### 2. Handoff WABA entre SOS blue e Lean está subespecificado
- `reuse-manifest.md` e o spec afirmam SOS como **fonte de reuso seletivo, não dependência de runtime**.
- GSTACK UNRESOLVED #1 admite **manter SOS como runtime blue durante o strangler**.
- **Problema:** as afirmações são compatíveis; o Lean pode não depender do SOS enquanto o SOS continua blue. O risco real é dupla titularidade/processamento do mesmo número.
- **Acção:** SOS permanece único owner real até cutover; Lean recebe somente fixtures, replay ou espelhamento observer sem outbound/CAPI. Handoff exige drenagem, epoch central, fencing e rollback com epoch novo.

### 3. CAPI — correção de outcome vs. dedup/supersession da Meta
- O spec deriva `event_id` determinístico por `workspace + journey + outcome-version`; uma correção de outcome gera nova `outcome-version` → novo `event_id`.
- **Problema:** a interação entre esse novo `event_id` e o dedup/supersession do lado da Meta não está especificada. Uma correção legítima arrisca dupla contagem.
- **Acção:** especificar semântica de supersession (como a Meta trata o par antigo/novo `event_id`) **antes** de `CAPI_TEST`. Pode ficar para a onda de CAPI, mas registado como blocker agora.

### 4. Blast radius do plano de dados único
- Haven pilot usa o **mesmo projeto/DB Supabase** (single data plane, sem buffer de staging entre Lab e prod do piloto).
- **Problema:** raio de dano elevado; sem tampão, um erro no piloto toca o mesmo plano de dados.
- **Acção:** separar planos de dados de Lab e produção antes do piloto real. Exceção exige autorização, backup/restore testado e privilégios mínimos.

---

## Lacunas de especificação

5. **Sem gate numérico de cobertura de testes.** O padrão do utilizador é 80%. §11 tem 12 cenários P0 e integridade de teste, mas nenhum limiar numérico no CI. Adicionar.
6. **Cancelamento atómico de follow-up (P0 #8)** aparece nos cenários mas não está no modelo de domínio §5.4. Especificar o mecanismo (estado + transição atómica).
7. **Precedência epoch vs. generation.** Não há semântica definida para quando `ownership_epoch` é válido mas `control_generation` está stale (ou vice-versa). Definir a ordem de validação e o resultado.
8. **LGPD ausente.** Sem retenção, direitos do titular, ou base de consentimento. Deve entrar num DoD de GA + ADR próprio.
9. **Instabilidade do North Star.** Closed-Loop Coverage fica ruidoso sob baixa cobertura de atribuição (denominador pequeno). Definir piso de cohort ou banda de confiança.

---

## Dependências externas Meta

Corretamente rotuladas `[UNVERIFIED EXTERNAL]`. A credibilidade do roadmap depende de aprovações fora de controlo (elegibilidade WABA, Business Agent). Manter UNRESOLVED #4/#5 como blockers formais; não deixar o roadmap prometer datas ancoradas em aprovações da Meta.

---

## Bem calibrado (manter)

- STOP gates + "não interprete este prompt como `GO ONDA 1`".
- Denylist §4.2 alinhada com os commits QA recentes (isolamento de avatares por workspace, remoção de mocks de intelligence, falha explícita de templates WABA, agenda simulada fail-closed).
- Honestidade `DONE_WITH_CONCERNS` em vez de verde forçado.
- Pureza hexagonal das portas SOS confirmada (`webhook-secret-provider` proíbe importar Fastify/PG/Supabase; `OutboundDispatchNotFoundError` mantém ausência e cross-workspace indistinguíveis).

---

## Recomendação de prioridade

Antes de qualquer integração externa:

1. Corrigir a verdade de estado: Haven possui observer local em memória/console, não conexão real.
2. Fechar ADR 0001 com cutover direto para Supabase Auth no Lab.
3. Fechar ADR 0002 mantendo SOS blue como owner único até cutover autorizado.
4. Separar planos de dados de Lab e produção.

Podem ficar para as Ondas 6/8 mas **registados como blockers agora**:

5. **#3** (supersession CAPI) — antes de `CAPI_TEST`.
6. **#8** (LGPD) — num DoD de GA.

Nada nesta revisão exige tocar WABA/produção. Se a resolução de qualquer item mover para número/token/webhook/CAPI reais, **parar e pedir autorização explícita + evidência de Lab** — não avançar por conta própria.
