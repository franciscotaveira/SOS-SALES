# SOS Sales API

> **Sistema Operacional de Continuidade Comercial e Navegação de Vendas**  
> *MCT LTDA — Chapecó, BR*

---

## 🎯 Manifesto de Arquitetura

1. **A Venda como Continuidade Cognitiva:** O atendimento não deve reiniciar a jornada do lead com aberturas genéricas. Ele deve honrar o gancho do anúncio que gerou o clique.
2. **Fato não é Inferência; Inferência não é Decisão:** Fatos são auditáveis e imutáveis. Inferências carregam confiança e evidência. Decisões passam por políticas de segurança.
3. **Projeção Materializada:** O `ConversationDecisionContext` é uma visão calculada do estado da jornada a partir de eventos, nunca um estado sobrescrito às cegas.
4. **Isolamento Absoluto:** Zero acoplamento com legado de ERP, módulos de hotel ou bancos de dados compartilhados. Supabase dedicado (PostgreSQL 17 na porta `55432`) e filas próprias (Redis 7 na porta `6381`).

---

## 🏗️ Estrutura do Repositório (Clean Architecture / DDD)

```text
SOS-SALES/apps/api/
├── docker-compose.yml          # Redis 7 dedicado (porta 6381)
├── supabase/                   # Supabase Local (PostgreSQL 55432, API 55431, Studio 55433)
│   ├── config.toml
│   ├── migrations/             # Schema SQL v2 com RLS e triggers de imutabilidade
│   └── seed.sql                # Seed determinístico para testes e pilotos
├── package.json                # TypeScript, Fastify, Zod, BullMQ, Vitest
├── tsconfig.json               # Configuração NodeNext ES2022
├── .env.example                # Variáveis de ambiente com placeholders
└── src/
    ├── domain/                 # Entidades puras, Eventos, Serviços de Domínio e Tipos
    │   ├── entities/
    │   ├── events/
    │   ├── services/
    │   └── types/              # Contrato de Domínio V2
    ├── application/            # Casos de Uso, Projeções de Estado e Políticas
    │   ├── policies/           # Guarda-corpos e limites de autonomia de IA
    │   ├── projections/        # Motor de cálculo do ConversationDecisionContext
    │   └── usecases/           # Ingestão de mensagens, Handoff, Atualização de fatos
    ├── infrastructure/         # Banco de Dados, Adapters WhatsApp (WAHA/Cloud), Meta CAPI
    │   ├── ai/                 # Provedor OpenRouter / LLM Decision Engine
    │   ├── channels/           # WhatsApp Webhooks e Clientes
    │   ├── database/           # Conexão PostgreSQL (pool pg)
    │   ├── queue/              # Filas BullMQ e Jobs assíncronos
    │   └── telemetry/          # Logs estruturados e métricas de continuidade
    └── interfaces/             # Camada de Entrada
        ├── http/               # Rotas REST Fastify
        ├── realtime/           # WebSockets para real-time no Inbox
        └── webhooks/           # Endpoints de recebimento do WhatsApp e Meta
```

---

## 🚀 Como Inicializar

```bash
# 1. Entrar na pasta raiz
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES/apps/api

# 2. Configurar o ambiente
cp .env.example .env

# 3. Instalar as dependências
npm install

# 4. Subir a infraestrutura isolada (Supabase DB 55432 + Redis 6381)
npm run infra:up

# 5. Executar a suíte de testes de integridade e RLS
npm run check

# 6. Rodar o servidor da aplicação em desenvolvimento
npm run dev
```

### Sandbox WAHA local (opcional)

O WAHA não é iniciado por `infra:up`: ele precisa de um arquivo local ignorado pelo Git
(`.env.waha.local`) e deve conectar apenas um número de teste. Para subir o sandbox:

```bash
npm run waha:up
```

- Dashboard: `http://localhost:3002/dashboard/`
- A porta é restrita a `127.0.0.1`; não há exposição pública.
- As credenciais locais ficam em `.env.waha.local`; troque-as antes de criar qualquer túnel HTTPS.
- Para parar sem apagar a sessão: `npm run waha:down`.

Para iniciar o Sales OS com o resolvedor de identidade WAHA ligado, use:

```bash
npm run dev:waha
```

Ele lê `.env.waha.local` sem expor valores no terminal. Novas instalações devem
definir `WAHA_API_KEY` e `WAHA_WEBHOOK_SECRET`; o nome local legado
`SALES_OS_WEBHOOK_SECRET` continua aceito apenas para compatibilidade.

O padrão que está comprovado na VPS é o motor **GOWS**, com volume persistente,
logs JSON e webhook interno assinado. Para não derrubar uma sessão WEBJS já
pareada, este sandbox mantém WEBJS como padrão. Para uma nova sessão de
homologação, defina `WAHA_DEFAULT_ENGINE=GOWS` em `.env.waha.local`, reinicie
somente `sos-waha` e pareie o novo nome de sessão por QR. Não migre uma sessão
já conectada sem uma janela de teste: a autenticação do motor pode exigir novo
pareamento.

Eventos de grupo, status, saída própria e identificadores `@lid` sem telefone
verificado são preservados no envelope imutável, mas não criam contato nem
entram em retentativa. Isso evita poluir a fila e impede atribuir uma conversa
ao número errado.

---

## 📊 Governança de Dados (20 Tabelas)

* **Multi-Tenancy & Acesso:** `workspaces`, `workspace_memberships`, `channel_connections`, `channel_connection_secrets`.
* **Ingestão & Ciclo:** `contacts`, `commercial_journeys`, `inbound_channel_events`, `conversation_messages`, `conversation_message_events`.
* **Motor Cognitivo:** `acquisition_contexts`, `known_facts`, `decision_events`, `decision_states`, `recommended_actions`, `executed_actions`, `handoff_cases`.
* **Fechamento & Resiliência:** `commercial_outcomes`, `compliance_redaction_events`, `projection_checkpoints`, `outbox_events`.
