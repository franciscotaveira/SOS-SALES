# Roadmap e Critérios de Mercado

## 1. Estado consolidado

### Entregue ou com base funcional

- tenancy, RBAC e RLS;
- ingress/outbox, WAHA/WABA adapters e worker;
- Cockpit, contatos e histórico;
- oportunidades, outcomes e próxima ação;
- catálogo, propostas e Pix;
- templates e flows em base funcional;
- Radar governado;
- deploy Docker no VPS.

### Lacunas prioritárias

- sincronização real e estável de canais por cliente;
- remoção de dados mock e deduplicação de catálogo;
- onboarding self-service completo;
- gestão completa de tokens e webhooks;
- CAPI comprovada ponta a ponta;
- IA assistida com evals e custos;
- observabilidade e runbooks executados;
- homologação com cliente real.

## 2. Fases

### Fase A — Produto operacional confiável

- corrigir canais, sync e atualização;
- concluir CRUDs de contatos, catálogo e oportunidades;
- remover mocks;
- provar conversa real → oportunidade → outcome;
- finalizar erros, vazios e feedback de UX.

**Gate:** operador completa a venda sem assistência técnica.

### Fase B — Onboarding replicável

- wizard de workspace e equipe;
- WABA/WAHA sem intervenção no banco;
- catálogo/funil inicial;
- checklist de go-live;
- configuração padrão de Radar e IA.

**Gate:** segundo cliente entra sem mudança de código.

### Fase C — Integrações comerciais

- tokens com escopos;
- webhooks assinados;
- painel de entrega/replay;
- pacote n8n oficial;
- conectores iniciais.

**Gate:** automação externa opera sem credencial administrativa.

### Fase D — Inteligência e mensuração

- resumo e sugestão de resposta;
- Radar com regras configuráveis;
- templates WABA assistidos;
- CAPI e atribuição com recibos;
- métricas de qualidade e custo.

**Gate:** inteligência melhora resultado sem aumentar risco operacional.

### Fase E — Escala SaaS

- planos, limites e faturamento;
- console interno de suporte;
- observabilidade por tenant;
- retenção/LGPD self-service;
- capacidade e autoscaling baseados em medição.

## 3. Critério mínimo para comercialização

Pode iniciar piloto pago quando:

- canal do cliente está estável;
- backup e rollback existem;
- isolamento tenant foi testado;
- equipe consegue operar o fluxo principal;
- limites do piloto estão no contrato;
- suporte e incidentes têm responsável;
- nenhuma tela crítica depende de mock;
- métricas básicas estão sendo coletadas.

Disponibilidade geral exige onboarding repetível, restore ensaiado, APIs governadas e operação observável.

## 4. Definition of Done de uma capacidade

- requisito e regra de negócio documentados;
- implementação global, sem hardcode de cliente;
- RBAC/RLS e auditoria quando aplicáveis;
- estados loading/vazio/erro/sucesso;
- teste relevante;
- evidência E2E no ambiente correto;
- documentação/runbook atualizados;
- métrica e rollback definidos.
