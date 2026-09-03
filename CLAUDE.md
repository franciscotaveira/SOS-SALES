# SOS-SALES — Claude / Hermes Context

> **LEIA PRIMEIRO:** `AGENTS.md` — bússola universal do projeto (estado atual, fluxo de trabalho, comandos, mapa de arquivos).
> Depois: `CODEBASE.md` para detalhes técnicos, `DECISION_LOG.md` para decisões arquiteturais.

Cockpit comercial para continuidade de vendas via WhatsApp (WAHA + Meta WABA Cloud API v20.0).

- Frontend (raiz): React 19 + Vite + TypeScript, gerenciado com **Bun** (`bun run dev`, `npm run check:web`)
- API (`apps/api`): Fastify 4 + Postgres/Supabase, gerenciada com **npm** (`npm run check:api`)
- **Nunca misturar gerenciadores:** raiz usa `bun.lock`, `apps/api` usa `package-lock.json`
- **Fluxo obrigatório:** `npm run dev` → Docker Lab (localhost:3333) → VPS. Nunca pular etapas.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review (use PROMPT_REFINAMENTO_VISUAL.md as guide)
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Design System

Read DESIGN.md before making visual decisions. Keep typography, colors, spacing, and visual posture aligned with that file unless the user explicitly changes direction.
