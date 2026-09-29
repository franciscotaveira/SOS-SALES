# SOS Sales V3 — Sistema Canônico de Execução

> Fonte de verdade para planejamento, execução, aceite e entrega da V3.  
> Criado em 19 de setembro de 2026.  
> Estado atual: `G-00` a `G-06`, `CH-00` a `CH-09` aceitos; `CH-10` em `READY`; sem autorização para produção.

## Ordem de autoridade

1. `PRODUCT_CHARTER.md` define por que o produto existe e a fronteira do MVP.
2. `MASTER_ROADMAP.md` define a ordem, dependências e gates do projeto.
3. `PROJECT_EXECUTION_PLAN.md` traduz o roadmap em programa de equipe do início ao fim.
4. `APP_FLOW.md` consolida o fluxo do app, jornadas de usuário e máquinas de estado.
5. `EXECUTION_BOARD.md` registra o estado factual de cada pacote.
6. `QUALITY_GATES.md` e `DEFINITION_OF_DONE.md` definem como um pacote avança.
7. `ACCEPTANCE_MATRIX.md` liga requisito, teste, evidência e revisão.
8. `RISK_REGISTER.md` registra riscos, responsáveis e contingências.
9. `RELEASE_STRATEGY.md` governa laboratório, piloto, produção e rollback.
10. ADRs registram decisões arquiteturais duráveis.
11. `docs/work-packages/<ID>-*.md` contém a execução delimitada de cada pacote.

Planos temporários, walkthroughs e relatórios de executor não substituem estes documentos.

## Regra de status

Os únicos estados válidos são:

`PLANNED → READY → IN_PROGRESS → IN_REVIEW → IN_QA → ACCEPTED → RELEASE_CANDIDATE → PILOT → RELEASED → VERIFIED_PRODUCTION`

Estados alternativos: `BLOCKED`, `BLOCKED_EXTERNAL`, `DEFERRED`, `ROLLED_BACK` e `CANCELLED`.

`IMPLEMENTED` e `TESTED_LOCAL` são qualificadores de evidência, não estados de conclusão.

## Ciclo gstack por pacote

```text
/spec
→ /plan-ceo-review quando houver decisão de produto
→ /plan-design-review quando houver interface
→ /plan-eng-review obrigatório
→ /plan-devex-review quando houver impacto na operação de desenvolvimento
→ /autoplan para consolidar decisões
→ execução por agentes com ownership fechado
→ /review independente
→ /qa
→ checkpoint versionado
→ /retro
```

O gstack governa o ciclo. O roadmap governa a ordem do produto.

## Regra anti-falso-concluído

Um executor pode declarar `IMPLEMENTED`, nunca `ACCEPTED`. O aceite exige simultaneamente:

- critérios congelados antes da implementação;
- código ligado a um commit ou digest imutável;
- evidência reproduzível;
- revisão independente por agente diferente;
- zero P0/P1 abertos;
- atualização do board e da matriz de aceite.

Teste passando, container saudável, screenshot ou relatório textual isolado não comprovam funcionamento E2E.

P0 e P1 nunca recebem waiver. Apenas P2 ou requisito comprovadamente não aplicável pode receber waiver, sempre com owner, justificativa, aprovação do Product Owner e data de expiração.
