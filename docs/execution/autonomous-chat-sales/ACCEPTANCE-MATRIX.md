# ACCEPTANCE-MATRIX.md — Matriz Canônica de Aceite P1–P8

> **Critério de Saída Soberano:** Para atingir `VERIFIED_DOCKER_LAB`, todos os percursos P1 a P8 devem estar no estado `PASSED` comprovados no mesmo SHA e executados contra a stack Docker real com Provedor Sintético HTTP fiel ao contrato.
> **Estado Atual:** `RECALIBRADO_POS_AUDITORIA` (Declaração M10 retratada; percursos em remediação).

---

## 1. Percursos Críticos P1 a P8 (Status Atual Honesto)

| ID | Percurso | Critério Obrigatório | Estado | Evidência / Pendência |
| :--- | :--- | :--- | :---: | :--- |
| **P1** | **Atendimento Normal** | Webhook no Provedor Sintético $\rightarrow$ Inbox $\rightarrow$ Worker/API $\rightarrow$ Timeline no Navegador $\rightarrow$ Operador cria Proposta/Pix $\rightarrow$ Envio Outbox $\rightarrow$ Worker $\rightarrow$ Adapter HTTP $\rightarrow$ Recibo Provedor $\rightarrow$ Status `sent/delivered` $\rightarrow$ Outcome | `TODO` | Pendente E2E em stack Docker completa (Fase R5) |
| **P2** | **Isolamento Multi-Tenant** | Operação em Workspace A nunca vaza para Workspace B em nenhum recurso (conversas, mensagens, rascunhos, ações, catálogo, Pix, sugestões, credenciais e CAPI) | `TODO` | Coberto em testes unitários; pendente teste negativo multi-tenant em runtime Docker |
| **P3** | **Concorrência & Repetição** | Cliques repetidos ou requisições paralelas produzem exatamente um efeito lógico; conflitos retornam 409 estável sem corromper estado | `TODO` | Requer concorrência real em Propostas, Outcomes e Ações Comerciais |
| **P4** | **Mudança de Contexto** | Troca rápida entre duas conversas durante carregamento lento não mistura rascunhos ou dados de timeline; recarga preserva rascunho | `TODO` | Requer automação fail-closed no navegador com atraso induzido |
| **P5** | **Falha & Retomada** | Restart real de API, Worker e Redis do CHAT-SALES sem perda de mensagens; leases expirados transitam para reconciliação | `TODO` | Requer teste de injeção de falhas com container restarts reais |
| **P6** | **Estados Financeiros Honestos** | Distinção explícita entre gerado, conferido no caixa e confirmado por banco; zero menção a liquidação bancária sem integração real | `PARTIAL` | Coberto em `pix.test.ts`; pendente integração com timeline e recibo do provedor |
| **P7** | **Sugestão Governada** | Sugestão aceita/dispensada/expirada/invalidada é estritamente imutável; replay idempotente na criação independe de eventos posteriores | `PARTIAL` | Teste M1 unitário aprovado; pendente teste de UI e rota real sem UPDATE manual |
| **P8** | **Extensão Indisponível (Zero n8n)** | O produto funciona 100% com n8n completamente desligado; nenhuma tela ou erro quebra pela ausência de extensões | `PASSED` | Arquitetura desacoplada; comprovado nas suítes locais |

---

## 2. Capacidades de Plataforma & Segurança

| Área | Requisito | Status | Observação |
| :--- | :--- | :---: | :--- |
| **Tenant Isolation** | FORCE ROW LEVEL SECURITY ativo em todas as tabelas comerciais | `PARTIAL` | RLS ativo; pendente restrição de permissão do worker (S-04) |
| **RBAC** | Bloqueio de rotas com efeitos para papéis insuficientes | `PASSED` | 7/7 controles HTTP aprovados contra API Docker |
| **Outbox Pattern** | Mensagem + Comando de envio persistidos na mesma transação SQL | `PASSED` | Persistência transacional aprovada |
| **Pix EMVCo** | Geração e validação de CRC-16 conforme BACEN sem APIs externas | `PASSED` | Algoritmo autônomo em conformidade |
| **Zero Mock Policy** | Ausência total de dados falsos, mocks de demonstração ou valores hardcoded | `IN_PROGRESS` | Sanitização de credenciais concluída; falta limpar endpoints de simulação |
