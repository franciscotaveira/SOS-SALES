# ACCEPTANCE-MATRIX.md — Matriz de Aceite P1–P8

> **Critério de Saída:** Para atingir `VERIFIED_DOCKER_LAB`, todos os percursos P1 a P8 devem estar no estado `PASSED` no mesmo SHA e ambiente hermético.

---

## 1. Percursos Críticos P1 a P8

| ID | Percurso | Critério Obrigatório | Estado | Evidência |
| :--- | :--- | :--- | :---: | :---: |
| **P1** | **Atendimento Normal** | Mensagem entra pelo canal $\rightarrow$ aparece na timeline $\rightarrow$ operador atende $\rightarrow$ consulta catálogo $\rightarrow$ gera Pix/proposta $\rightarrow$ registra próxima ação $\rightarrow$ registra outcome WON | `TODO` | Pendente validação conjunta com E2 |
| **P2** | **Isolamento Multi-Tenant** | Operação em Workspace A nunca vaza para Workspace B (conversas, mensagens, rascunhos, ações, catálogo, Pix, sugestões e credenciais) | `TODO` | Coberto parcialmente (24 testes); pendente unificação |
| **P3** | **Concorrência & Repetição** | Cliques repetidos ou requisições paralelas produzem um único efeito lógico; conflitos retornam 409 estável sem corromper estado | `TODO` | Em validação em M1 |
| **P4** | **Mudança de Contexto** | Troca rápida entre duas conversas durante carregamento lento não mistura rascunhos ou dados de timeline; recarga preserva rascunho | `PASSED` | Auditado em `verify-e1-trust-browser.mjs` (`e1-cashier-draft-persisted.png`) |
| **P5** | **Falha & Retomada** | Restart de API/Worker/Redis e timeouts de provedor não perdem mensagens; leases expirados transitam para reconciliação | `TODO` | Pendente teste de resiliência M8 |
| **P6** | **Estados Financeiros Honestos** | Distinção explícita entre gerado, conferido no caixa e confirmado por banco; zero menção a liquidação bancária sem integração real | `PASSED` | Auditado em `pix.test.ts` e `verify-e1-trust-browser.mjs` |
| **P7** | **Sugestão Governada** | Sugestão aceita/dispensada/expirada/invalidada é estritamente imutável; replay idempotente na criação independe de eventos posteriores | `IN_PROGRESS` | Objeto do Milestone M1 (Hotfix F1.1-C.1) |
| **P8** | **Extensão Indisponível (Zero n8n)** | O produto funciona 100% com n8n completamente desligado; nenhuma tela ou erro quebra pela ausência de extensões | `PASSED` | Arquitetura desacoplada; comprovado nas suítes locais |

---

## 2. Capacidades de Plataforma

| Área | Requisito | Status |
| :--- | :--- | :---: |
| **Tenant Isolation** | FORCE ROW LEVEL SECURITY ativo em todas as tabelas comerciais | `PASSED` |
| **RBAC** | Bloqueio de rotas com efeitos para papéis insuficientes | `PASSED` |
| **Outbox Pattern** | Mensagem + Comando de envio persistidos na mesma transação SQL | `PASSED` |
| **Pix EMVCo** | Geração e validação de CRC-16 conforme BACEN sem APIs externas | `PASSED` |
| **Zero Mock Policy** | Ausência total de dados falsos, mocks de demonstração ou valores hardcoded | `PASSED` |
