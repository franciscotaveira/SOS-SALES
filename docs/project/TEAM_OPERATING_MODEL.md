# Team Operating Model

## Papéis

| Papel | Responsabilidade |
|---|---|
| Francisco / Product Owner | prioridade, escolhas comerciais e autorização de produção |
| Sol / Principal Orchestrator | arquitetura, pacotes, prompts, gates e auditoria |
| Gemini 3.8 / Executor | implementação no pacote autorizado |
| Product Agent | fluxo, usuário, escopo e métricas |
| Data & Security Agent | PostgreSQL, RLS, migrations, segredos |
| Backend Agent | API, aplicação, workers e filas |
| Channel Agent | WABA, WAHA, webhooks, mídia e reconciliação |
| Frontend Agent | Design System, Cockpit e onboarding |
| Meta/CAPI Agent | ativos, atribuição, eventos e recibos |
| AI/Safety Agent | agente, memória, tools, evals e handoff |
| SRE Agent | Docker, CI, observabilidade, backup e rollback |
| QA Agent | contratos, integração, concorrência, browser e regressão |
| Independent Reviewer | revisão read-only; nunca aprova o próprio trabalho |

## Contrato de execução

Cada prompt do Gemini precisa conter:

1. ID do pacote;
2. objetivo único;
3. estado e dependências;
4. arquivos sob ownership;
5. fatos confirmados;
6. invariantes;
7. alterações obrigatórias;
8. testes que devem falhar antes;
9. critérios de aceite;
10. comandos de gate;
11. evidências esperadas;
12. proibições;
13. condição explícita de parada.

Um prompt não abrange mais de um pacote crítico.

## Continuidade

Ao encerrar um pacote:

```text
executor entrega IMPLEMENTED
→ revisor independente confronta spec/diff/testes
→ QA reproduz no SHA
→ orquestrador atualiza matriz e board
→ pacote recebe ACCEPTED ou volta a IN_PROGRESS
→ próximo READY previamente autorizado e reversível inicia automaticamente
```

A equipe só para por decisão real do Product Owner, ação irreversível não autorizada ou dependência externa sem trabalho independente disponível. Integrações externas com efeito real, piloto, cutover e produção exigem autorização explícita do Product Owner.
