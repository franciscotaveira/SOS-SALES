# G-01 — Inventário Canônico e Rebaseline do Projeto

> **Status:** `IMPLEMENTED_PENDING_ORCHESTRATOR_ACCEPTANCE`  
> **Data de Emissão:** 19 de setembro de 2026  
> **Repositório:** `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`  
> **Snapshot de Origem:** `G-00 (20260919T045737Z)` — Estado bruto congelado e recuperável  
> **Commit Base (HEAD):** `a4d9cf13ad8885f2948bf51e1048947845ec38b7` (Consolidação Iteração 2.6)  
> **Branch Atual:** `codex/iteration-2.7`  
> **Regra de Ouro:** Análise e inventário estritamente read-only. Nenhum arquivo foi descartado, revertido, commitado ou reorganizado.

---

## 1. Baseline Atual e Comparação com G-00

O repositório `CHAT-SALES` reflete exatamente o estado verificado e aceito pelo pacote `G-00` (`EV-G00-001-v3.json`). A comparação byte a byte entre o snapshot de recuperação e o checkout local ativo demonstra integridade absoluta:

- **Arquivos Tracked Modificados:** `32` arquivos (capturados com diff binário em `unstaged.patch` do G-00).
- **Arquivos Staged:** `0` arquivos (index completamente limpo).
- **Arquivos Untracked:** `117` arquivos (preservados no `untracked.tar` do G-00).
- **Total de Arquivos com Modificações no Working Tree:** `149` arquivos.
- **Arquivos Ignorados Registrados:** `38` entradas (em `ignored-paths.txt`, excluindo dependências instaladas `node_modules` e caches `.turbo`/`dist`).
- **Divergência em relação ao Snapshot G-00:** `0` bytes (verificado via `git status --porcelain=v2 --branch` idêntico a `status-v2.txt`).

---

## 2. Resumo Quantitativo Consolidado

### 2.1 Distribuição por Iteração / Macro-Pacote

| Iteração / Pacote | Arquivos Tracked | Arquivos Untracked | Total de Arquivos | Proporção (%) |
| :--- | :---: | :---: | :---: | :---: |
| **Governança & Projeto (`CP-GOV`)** | 0 | 19 | 19 | 12.75% |
| **Iteração 2.7 — Auth & Test Runner (`CP-2.7`)** | 8 | 9 | 17 | 11.41% |
| **Iteração 3 — Design System & AppShell (`CP-3`)** | 7 | 57 | 64 | 42.95% |
| **Iteração 4 — Motor de Canais & Ingress (`CP-4`)** | 6 | 32 | 38 | 25.50% |
| **Arquivos Compartilhados / Cross-Cutting (`SHARED`)** | 11 | 0 | 11 | 7.38% |
| **TOTAL GERAL** | **32** | **117** | **149** | **100.00%** |

### 2.2 Distribuição por Ação Proposta

| Ação Proposta | Significado Arquitetural | Quantidade |
| :--- | :--- | :---: |
| `KEEP` | Conteúdo aderente à especificação da sua iteração, pronto para ser isolado no checkpoint correspondente sem alteração de lógica. | 116 |
| `REWORK` | Conteúdo que implementa arquitetura da Iteração 4 mas possui bloqueios de segurança/concorrência identificados (e.g. leases, retries, senhas em migrations). | 22 |
| `SPLIT_HUNKS` | Arquivo que agrega modificações de mais de uma iteração e precisa de divisão cirúrgica de diff antes de integrar aos checkpoints. | 11 |
| `MOVE_TO_GOVERNANCE` | Documentos de programa, charters, roadmaps e work packages que pertencem à governança canônica transversal. | 0 *(incorporados em KEEP no CP-GOV)* |
| `DISCARD_CANDIDATE` | Arquivos sem consumidor ou gerados por erro de processo. | 0 *(nenhum arquivo no working tree é lixo descartável sem rastro)* |
| **TOTAL** | | **149** |

---

## 3. Inventário Individual Detalhado de 100% dos Arquivos (149 Itens)

Cada um dos 149 arquivos modificados ou untracked foi inspecionado em seu conteúdo real, dependências e imports.

### 3.1 Grupo Governança & Documentação de Projeto (19 arquivos)

| # | Caminho | Estado Git | Domínio | Iteração | Ação | Justificativa de Conteúdo | Dependências | Sobreposição | Risco | Checkpoint | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `docs/project/README.md` | Untracked | Governança | G-02 | KEEP | Guia mestre do sistema canônico de execução V3 e ordem de autoridade documental. | Nenhuma | Nenhuma | Baixo | CP-GOV | G0/G1 |
| 2 | `docs/project/PRODUCT_CHARTER.md` | Untracked | Governança | G-02 | KEEP | Carta de produto definindo público-alvo, fronteiras do MVP comercial e métricas de sucesso. | Nenhuma | Nenhuma | Baixo | CP-GOV | G0 |
| 3 | `docs/project/MASTER_ROADMAP.md` | Untracked | Governança | G-02 | KEEP | Sequenciamento macro de fases: G -> CH -> CRM -> UI -> META -> AI -> MIG. | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 4 | `docs/project/EXECUTION_BOARD.md` | Untracked | Governança | G-02 | KEEP | Board factual registrando estados reais dos pacotes de trabalho (G-00 ACCEPTED, G-01 READY). | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 5 | `docs/project/DEPENDENCY_MAP.md` | Untracked | Governança | G-02 | KEEP | Grafo de dependências entre componentes e catálogo de dependências externas (EXT-01 a EXT-06). | Nenhuma | Nenhuma | Baixo | CP-GOV | G1/G2 |
| 6 | `docs/project/QUALITY_GATES.md` | Untracked | Governança | G-02 | KEEP | Definição formal dos portões de qualidade G0 a G10 para avanço de pacotes. | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 7 | `docs/project/DEFINITION_OF_DONE.md` | Untracked | Governança | G-02 | KEEP | Critérios rigorosos de conclusão (Produto, Código, Tenancy, Segurança, Testes, Operação). | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 8 | `docs/project/ACCEPTANCE_MATRIX.md` | Untracked | Governança | G-02 | KEEP | Matriz rastreando requisitos, evidências de testes e status de aceitação por pacote. | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 9 | `docs/project/RISK_REGISTER.md` | Untracked | Governança | G-02 | KEEP | Catálogo de riscos operacionais e técnicos com severidade, mitigação e donos designados. | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 10 | `docs/project/ARCHITECTURE_MAP.md` | Untracked | Governança | G-02 | KEEP | Mapa de arquitetura do sistema com topologia de serviços, camadas e bancos de dados. | Nenhuma | Nenhuma | Baixo | CP-GOV | G2 |
| 11 | `docs/project/PROJECT_EXECUTION_PLAN.md` | Untracked | Governança | G-02 | KEEP | Plano operacional detalhado de execução da equipe para todo o ciclo de vida. | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |
| 12 | `docs/project/RELEASE_STRATEGY.md` | Untracked | Governança | G-02 | KEEP | Governança de releases: laboratório local, piloto shadow Haven, rollback e produção. | Nenhuma | Nenhuma | Baixo | CP-GOV | G7/G8 |
| 13 | `docs/project/SLO_AND_ALERTS.md` | Untracked | Governança | G-02 | KEEP | Especificação de Service Level Objectives, error budgets e gatilhos de alerta. | Nenhuma | Nenhuma | Baixo | CP-GOV | G7 |
| 14 | `docs/project/TEAM_OPERATING_MODEL.md` | Untracked | Governança | G-02 | KEEP | Modelo operacional, papéis da equipe e ritos de entrega Sovereign MCT OS. | Nenhuma | Nenhuma | Baixo | CP-GOV | G0 |
| 15 | `docs/project/EVIDENCE_INDEX.md` | Untracked | Governança | G-02 | KEEP | Índice canônico das evidências produzidas indexadas por commit SHA / digest. | Nenhuma | Nenhuma | Baixo | CP-GOV | G10 |
| 16 | `docs/work-packages/G-00-SNAPSHOT.md` | Untracked | Governança | G-00 | KEEP | Especificação do pacote G-00 para criação do snapshot bruto e ensaio de restauração. | G-00 artifacts | Nenhuma | Baixo | CP-GOV | G1 |
| 17 | `docs/work-packages/G-01-REBASELINE.md` | Untracked | Governança | G-01 | KEEP | Especificação do pacote G-01 para rebaseline e inventário individual do working tree. | G-00 snapshot | Nenhuma | Baixo | CP-GOV | G1 |
| 18 | `docs/work-packages/G-01-INVENTORY.md` | Untracked | Governança | G-01 | KEEP | Documento de inventário exaustivo de 100% dos arquivos do repositório. | Working tree | Nenhuma | Baixo | CP-GOV | G1 |
| 19 | `docs/work-packages/TEMPLATE.md` | Untracked | Governança | G-02 | KEEP | Modelo canônico para elaboração de especificações de pacotes de trabalho (G, CH, CRM). | Nenhuma | Nenhuma | Baixo | CP-GOV | G1 |

### 3.2 Grupo Iteração 2.7 — Auth, JWKS, Runner Hermético e DB Test Support (17 arquivos)

| # | Caminho | Estado Git | Domínio | Iteração | Ação | Justificativa de Conteúdo | Dependências | Sobreposição | Risco | Checkpoint | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | `apps/api/src/__tests__/auth-vertical-slice.test.ts` | Tracked | Auth / API | 2.7 | KEEP | Testes de integração vertical de autenticação JWT/JWKS, autorização RBAC e tenancy isolado. | `@sos-sales/database`, `@sos-sales/auth`, `Fastify` | Nenhuma | Médio | CP-2.7 | Unit/Integration |
| 21 | `apps/api/src/plugins/auth.plugin.ts` | Tracked | Auth / API | 2.7 | KEEP | Plugin Fastify de autenticação com suporte dual `local-jwt` e `supabase-jwks`, com validação estrita de UUID no sub. | `@sos-sales/auth`, `Fastify`, `zod` | Nenhuma | Médio | CP-2.7 | Unit/Typecheck |
| 22 | `packages/auth/src/__tests__/auth.test.ts` | Tracked | Auth | 2.7 | KEEP | Testes unitários do provedor JWT local e validação de claims requeridos (`exp`, `sub`, `iss`, `aud`). | `packages/auth` | Nenhuma | Baixo | CP-2.7 | Unit |
| 23 | `packages/auth/src/__tests__/auth-logging.test.ts` | Untracked | Auth / Obs | 2.7 | KEEP | Teste garantindo que tokens, emails, claims e credenciais são redigidos nos logs do provedor de autenticação. | `@sos-sales/auth`, `@sos-sales/observability` | Nenhuma | Baixo | CP-2.7 | Unit |
| 24 | `packages/auth/src/__tests__/supabase-jwks.test.ts` | Untracked | Auth | 2.7 | KEEP | Testes do provedor Supabase JWKS com simulação de JWKS endpoint e validação de chave pública RS256. | `@sos-sales/auth`, `jose` | Nenhuma | Médio | CP-2.7 | Unit |
| 25 | `packages/auth/src/index.ts` | Tracked | Auth | 2.7 | KEEP | Re-exporta provedores JWT, JWKS, factory, types e funções de sanitização de erro. | `packages/auth/src/*` | Nenhuma | Baixo | CP-2.7 | Typecheck |
| 26 | `packages/auth/src/jwt-provider.ts` | Tracked | Auth | 2.7 | KEEP | Implementação de `JwtIdentityProvider` com `verifyTokenDetailed` e sanitização de logs de falha. | `jose`, `@sos-sales/observability` | Nenhuma | Baixo | CP-2.7 | Unit |
| 27 | `packages/auth/src/provider-factory.ts` | Tracked | Auth | 2.7 | KEEP | Factory instanciando o provedor correto com base em `type: "local-jwt"` ou `"supabase-jwks"`. | Provedores internos | Nenhuma | Baixo | CP-2.7 | Unit |
| 28 | `packages/auth/src/sanitization.ts` | Untracked | Auth / Sec | 2.7 | KEEP | Módulo de sanitização e ofuscação de erros de autenticação para evitar vazamento de dados nos logs. | Nenhuma | Nenhuma | Baixo | CP-2.7 | Unit |
| 29 | `packages/auth/src/supabase-jwks-provider.ts` | Tracked | Auth | 2.7 | KEEP | Implementação de `SupabaseJwksIdentityProvider` com tratamento de JWKSTimeout e status `provider_unavailable`. | `jose`, `@sos-sales/observability` | Nenhuma | Médio | CP-2.7 | Unit |
| 30 | `packages/auth/src/types.ts` | Tracked | Auth | 2.7 | KEEP | Definição de interfaces `IIdentityProvider`, `AuthUser`, `TokenVerificationResult` e configs. | `@sos-sales/contracts` | Nenhuma | Baixo | CP-2.7 | Typecheck |
| 31 | `packages/database/src/__tests__/tenant-isolation.test.ts` | Tracked | Database | 2.7 | KEEP | Teste rigoroso de isolamento RLS multi-tenant garantindo que Workspace A nunca acessa dados de Workspace B. | `packages/database` | Nenhuma | Médio | CP-2.7 | DB Integration |
| 32 | `packages/database/src/__tests__/test-support.test.ts` | Untracked | Database | 2.7 | KEEP | Testes unitários do framework de banco hermético (`bootstrapTestDatabase`, `disposeTestDatabase`). | `packages/database/src/test-support` | Nenhuma | Baixo | CP-2.7 | Unit |
| 33 | `packages/database/src/test-support.ts` | Untracked | Database | 2.7 | KEEP | Framework de suporte a testes: criação e descarte de bancos temporários `sos_sales_v3_test_*` com pool isolado. | `pg`, `fs`, `path` | Possui hook para carregar migrations (001 a 005) | Médio | CP-2.7 | Unit |
| 34 | `scripts/test-db-runner.ts` | Untracked | DevEx / Scripts | 2.7 | KEEP | CLI de gerenciamento do banco de dados hermético de testes (`bootstrap`, `dispose`, `run`). | `packages/database/src/test-support` | Nenhuma | Baixo | CP-2.7 | DevEx |
| 35 | `scripts/verify-docker-http.mjs` | Untracked | DevEx / Scripts | 2.7 | KEEP | Script de validação HTTP externa dos containers Docker contra endpoints `/v1/me`. | `@sos-sales/auth`, Node fetch | Nenhuma | Baixo | CP-2.7 | DevEx |
| 36 | `docs/audits/iteration-2.7/EVIDENCE.md` | Untracked | Evidência | 2.7 | KEEP | Relatório e evidência de testes da Iteração 2.7 (222 testes passando). | Nenhuma | Nenhuma | Baixo | CP-2.7 | G5 |

### 3.3 Grupo Iteração 3 — Design System, AppShell e Sessão Web (64 arquivos)

| # | Caminho | Estado Git | Domínio | Iteração | Ação | Justificativa de Conteúdo | Dependências | Sobreposição | Risco | Checkpoint | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 37 | `DESIGN.md` | Untracked | Frontend | 3 | KEEP | Especificação dos tokens visuais, paleta de cores, tipografia, elevações e componentes de interface. | Nenhuma | Nenhuma | Baixo | CP-3 | G2 |
| 38 | `apps/web/index.html` | Tracked | Frontend | 3 | KEEP | Ponto de entrada HTML do App Web com fontes Inter e JetBrains Mono pré-carregadas. | Nenhuma | Nenhuma | Baixo | CP-3 | Build |
| 39 | `apps/web/package.json` | Tracked | Frontend | 3 | KEEP | Manifesto de dependências do App Web incluindo `@sos-sales/ui`, `lucide-react`, `vite` e `happy-dom`. | `@sos-sales/ui`, workspace | Nenhuma | Baixo | CP-3 | Build |
| 40 | `apps/web/src/App.tsx` | Tracked | Frontend | 3 | KEEP | Raiz do aplicativo React montando `AppShell`, roteamento interno honesto e quarentena do DevLab. | `@sos-sales/ui`, components | Nenhuma | Baixo | CP-3 | Build/Browser |
| 41 | `apps/web/src/index.css` | Tracked | Frontend | 3 | KEEP | Folha de estilo canônica importando `@sos-sales/ui/tokens.css`, resets, regras de a11y e focus rings. | `@sos-sales/ui/tokens.css` | Nenhuma | Baixo | CP-3 | Build |
| 42 | `apps/web/tsconfig.json` | Tracked | Frontend | 3 | KEEP | Configuração TypeScript para aplicação cliente React 19 com Vite. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 43 | `apps/web/vite.config.ts` | Tracked | Frontend | 3 | KEEP | Configuração Vite com plugin React e configuração de ambiente de teste `happy-dom`. | Vite, Vitest | Nenhuma | Baixo | CP-3 | Build |
| 44 | `apps/web/.env.lab` | Untracked | Frontend / DevLab | 3 | KEEP | Variáveis de desenvolvimento local exclusivas para laboratório de UI. Quarentenado contra produção. | Nenhuma | Nenhuma | Baixo | CP-3 | DevEx |
| 45 | `apps/web/src/__tests__/api-client-and-session.test.ts` | Untracked | Frontend | 3 | KEEP | Testes unitários do cliente HTTP do frontend e gerenciador de sessão JWT. | `apps/web/src/services` | Nenhuma | Baixo | CP-3 | Unit |
| 46 | `apps/web/src/components/DevLabToolbar.tsx` | Untracked | Frontend | 3 | KEEP | Barra de ferramentas de desenvolvimento visual ativa apenas em modo laboratório (`VITE_DEV_LAB=true`). | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 47 | `apps/web/src/hooks/useConnectivity.ts` | Untracked | Frontend | 3 | KEEP | Hook React monitorando conectividade online/offline e latência com a API Fastify. | React | Nenhuma | Baixo | CP-3 | UI |
| 48 | `apps/web/src/hooks/useSession.ts` | Untracked | Frontend | 3 | KEEP | Hook React gerenciando estado de autenticação, workspace ativo e expiração de sessão. | React | Nenhuma | Baixo | CP-3 | UI |
| 49 | `apps/web/src/pages/CampaignsPage.tsx` | Untracked | Frontend | 3 | KEEP | Página de campanhas e disparos com estados honestos ("Sem campanhas ativas"). | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 50 | `apps/web/src/pages/CatalogPage.tsx` | Untracked | Frontend | 3 | KEEP | Página de catálogo de produtos com renderização de itens mock sob quarentena explícita de DevLab. | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 51 | `apps/web/src/pages/CockpitPage.tsx` | Untracked | Frontend | 3 | KEEP | Cockpit comercial principal exibindo métricas, conversas e controles de atendimento. | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 52 | `apps/web/src/pages/ContactsPage.tsx` | Untracked | Frontend | 3 | KEEP | Página de gestão de contatos e audiências de clientes. | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 53 | `apps/web/src/pages/SettingsPage.tsx` | Untracked | Frontend | 3 | KEEP | Configurações do workspace, canais de mensageria e perfil de usuário. | `@sos-sales/ui` | Nenhuma | Baixo | CP-3 | UI |
| 54 | `apps/web/src/services/api-client.ts` | Untracked | Frontend | 3 | KEEP | Cliente HTTP frontend com interceptors de autenticação, correlation ID e tratamento de erros RFC 7807. | Fetch API | Nenhuma | Baixo | CP-3 | Unit |
| 55 | `scripts/verify-browser-qa.mjs` | Untracked | QA / Browser | 3 | KEEP | Suíte de automação CDP real verificando responsividade em 3 viewports (375/768/1440), focus trap e WCAG 2.2 AA. | Node WebSocket, Chrome CDP | Nenhuma | Médio | CP-3 | Browser QA |
| 56 | `packages/ui/package.json` | Untracked | UI Package | 3 | KEEP | Manifesto do pacote `@sos-sales/ui` com exports de tokens e componentes. | React | Nenhuma | Baixo | CP-3 | Build |
| 57 | `packages/ui/tsconfig.json` | Untracked | UI Package | 3 | KEEP | Configuração TypeScript do pacote de componentes de interface. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 58 | `packages/ui/src/index.ts` | Untracked | UI Package | 3 | KEEP | Re-exporta todos os componentes, tokens e hooks do Design System. | `packages/ui/src/*` | Nenhuma | Baixo | CP-3 | Build |
| 59 | `packages/ui/src/tokens/colors.ts` | Untracked | UI Tokens | 3 | KEEP | Tokens tipados de cores (ações, superfícies, estados, texto, contraste WCAG). | Nenhuma | Nenhuma | Baixo | CP-3 | Build |
| 60 | `packages/ui/src/tokens/index.ts` | Untracked | UI Tokens | 3 | KEEP | Ponto de entrada consolidado dos tokens de design. | `packages/ui/src/tokens/*` | Nenhuma | Baixo | CP-3 | Build |
| 61 | `packages/ui/src/tokens/spacing.ts` | Untracked | UI Tokens | 3 | KEEP | Escala métrica de espaçamentos e raios de borda. | Nenhuma | Nenhuma | Baixo | CP-3 | Build |
| 62 | `packages/ui/src/tokens/tokens.css` | Untracked | UI Tokens | 3 | KEEP | Variáveis CSS canônicas exportadas para estilização global da interface. | Nenhuma | Nenhuma | Baixo | CP-3 | Build |
| 63 | `packages/ui/src/tokens/typography.ts` | Untracked | UI Tokens | 3 | KEEP | Tokens de fontes, tamanhos, line-heights e pesos tipográficos. | Nenhuma | Nenhuma | Baixo | CP-3 | Build |
| 64 | `packages/ui/src/__tests__/ui-components.test.tsx` | Untracked | UI Package | 3 | KEEP | Suíte de testes unitários validando renderização e acessibilidade de todos os componentes UI. | `@testing-library/react` | Nenhuma | Baixo | CP-3 | Unit |
| 65 | `packages/ui/src/components/Alert/Alert.tsx` | Untracked | UI Component | 3 | KEEP | Componente de notificação de sistema com variantes de severidade e suporte a ARIA. | React, Tokens | Nenhuma | Baixo | CP-3 | Build |
| 66 | `packages/ui/src/components/Alert/Alert.types.ts` | Untracked | UI Component | 3 | KEEP | Interfaces de propriedades e variantes do componente Alert. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 67 | `packages/ui/src/components/AppShell/AppShell.tsx` | Untracked | UI Component | 3 | KEEP | Layout estrutural master contendo cabeçalho, navegação lateral e viewport responsivo. | Subcomponentes AppShell | Nenhuma | Baixo | CP-3 | Build |
| 68 | `packages/ui/src/components/AppShell/AppShell.types.ts` | Untracked | UI Component | 3 | KEEP | Tipos e contratos de dados para navegação e perfil no AppShell. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 69 | `packages/ui/src/components/AppShell/Header.tsx` | Untracked | UI Component | 3 | KEEP | Cabeçalho canônico com badge de status do sistema, alternador de workspace e perfil. | React | Nenhuma | Baixo | CP-3 | Build |
| 70 | `packages/ui/src/components/AppShell/MobileNav.tsx` | Untracked | UI Component | 3 | KEEP | Barra de navegação inferior mobile para telas estreitas (<= 768px). | React | Nenhuma | Baixo | CP-3 | Build |
| 71 | `packages/ui/src/components/AppShell/Sidebar.tsx` | Untracked | UI Component | 3 | KEEP | Menu lateral persistente de navegação desktop com suporte a recolhimento e foco. | React | Nenhuma | Baixo | CP-3 | Build |
| 72 | `packages/ui/src/components/Badge/Badge.tsx` | Untracked | UI Component | 3 | KEEP | Componente de etiqueta indicadora de status e taxonomia visual. | React | Nenhuma | Baixo | CP-3 | Build |
| 73 | `packages/ui/src/components/Badge/Badge.types.ts` | Untracked | UI Component | 3 | KEEP | Definições de variantes semânticas do componente Badge. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 74 | `packages/ui/src/components/Button/Button.tsx` | Untracked | UI Component | 3 | KEEP | Botão interativo com contraste WCAG 2.2 AA (>= 4.5:1), estados de foco e spinner de loading. | React | Nenhuma | Baixo | CP-3 | Build |
| 75 | `packages/ui/src/components/Button/Button.types.ts` | Untracked | UI Component | 3 | KEEP | Tipos de propriedades e variantes visuais do Button. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 76 | `packages/ui/src/components/Dialog/Dialog.tsx` | Untracked | UI Component | 3 | KEEP | Modal de diálogo com foco enclausurado (Focus Trap completo via Shift+Tab e Escape). | React | Nenhuma | Baixo | CP-3 | Build |
| 77 | `packages/ui/src/components/Dialog/Dialog.types.ts` | Untracked | UI Component | 3 | KEEP | Interfaces de controle e callbacks de fechamento do Dialog. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 78 | `packages/ui/src/components/Drawer/Drawer.tsx` | Untracked | UI Component | 3 | KEEP | Painel deslizante lateral com isolamento de foco e retorno ao elemento acionador. | React | Nenhuma | Baixo | CP-3 | Build |
| 79 | `packages/ui/src/components/Drawer/Drawer.types.ts` | Untracked | UI Component | 3 | KEEP | Tipos para posição, abertura e acessibilidade do Drawer. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 80 | `packages/ui/src/components/EmptyState/EmptyState.tsx` | Untracked | UI Component | 3 | KEEP | Componente de estado vazio honesto ("Sem conversas no momento") sem mocks fictícios. | React | Nenhuma | Baixo | CP-3 | Build |
| 81 | `packages/ui/src/components/EmptyState/EmptyState.types.ts` | Untracked | UI Component | 3 | KEEP | Tipos para ícone, título, descrição e ação de chamada do EmptyState. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 82 | `packages/ui/src/components/Input/Input.tsx` | Untracked | UI Component | 3 | KEEP | Campo de entrada de formulário acessível com label semântico e estado de erro explícito. | React | Nenhuma | Baixo | CP-3 | Build |
| 83 | `packages/ui/src/components/Input/Input.types.ts` | Untracked | UI Component | 3 | KEEP | Definições de propriedades nativas e estados de validação do Input. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 84 | `packages/ui/src/components/LoadingState/LoadingState.tsx` | Untracked | UI Component | 3 | KEEP | Componente indicador de carregamento com feedback para leitores de tela (ARIA live). | React | Nenhuma | Baixo | CP-3 | Build |
| 85 | `packages/ui/src/components/LoadingState/LoadingState.types.ts` | Untracked | UI Component | 3 | KEEP | Tipos de tamanho e mensagem do LoadingState. | Nenhuma | Nenhuma | Baixo | CP-3 | Typecheck |
| 86 | `docs/audits/iteration-3/EVIDENCE.md` | Untracked | Evidência | 3 | KEEP | Relatório de auditoria independente e aprovação técnica dos portões da Iteração 3. | Nenhuma | Nenhuma | Baixo | CP-3 | G5 |
| 87 | `docs/audits/iteration-3/INDEPENDENT_REVIEW.md` | Untracked | Evidência | 3 | KEEP | Parecer formal de revisão independente dos requisitos de frontend e acessibilidade. | Nenhuma | Nenhuma | Baixo | CP-3 | G5 |
| 88 | `docs/audits/iteration-3/screenshot-1440px-updated.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela do viewport desktop 1440px atualizada. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 89 | `docs/audits/iteration-3/screenshot-1440px.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela do viewport desktop 1440px. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 90 | `docs/audits/iteration-3/screenshot-375px.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela do viewport mobile 375px. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 91 | `docs/audits/iteration-3/screenshot-768px.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela do viewport tablet 768px. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 92 | `docs/audits/iteration-3/screenshot-catalog-full.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela da página de catálogo em viewport completo. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 93 | `docs/audits/iteration-3/screenshot-catalog.png` | Untracked | Evidência Visual | 3 | KEEP | Captura de tela do componente de catálogo. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 94 | `docs/audits/iteration-3/screenshots/dialog-focus-trap.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência visual do teste de enclausuramento de foco no Dialog. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 95 | `docs/audits/iteration-3/screenshots/drawer-focus-trap.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência visual do teste de enclausuramento de foco no Drawer. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 96 | `docs/audits/iteration-3/screenshots/viewport-1440px-desktop.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência de layout desktop 1440px sem overflow horizontal. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 97 | `docs/audits/iteration-3/screenshots/viewport-375px-mobile.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência de layout mobile 375px com adaptação limpa e touch targets. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 98 | `docs/audits/iteration-3/screenshots/viewport-768px-tablet.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência de layout tablet 768px com colapso do sidebar. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 99 | `docs/audits/iteration-3/screenshots/viewport-long-text-375px.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência de quebra de texto longo sem quebrar viewport em 375px. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |
| 100 | `docs/audits/iteration-3/screenshots/viewport-zoom-200pct.png` | Untracked | Evidência Visual | 3 | KEEP | Evidência de zoom 200% sem perda de funcionalidade nem sobreposição. | Nenhuma | Nenhuma | Baixo | CP-3 | G6 |

### 3.4 Grupo Iteração 4 — Motor de Canais Multi-Engine, Ingress e Filas (38 arquivos)

| # | Caminho | Estado Git | Domínio | Iteração | Ação | Justificativa de Conteúdo | Dependências | Sobreposição | Risco | Checkpoint | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 | `apps/api/src/__tests__/ingress-operational-security.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de segurança operacional do ingress. Exige revisão para cobrir falhas de lease e roles reais. | Fastify, Ingress | Nenhuma | Alto | CP-4 (CH-04) | Integration |
| 102 | `apps/api/src/__tests__/webhook-ingress.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de recebimento de webhooks Meta WABA e WAHA. Requer integração com verificação de assinatura. | Fastify, Ingress | Nenhuma | Alto | CP-4 (CH-04) | Integration |
| 103 | `apps/api/src/plugins/raw-body.plugin.ts` | Untracked | Canais / API | 4 | REWORK | Plugin de captura de corpo bruto para validação HMAC. Exige preservação de payload sem truncamento. | Fastify | Nenhuma | Médio | CP-4 (CH-04) | Unit |
| 104 | `apps/api/src/routes/webhook.routes.ts` | Untracked | Canais / API | 4 | REWORK | Rotas públicas `/v1/webhooks/whatsapp/:token`. Requer rate limiter distribuído e mitigação de token leakage. | Fastify, Ingress DB | Nenhuma | Alto | CP-4 (CH-04) | Integration |
| 105 | `apps/worker/package.json` | Tracked | Canais / Worker | 4 | KEEP | Manifesto do worker adicionando dependência de `pg` para consumo de filas no banco. | `pg`, `ioredis` | Nenhuma | Baixo | CP-4 (CH-01) | Build |
| 106 | `apps/worker/src/index.ts` | Tracked | Canais / Worker | 4 | REWORK | Ponto de entrada do worker poller. Requer renovação de leases em lotes e abort em crash. | `pg`, `@sos-sales/database` | Nenhuma | Alto | CP-4 (CH-02) | Integration |
| 107 | `apps/worker/src/__tests__/inbox-and-outbox-processor.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de processamento de inbox/outbox. Necessita cobrir dead-letter queue e fencing. | Worker | Nenhuma | Alto | CP-4 (CH-03) | Integration |
| 108 | `apps/worker/src/__tests__/worker-operational-resilience.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de resiliência e concorrência com `SKIP LOCKED`. | Worker | Nenhuma | Alto | CP-4 (CH-03) | Concurrency |
| 109 | `apps/worker/src/processors/inbox-processor.ts` | Untracked | Canais / Worker | 4 | REWORK | Processador consumindo `channel_webhook_inbox`. Necessita corrigir transição terminal no limite de retries. | `@sos-sales/database` | Nenhuma | Alto | CP-4 (CH-01) | Unit/Integration |
| 110 | `apps/worker/src/processors/outbox-dispatcher.ts` | Untracked | Canais / Worker | 4 | REWORK | Despachante consumindo `outbound_commands`. Requer garantia de `message_id` NOT NULL e monotonicidade. | `@sos-sales/database`, Adapters | Nenhuma | Alto | CP-4 (CH-02) | Unit/Integration |
| 111 | `docs/adr/ADR-005-channel-gateway-and-inbox-outbox.md` | Untracked | Arquitetura | 4 | REWORK | Decisão arquitetural de canais. Necessita alinhar roles e falhas de lease formalmente. | Nenhuma | Nenhuma | Médio | CP-4 (CH-00) | G2 |
| 112 | `packages/application/package.json` | Tracked | Canais / App | 4 | KEEP | Manifesto adicionando `@types/node`. | Nenhuma | Nenhuma | Baixo | CP-4 (CH-00) | Build |
| 113 | `packages/application/src/index.ts` | Tracked | Canais / App | 4 | KEEP | Re-exporta serviços de canais, normalizadores, adaptadores e políticas de retry. | `packages/application/src/*` | Nenhuma | Baixo | CP-4 (CH-00) | Typecheck |
| 114 | `packages/application/src/ports/channel-gateway.port.ts` | Tracked | Canais / App | 4 | KEEP | Interface canônica `IChannelGateway` com `CredentialLease` e `ChannelInboundContext`. | `@sos-sales/contracts` | Nenhuma | Médio | CP-4 (CH-00) | Contract |
| 115 | `packages/application/src/__tests__/channel-adapters.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes dos adaptadores Meta WABA e WAHA. Necessita cobrir SSRF guard e headers estritos. | Adapters | Nenhuma | Alto | CP-4 (CH-08) | Unit |
| 116 | `packages/application/src/__tests__/channel-gateway.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de integração do gateway de canais e roteamento de provedor. | Gateway | Nenhuma | Médio | CP-4 (CH-07) | Unit |
| 117 | `packages/application/src/__tests__/http-operational-security.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes de segurança operacional contra SSRF e injeção de host. | SSRF Guard | Nenhuma | Alto | CP-4 (CH-07) | Security |
| 118 | `packages/application/src/channels/adapters/channel-adapter.interface.ts` | Untracked | Canais / Adapters | 4 | KEEP | Contrato estrito para adaptadores de mensageria WhatsApp. | `@sos-sales/contracts` | Nenhuma | Baixo | CP-4 (CH-07) | Contract |
| 119 | `packages/application/src/channels/adapters/meta-waba.adapter.ts` | Untracked | Canais / Adapters | 4 | REWORK | Adaptador Meta Cloud API oficial. Requer suporte a templates completos e validação de janela 24h. | Meta API | Nenhuma | Alto | CP-4 (CH-08) | Unit |
| 120 | `packages/application/src/channels/adapters/mock-channel.adapter.ts` | Untracked | Canais / Adapters | 4 | KEEP | Adaptador mock para testes herméticos locais sem chamada externa de rede. | Adapter Interface | Nenhuma | Baixo | CP-4 (CH-07) | Unit |
| 121 | `packages/application/src/channels/adapters/waha.adapter.ts` | Untracked | Canais / Adapters | 4 | REWORK | Adaptador WAHA não oficial. Proibido usar `localhost:3000` em produção e requer SSRF guard em `mediaUrl`. | WAHA API | Nenhuma | Alto | CP-4 (CH-09) | Unit |
| 122 | `packages/application/src/channels/fixtures/waba-fixtures.ts` | Untracked | Canais / Fixtures | 4 | KEEP | Payloads canônicos reais de webhook da Meta para testes determinísticos. | Nenhuma | Nenhuma | Baixo | CP-4 (CH-08) | Test |
| 123 | `packages/application/src/channels/fixtures/waha-fixtures.ts` | Untracked | Canais / Fixtures | 4 | KEEP | Payloads canônicos reais de eventos do WAHA para testes determinísticos. | Nenhuma | Nenhuma | Baixo | CP-4 (CH-09) | Test |
| 124 | `packages/application/src/channels/normalizers/waba-normalizer.ts` | Untracked | Canais / Normalizer | 4 | KEEP | Converte mensagens inbound e status receipts da Meta para contratos SOS Sales V3. | `@sos-sales/contracts` | Nenhuma | Baixo | CP-4 (CH-08) | Unit |
| 125 | `packages/application/src/channels/normalizers/waha-normalizer.ts` | Untracked | Canais / Normalizer | 4 | KEEP | Converte eventos e mensagens do WAHA para contratos unificados SOS Sales V3. | `@sos-sales/contracts` | Nenhuma | Baixo | CP-4 (CH-09) | Unit |
| 126 | `packages/application/src/channels/policies/queue-retry.policy.ts` | Untracked | Canais / Policies | 4 | REWORK | Política de retentativa com recuo exponencial e jitter. Ajustar alinhamento com CHECK do banco. | Nenhuma | Nenhuma | Médio | CP-4 (CH-01) | Unit |
| 127 | `packages/application/src/channels/registry/channel-adapter.registry.ts` | Untracked | Canais / Registry | 4 | KEEP | Registro resolvendo adaptador pelo enum do provedor (`meta_waba`, `waha`). | Adapters | Nenhuma | Baixo | CP-4 (CH-07) | Unit |
| 128 | `packages/application/src/channels/security/ssrf-guard.ts` | Untracked | Canais / Security | 4 | REWORK | Validador impedindo chamadas a IPs de loopback, links locais e rede privada. Integrar aos adapters reais. | Node `net`, `dns` | Nenhuma | Alto | CP-4 (CH-07) | Security |
| 129 | `packages/application/src/channels/services/monotonic-status.service.ts` | Untracked | Canais / Services | 4 | KEEP | Serviço garantindo que o status de mensagem avança estritamente na direção monotônica (0 -> 10 -> 20 -> 30). | Nenhuma | Nenhuma | Baixo | CP-4 (CH-07) | Unit |
| 130 | `packages/application/src/channels/services/signature-verification.service.ts` | Untracked | Canais / Services | 4 | KEEP | Serviço de verificação de assinatura HMAC em tempo constante (`timingSafeEqual`). | `node:crypto` | Nenhuma | Médio | CP-4 (CH-05) | Security |
| 131 | `packages/contracts/src/channel.ts` | Untracked | Canais / Contratos | 4 | KEEP | Definição de tipos e schemas Zod para instâncias de canal, credenciais e receipts. | Zod | Nenhuma | Baixo | CP-4 (CH-00) | Contract |
| 132 | `packages/contracts/src/inbound.ts` | Tracked | Canais / Contratos | 4 | KEEP | Atualização de `ChannelProviderEnum` adicionando `evolution`. | Zod | Nenhuma | Baixo | CP-4 (CH-00) | Contract |
| 133 | `packages/contracts/src/webhook-ingress.ts` | Untracked | Canais / Contratos | 4 | KEEP | Contratos de dados para payload de ingresso de webhooks e tuplas de resolução. | Zod | Nenhuma | Baixo | CP-4 (CH-00) | Contract |
| 134 | `packages/database/migrations/005_channel_foundation_inbox_outbox.sql` | Untracked | Banco / Migrations | 4 | REWORK | Migration criando tabelas de inbox/outbox/events e roles. Exige remoção de senhas hardcoded e ajuste de CHECK. | SQL PostgreSQL | Nenhuma | Crítico | CP-4 (CH-01) | Migration |
| 135 | `packages/database/src/__tests__/channel-foundation-security.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Teste de segurança da migration 005 e RLS de inbox/outbox. Necessita cobrir restrições negativas de roles. | Database | Nenhuma | Alto | CP-4 (CH-01) | DB Integration |
| 136 | `packages/database/src/__tests__/crypto-keyring.test.ts` | Untracked | Canais / Testes | 4 | REWORK | Testes unitários do primitive de criptografia de keyring AES-256-GCM. Necessita teste E2E com rotação. | Crypto | Nenhuma | Médio | CP-4 (CH-06) | Security |
| 137 | `packages/database/src/infrastructure/crypto-payload.ts` | Untracked | Canais / Infra | 4 | REWORK | Helper de criptografia de payloads de webhooks em repouso. Deve garantir destruição de buffers sensíveis. | `node:crypto` | Nenhuma | Médio | CP-4 (CH-06) | Security |
| 138 | `packages/database/src/infrastructure/database-signing-secret-resolver.ts` | Untracked | Canais / Infra | 4 | REWORK | Implementação de resolução de material de assinatura via `resolve_channel_signing_material`. Redigir logs. | Database Pool | Nenhuma | Alto | CP-4 (CH-05) | Security |

### 3.5 Grupo Arquivos Compartilhados & Cross-Cutting (11 arquivos)

| # | Caminho | Estado Git | Domínio | Iterações Mistas | Ação | Justificativa de Separação por Hunk | Checkpoint | Risco |
|---|---|---|---|---|---|---|---|---|
| 139 | `.env.example` | Tracked | Config | 2.7, 4 | SPLIT_HUNKS | Hunk de Auth (`AUTH_PROVIDER`, `JWT_SECRET`, `SUPABASE_JWKS_URI`) pertence à 2.7. Segredos mestres e variáveis de canal pertencem à 4. | CP-2.7 / CP-4 | Baixo |
| 140 | `.gitignore` | Tracked | DevEx | 2.7, 3, G | SPLIT_HUNKS | `.vitest/` pertence à 2.7 (testes). `dist-lab/` pertence à 3 (build web lab). Devem ser unificados no checkpoint de Governança. | CP-GOV | Baixo |
| 141 | `apps/api/src/index.ts` | Tracked | API Core | 2.7, 4 | SPLIT_HUNKS | Hunk de rotas de webhook, secretResolver e ingressPool pertence a CH-04. `app.ready()` e auth pertencem a 2.7 / DevEx. | CP-2.7 / CP-4 | Médio |
| 142 | `docker-compose.yml` | Tracked | Infra / Docker | 2.7, 4 | SPLIT_HUNKS | Variáveis de auth no serviço `api` pertencem à 2.7. `INGRESS_DATABASE_URL`, `WORKER_DATABASE_URL` e service `worker` pertencem à 4. | CP-2.7 / CP-4 | Médio |
| 143 | `package.json` | Tracked | Workspace Root | 2.7, 3 | SPLIT_HUNKS | Scripts `test:db:*` e `test:docker:http` pertencem à 2.7. Script `test:browser` pertence à 3. | CP-2.7 / CP-3 | Baixo |
| 144 | `pnpm-lock.yaml` | Tracked | Dependências | 2.7, 3, 4 | SPLIT_HUNKS | Contém resolução de pacotes de todas as iterações. Deve ser regenerado deterministicamente a cada checkpoint. | Todos (regenerar) | Médio |
| 145 | `packages/database/package.json` | Tracked | Database | 2.7, 4 | SPLIT_HUNKS | Dependência `@types/pg` utilizada tanto pelo test runner (2.7) quanto pelos pools do worker (4). | CP-2.7 | Baixo |
| 146 | `packages/database/src/client.ts` | Tracked | Database | 2.7, 4 | SPLIT_HUNKS | `getDatabasePool`, `withTenantTransaction` e `closeAllDatabasePools` pertencem à 2.7. Ingress e Worker pools e lookups pertencem à 4. | CP-2.7 / CP-4 | Alto |
| 147 | `packages/database/src/index.ts` | Tracked | Database | 2.7, 4 | SPLIT_HUNKS | Export de `test-support` pertence à 2.7. Exports de `crypto-payload` e `signing-secret-resolver` pertencem à 4. | CP-2.7 / CP-4 | Médio |
| 148 | `packages/observability/src/logger.ts` | Tracked | Observabilidade | 2.7, 4 | SPLIT_HUNKS | Redação de claims/email/sub pertence à 2.7. Redação de URL de webhooks e payloads pertence à 4. | CP-2.7 / CP-4 | Médio |
| 149 | `packages/contracts/src/index.ts` | Tracked | Contratos | 2.7, 4 | SPLIT_HUNKS | Re-exports dos contratos existentes pertencem ao baseline. Re-exports de `./channel` e `./webhook-ingress` pertencem à 4. | CP-4 | Baixo |

---

## 4. Análise Detalhada dos 11 Arquivos Compartilhados (Hunk a Hunk)

A integridade do isolamento entre iterações exige mapear cada bloco de alteração (hunk) para seu checkpoint correspondente.

### 4.1 `.env.example`
- **Hunk 1 (Linhas 28-44):** Configuração de variáveis de autenticação `AUTH_PROVIDER`, `JWT_SECRET`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `SUPABASE_URL`, `SUPABASE_JWKS_URI`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7`).
  - **Ordem de Aplicação:** Checkpoint 2.
  - **Risco de Separação:** Baixo (variáveis comentadas / defaults locais sem segredos reais).
  - **Lockfile Afetado:** Não.

### 4.2 `.gitignore`
- **Hunk 1 (Linha 11):** Adição de `dist-lab/`.
  - **Pacote Consumidor:** Iteração 3 (`CP-3` — build local de laboratório de UI).
- **Hunk 2 (Linha 44):** Adição de `.vitest/`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7` — runner de testes).
  - **Ordem de Aplicação:** Podem ser antecipados para Governança (`CP-GOV`) para manter o repositório limpo desde o início.
  - **Risco de Separação:** Mínimo.
  - **Lockfile Afetado:** Não.

### 4.3 `apps/api/src/index.ts`
- **Hunk 1 (Linhas 14-20):** Importações de `webhookRoutes`, `ISigningSecretResolver` e `Pool`.
  - **Pacote Consumidor:** Iteração 4 (Pacote CH-04 — Ingress Shielding).
- **Hunk 2 (Linhas 40-48):** Opções em `BuildAppOptions` para `secretResolver`, `masterKeyHex`, `ingressPool`, `rateLimitMax`, `rateLimitWindowMs`.
  - **Pacote Consumidor:** Iteração 4 (CH-04).
- **Hunk 3 (Linhas 115-125):** Registro do plugin `webhookRoutes` com injeção de dependências do pool de ingresso.
  - **Pacote Consumidor:** Iteração 4 (CH-04).
- **Hunk 4 (Linha 174):** Adição de `await app.ready()`.
  - **Pacote Consumidor:** Iteração 2.7 / DevEx (garante inicialização completa antes de retornar instância).
  - **Ordem de Aplicação:** Hunks 1 a 3 aplicados somente em `CP-4`; Hunk 4 aplicado em `CP-2.7`.
  - **Risco de Separação:** Médio (separação limpa via patch progressivo).
  - **Lockfile Afetado:** Não.

### 4.4 `docker-compose.yml`
- **Hunk 1 (Linhas 50-60):** Variáveis de ambiente de Auth no serviço `api` (`AUTH_PROVIDER`, `AUTH_ISSUER`, `AUTH_AUDIENCE`).
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7`).
- **Hunk 2 (Linha 50):** Adição de `INGRESS_DATABASE_URL` no serviço `api`.
  - **Pacote Consumidor:** Iteração 4 (CH-04).
- **Hunk 3 (Linhas 83-91):** Variáveis no serviço `worker` (`WORKER_DATABASE_URL`, `sos_worker_user`, `APP_MASTER_KEY`).
  - **Pacote Consumidor:** Iteração 4 (CH-01 / CH-02).
  - **Ordem de Aplicação:** Hunk 1 em `CP-2.7`; Hunks 2 e 3 em `CP-4`.
  - **Risco de Separação:** Baixo (configuração declarativa em YAML).
  - **Lockfile Afetado:** Não.

### 4.5 `package.json`
- **Hunk 1 (Linhas 14-16):** Scripts `test:db:bootstrap`, `test:db:dispose`, `test:db:run`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7`).
- **Hunk 2 (Linha 17):** Script `test:docker:http`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7` / DevEx).
- **Hunk 3 (Linha 18):** Script `test:browser`.
  - **Pacote Consumidor:** Iteração 3 (`CP-3`).
  - **Ordem de Aplicação:** Hunks 1 e 2 em `CP-2.7`; Hunk 3 em `CP-3`.
  - **Risco de Separação:** Baixo.
  - **Lockfile Afetado:** Não.

### 4.6 `pnpm-lock.yaml`
- **Diagnóstico:** O lockfile atual agrega resoluções de dependências de todas as iterações (e.g. `happy-dom` da Iteração 3, `@types/pg` da Iteração 4 e 2.7).
  - **Estratégia Obrigatória:** Não tentar editar o lockfile manualmente nem fazer merge de hunks YAML. A cada checkpoint (`CP-2.7`, `CP-3`, `CP-4`), o lockfile deve ser regenerado hermeticamente executando `pnpm install --lockfile-only` após aplicar o `package.json` correspondente.
  - **Ordem de Aplicação:** Regeneração a cada checkpoint.
  - **Risco de Separação:** Baixo quando regenerado via CLI oficial.
  - **Lockfile Afetado:** Sim (é o próprio arquivo).

### 4.7 `packages/database/package.json`
- **Hunk 1 (Linha 22):** Adição de `@types/pg: "^8.11.11"` em `devDependencies`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7` — necessário para tipagem de pools no runner hermético `test-support.ts`).
  - **Ordem de Aplicação:** Checkpoint 2.
  - **Risco de Separação:** Baixo.
  - **Lockfile Afetado:** Sim (regenerar lockfile).

### 4.8 `packages/database/src/client.ts`
- **Hunk 1 (Linhas 1-45):** Gerenciamento do pool principal da aplicação `getDatabasePool()`, função utilitária `closeAllDatabasePools()` e suporte a pool opcional em `withTenantTransaction`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7`).
- **Hunk 2 (Linhas 46-95):** Definição de `getIngressDatabasePool()` e `getWorkerDatabasePool()` com variáveis de ambiente dedicadas (`INGRESS_DATABASE_URL`, `WORKER_DATABASE_URL`) e zero fallback silencioso.
  - **Pacote Consumidor:** Iteração 4 (CH-01, CH-04).
- **Hunk 3 (Linhas 145-210):** Helpers transacionais dedicados com `SET ROLE`: `withIngressTransaction` e `withWorkerTransaction`.
  - **Pacote Consumidor:** Iteração 4 (CH-01, CH-04).
- **Hunk 4 (Linhas 211-305):** Funções de acesso blindado `lookupChannelIngress` e `resolveChannelSigningCredential`.
  - **Pacote Consumidor:** Iteração 4 (CH-04, CH-05).
  - **Ordem de Aplicação:** Hunk 1 em `CP-2.7`; Hunks 2, 3 e 4 em `CP-4`.
  - **Risco de Separação:** Médio-Alto (funções dependem de papéis de banco criados na migration 005).
  - **Lockfile Afetado:** Não.

### 4.9 `packages/database/src/index.ts`
- **Hunk 1 (Linha 3):** `export * from "./test-support";`.
  - **Pacote Consumidor:** Iteração 2.7 (`CP-2.7`).
- **Hunk 2 (Linhas 4-5):** `export * from "./infrastructure/crypto-payload";` e `export * from "./infrastructure/database-signing-secret-resolver";`.
  - **Pacote Consumidor:** Iteração 4 (CH-05, CH-06).
  - **Ordem de Aplicação:** Hunk 1 em `CP-2.7`; Hunk 2 em `CP-4`.
  - **Risco de Separação:** Baixo.
  - **Lockfile Afetado:** Não.

### 4.10 `packages/observability/src/logger.ts`
- **Hunk 1 (Linhas 14-45):** Serializers customizados para `req` e `err` aplicando redaction em tempo de execução para rotas de webhook `/v1/webhooks/whatsapp/[redacted]`.
  - **Pacote Consumidor:** Iteração 4 (CH-04).
- **Hunk 2 (Linhas 64-80):** Caminhos adicionais de ofuscação no `pino.redact`:
  - `email`, `sub`, `claims`: Iteração 2.7 (`CP-2.7` — sanitização de identidade e tokens).
  - `payload`, `*.payload`, `connectionString`: Iteração 4 (`CP-4` — criptografia de webhooks e pools de workers).
  - **Ordem de Aplicação:** Hunk 2 (claims de auth) em `CP-2.7`; Hunk 1 e caminhos de canais em `CP-4`.
  - **Risco de Separação:** Baixo.
  - **Lockfile Afetado:** Não.

### 4.11 `packages/contracts/src/index.ts`
- **Hunk 1 (Linhas 6-7):** `export * from "./channel";` e `export * from "./webhook-ingress";`.
  - **Pacote Consumidor:** Iteração 4 (`CP-4` — Pacote CH-00).
  - **Ordem de Aplicação:** Checkpoint 4 (após congelamento dos contratos de canais).
  - **Risco de Separação:** Baixo.
  - **Lockfile Afetado:** Não.

---

## 5. Enumeração e Classificação Individual de Scripts (`scripts/`)

Todos os 3 scripts presentes no diretório `scripts/` foram auditados individualmente:

### 5.1 `scripts/test-db-runner.ts`
- **Domínio:** Banco de Dados / DevEx de Testes.
- **Iteração:** Iteração 2.7 (`CP-2.7`).
- **Ação Proposta:** `KEEP`.
- **Conteúdo e Responsabilidade:**
  - Interface de linha de comando para automação hermética do ciclo de vida de bancos de dados temporários PostgreSQL para suítes Vitest.
  - Suporta comandos `bootstrap` (cria banco efêmero e roda migrations), `dispose` (derruba conexões e descarta o banco) e `run` (orquestra a execução completa da suíte de testes).
  - Protegido por trava de segurança que bloqueia execução a menos que a variável de ambiente `ALLOW_TEST_DB_ADMIN_OPERATIONS=true` seja explicitamente fornecida.
- **Consumidores Comprovados:**
  - Scripts no `package.json`: `"test:db:bootstrap"`, `"test:db:dispose"`, `"test:db:run"`.
  - CI e rotinas locais de execução de testes de isolamento de tenancy e auth.
- **Dependências:** `packages/database/src/test-support.ts`, `tsx`, `pg`.
- **Risco:** Baixo.
- **Gate Recomendado:** Validação de execução de `test:db:run` com suíte de 2.7.

### 5.2 `scripts/verify-browser-qa.mjs`
- **Domínio:** Frontend / QA Automatizado.
- **Iteração:** Iteração 3 (`CP-3`).
- **Ação Proposta:** `KEEP`.
- **Conteúdo e Responsabilidade:**
  - Suíte de automação em browser Google Chrome real via Chrome DevTools Protocol (CDP) sobre WebSocket nativo do Node.js (sem dependências pesadas de Playwright/Puppeteer).
  - Executa validações automatizadas de:
    1. Quarentena de ambiente (bloqueio de dados do catálogo em produção).
    2. Responsividade rigorosa em 3 viewports: Mobile (375px), Tablet (768px) e Desktop (1440px), verificando ausência de overflow horizontal (`scrollWidth <= innerWidth`).
    3. Quebra de texto longo e integridade de botões de ação.
    4. Focus trap acessível em `Dialog` e `Drawer` (Shift+Tab na primeira extremidade salta para a última; Escape fecha e devolve foco ao acionador).
    5. Contraste de cores WCAG 2.2 AA (mínimo 4.5:1 para texto normal de botões).
    6. Registro automático de capturas de tela em `docs/audits/iteration-3/screenshots/`.
- **Consumidores Comprovados:**
  - Script no `package.json`: `"test:browser"`.
  - Relatório de auditoria independente `docs/audits/iteration-3/EVIDENCE.md`.
- **Dependências:** Node.js `>=20` (módulos nativos `child_process`, `fs`, `path`), Google Chrome instalado localmente em `/Applications/Google Chrome.app`.
- **Risco:** Médio (depende da presença do binário do Chrome no ambiente).
- **Gate Recomendado:** Execução no Gate G6 de QA da Iteração 3.

### 5.3 `scripts/verify-docker-http.mjs`
- **Domínio:** Infraestrutura / Verificação Operacional.
- **Iteração:** Iteração 2.7 (`CP-2.7` / DevEx).
- **Ação Proposta:** `KEEP`.
- **Conteúdo e Responsabilidade:**
  - Script de teste de caixa preta contra o container Docker da API Fastify em execução na porta 4400.
  - Gera tokens JWT legítimos usando a biblioteca `@sos-sales/auth` e dispara requisições HTTP reais contra o endpoint autenticado `/v1/me`.
  - Valida cenários de:
    1. Acesso sem token (esperado HTTP 401).
    2. Acesso com token válido (esperado HTTP 200).
    3. Acesso com token expirado (esperado HTTP 401).
    4. Acesso com token assinado com segredo incorreto (esperado HTTP 401).
- **Consumidores Comprovados:**
  - Script no `package.json`: `"test:docker:http"`.
  - Relatório de auditoria `docs/audits/iteration-2.7/EVIDENCE.md`.
- **Dependências:** `packages/auth/dist/index.js`, Node fetch nativo.
- **Risco:** Baixo.
- **Gate Recomendado:** Gate G6 da Iteração 2.7.

---

## 6. Investigação Factual da Migration 005

A migração `packages/database/migrations/005_channel_foundation_inbox_outbox.sql` foi investigada estritamente com base em evidências do código local:

### 6.1 Referências e Consumo em Testes
- **Testes Unitários/Integração:** A migração é testada diretamente pelo arquivo `packages/database/src/__tests__/channel-foundation-security.test.ts`.
- **Mecanismo de Carga:** No framework hermético `packages/database/src/test-support.ts`, a função `bootstrapTestDatabase()` escaneia o diretório de migrações e executa todos os arquivos `.sql` em ordem alfanumérica (`001`, `002`, `003`, `004`, `005`).
- **Impacto no Runner:** Como o arquivo `005_*.sql` está presente no diretório `packages/database/migrations/`, ele é executado sempre que o banco de teste é montado.

### 6.2 Evidência de Aplicação em Ambientes Persistentes
- **Ambiente de Desenvolvimento:** Os bancos locais utilizados em testes são efêmeros (`sos_sales_v3_test_*`) criados e destruídos pelo runner.
- **Ambiente de Produção / VPS:** De acordo com os documentos canônicos (`README.md`, `EXECUTION_BOARD.md`), a V3 **não foi promovida para homologação externa nem para produção**. O banco legado permanece em V2.
- **Conclusão Formal:** **NÃO HÁ EVIDÊNCIA LOCAL** de aplicação da migration 005 em qualquer banco de dados persistente ou imutável. Conforme regra mandatória de projeto, o estado de ambientes persistentes é formalmente classificado como:
  $$\mathbf{UNKNOWN / BLOCKED\_EXTERNAL}$$

### 6.3 Viabilidade de Reescrita antes de Checkpoint Imutável
- **Classificação:** `REWORK`.
- **Justificativa:** Como não existe banco persistente em produção com o schema da migration 005, **a migração pode e deve ser reescrita e saneada** antes da consolidação do checkpoint da Iteração 4.
- **Pontos Críticos a Corrigir no Saneamento (Fase CH-01):**
  1. **Remoção de Senhas Hardcoded:** A migration atualmente contém comandos `CREATE ROLE ... WITH PASSWORD 'sos_...'`. Isso deve ser substituído por injeção segura de senhas via variáveis de ambiente ou criação prévia de papéis via scripts de infraestrutura.
  2. **Ajuste da Restrição `CHECK` de Tentativas:** A constraint `retry_count <= max_retries` deve permitir a transição terminal para `failed` ou `dead_letter` sem violar a si própria no limite de tentativas.
  3. **Garantia de NOT NULL:** A tabela `outbound_commands` deve impor `message_id UUID NOT NULL` para manter consistência referencial estrita com a tabela de mensagens.
  4. **Correção de Roles:** Concessão correta de privilégios de `UPDATE` e `SELECT` estritamente necessários para os papéis `sos_worker_user` e `sos_ingress_user`.

---

## 7. Conflitos, Sobreposições e Débitos Conhecidos da Fase CH

A revisão técnica independente identificou os seguintes pontos de atenção arquitetural na implementação da Iteração 4 que exigem saneamento durante os pacotes `CH-00` a `CH-12`:

1. **Lease Renewal no Worker:** Leases de 30 segundos não possuem renovação automática durante processamento sequencial de mensagens grandes no `OutboxDispatcher`.
2. **Reenvio após Crash:** Falha de worker após emissão de HTTP externo antes de gravar o receipt pode induzir reenvio de mensagem se não houver reconciliação com `provider_message_id`.
3. **SSRF Guard Desacoplado:** O `ssrf-guard.ts` foi construído como módulo independente mas ainda não está interceptando as chamadas do `MetaWabaAdapter` e `WahaAdapter`.
4. **Vulnerabilidade de SSRF em `mediaUrl`:** O adaptador WAHA aceita `mediaUrl` que pode apontar para recursos de rede interna.
5. **Rate Limiter em Memória:** O endpoint de webhook usa rate limiting em memória do Fastify, contornável caso o token de endpoint mude ou em cenários de múltiplos nós sem Redis compartilhado.
6. **Token nos Logs do Fastify:** O token de rota do webhook pode ser capturado pelo logger automático do Fastify antes de passar pelo sanitizador de URL.

---

## 8. UNKNOWNs e Decisões Necessárias

| # | Item | Descrição | Impacto | Decisão / Encaminhamento |
|---|---|---|---|---|
| U-01 | **Aplicação de Migration 005 Remota** | Incerteza se algum ambiente de staging ou VPS privado chegou a rodar a migration 005. | Médio | Declarado `UNKNOWN/BLOCKED_EXTERNAL`. Tratar banco V3 como greenfield e reescrever a migration 005 no pacote CH-01. |
| U-02 | **Supabase JWKS de Homologação (EXT-01)** | Ausência de endpoint JWKS remoto real disponível no ambiente local. | Baixo | Mantido em mock/test suite local. Dependência externa real tratada como `BLOCKED_EXTERNAL` no pacote G-02/G-05. |
| U-03 | **Contas Oficiais Meta WABA (EXT-02/03)** | Ausência de App ID e credenciais de produção da Meta no laboratório. | Baixo | Adaptador testado exclusivamente via `MockChannelAdapter` e fixtures canônicas até liberação de homologação externa. |
| U-04 | **Container WAHA em Docker Lab (EXT-05)** | Perfil Docker do WAHA não está levantado no compose padrão. | Baixo | Criar profile Docker opcional `docker compose --profile waha up` no pacote CH-09 sem acoplar a suíte hermética. |

---

## 9. Parecer de Conclusão do Inventário

O inventário do working tree está **100% concluído**, com todas as **149 entidades de arquivo catalogadas individualmente**, sem qualquer agrupamento cego de diretórios. O estado do repositório original `CHAT-SALES` permanece estritamente intocado, pronto para receber o plano de separação `G-01-SEPARATION-PLAN.md` e os gates `G-01-GATES.md`.
