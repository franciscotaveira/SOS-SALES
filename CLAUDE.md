# SOS-SALES

Cockpit comercial para continuidade de vendas no WhatsApp (WAHA + Meta WABA Cloud API).
Detalhes de arquitetura e stack: ver `CODEBASE.md` e `BLUEPRINT_SOS_SALES.md`.

- Frontend (raiz): React 19 + Vite, gerenciado com **Bun** (`bun run dev`, `npm run check:web`)
- API (`apps/api`): Fastify 4 + Postgres/Supabase, gerenciada com **npm** (`npm run check:api`)
- Nunca misturar gerenciadores: raiz usa `bun.lock`, `apps/api` usa `package-lock.json`

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
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
