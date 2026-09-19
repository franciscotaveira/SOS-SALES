# Plano Executivo de Construção — SOS Sales V3

## Objetivo do programa

Entregar um SaaS multi-tenant que conecta aquisição Meta, atendimento WhatsApp, operação comercial, IA supervisionada e feedback CAPI em um ciclo verificável, operável por novos clientes sem depender de um desenvolvedor.

Este documento transforma o roadmap em um programa de trabalho. O `MASTER_ROADMAP.md` continua sendo a autoridade para IDs e dependências; o `EXECUTION_BOARD.md` contém o estado factual.

## Como a equipe trabalha

Cada pacote passa por:

```text
spec → revisão de produto/design/engenharia aplicável
→ implementação delimitada
→ revisão independente
→ QA reproduzível no SHA
→ aceite e checkpoint
```

Sol mantém arquitetura, sequência, prompts, gates e auditoria. Gemini 3.8 executa somente o pacote autorizado. Agentes especializados analisam produto, dados/segurança, backend, canais, frontend, Meta/CAPI, IA, SRE e QA com ownership sem sobreposição.

## Programa do início ao fim

| Etapa | Pacotes | Equipe principal | O que será feito | Resultado esperado | Gate |
|---|---|---|---|---|---|
| 0. Preservar e rebaselinar | G-00..G-06 | Tech Lead, SRE, QA | snapshot, inventário, separação 2.7/3/4, auditoria retrospectiva e CI | repositório limpo, histórico confiável, evidência por SHA | zero mudança órfã; fases antigas confirmadas ou reabertas |
| 1. Fundação tenant-first + telemetria base | P-01..P-06, OPS-F01/03 | Data/Security, Backend, SRE | workspace, identidade, RBAC, RLS, keyring, auditoria, correlação e flags | isolamento multi-tenant comprovado, segredos governados e efeitos controláveis | zero cross-tenant, zero segredo em log e kill switch auditável |
| 2. Modelo mínimo de mensageria | CH-00 | Data/Security, Messaging | contato, thread e mensagem mínimos | base suficiente para provar webhook até status | migrations e RLS negativas aprovadas |
| 3. Runtime de filas + operação transversal | CH-01..CH-03, OPS-F02 | Backend, Messaging, SRE, QA | claims, leases, fencing, terminalidade, DLQ e reconciliação | workers concorrentes sem perda ou repetição insegura | fault injection, recovery e reprocessamento aprovados |
| 4. Ingresso seguro | CH-04..CH-07 | Security, Backend, SRE | assinatura, replay, rate limit, keyring E2E, SSRF e mídia | webhook público fail-closed e observável | testes de ataque e indisponibilidade aprovados |
| 5. Provedores WhatsApp + alertas | CH-08..CH-12, OPS-F04 | Channel, Backend, SRE | WABA, WAHA, Docker dual-engine, produtor outbox, E2E, dashboards e alertas | mensagem real entra, aparece, responde e recebe status com degradação visível | WABA e WAHA comprovados separadamente; alertas P0 reproduzidos |
| 6. Núcleo comercial | CRM-01..CRM-07 | Product, Backend, Data | ownership, funil, atividades, outcomes, agenda e APIs | operação comercial íntegra sem confundir conversa com venda | jornada contato → outcome auditável |
| 7. Cockpit | UI-01..UI-10 | Product Design, Frontend, QA | fila, timeline, composer, dossiê, funil, agenda, estados e acessibilidade | operador atende lead real com baixo atrito em desktop e mobile | Browser QA 375/768/1440 e a11y |
| 8. Meta e CAPI | META-01..05, CAPI-01..06 | Meta/CAPI, Backend, Data | ativos, CTWA/Lead Ads, ledger, atribuição, elegibilidade, despacho e recibos | campanha → conversa → outcome → recibo quando elegível | Test Events e diagnóstico de falha aprovados |
| 9. IA supervisionada | AI-01..AI-10 | AI/Safety, Product, QA | modelo, playbooks, conhecimento, tools, políticas, handoff, evals e shadow | IA auxilia sem agir fora da autonomia concedida | red team, shadow e kill switch |
| 10. Onboarding | ONB-01..ONB-10 | Product, Frontend, Channel, Support | conexão guiada, diagnóstico e checklist | novo workspace chega ao go-live sem desenvolvedor | onboarding repetido por terceiro |
| 11. Prontidão operacional | OPS-R01..06 | SRE, Security, Support | suporte auditado, LGPD, backup/restore e runbooks sobre OPS-F já ativo | sistema reversível e suportável para o piloto | simulações de incidente, restore e outage |
| 12. Migração e piloto | MIG-01..MIG-09 | Migration, SRE, QA, Product Owner | export, staging, shadow, dry-run, cutover, observação e rollback | Haven migra sem perda; processo vira template | autorização humana, 72h e rollback ensaiado |
| 13. Beta e GA | gates de mercado | Produto, SRE, Suporte, QA | 3–5 workspaces, capacidade, custos, suporte e rollout gradual | produto vendável e operável com limites conhecidos | SLO, 30 dias, onboarding e incident response |

## Entregáveis obrigatórios de cada etapa

1. spec e critérios Given/When/Then congelados;
2. threat model e impacto tenant quando aplicável;
3. migrations expand/contract e rollback seguro;
4. código e testes no ownership do pacote;
5. telemetria, feature flags e runbook para efeitos externos;
6. evidence manifest ligado a SHA/digest;
7. revisão independente e QA reproduzível;
8. board, matriz de aceite e riscos atualizados.

## Definição do produto esperado

Ao terminar, o SOS Sales V3 deve permitir que um cliente elegível:

- crie seu workspace, equipe e permissões;
- conecte WABA ou WAHA com diagnóstico verificável;
- receba leads da Meta e preserve a evidência de origem;
- atenda pelo Cockpit com IA opcional e handoff humano;
- administre funil, agenda e outcome comercial real;
- envie somente conversões elegíveis e veja o recibo da Meta;
- identifique falhas, reprocese com segurança e acione suporte por runbook;
- faça onboarding e operação rotineira sem intervenção de engenharia.

## Limites de conclusão

- build, health check e teste unitário não provam a jornada real;
- integração externa só é aceita com prova no ambiente correspondente;
- piloto e produção exigem autorização do Product Owner;
- V2 permanece intacta até cutover autorizado por workspace;
- não há avanço de release com P0/P1 aberto.

## Próxima execução autorizável

1. executar G-00 sem modificar o conteúdo do working tree;
2. concluir G-01 sobre a cópia preservada;
3. aceitar G-02 após a revisão final destes documentos;
4. produzir G-03 antes de separar qualquer commit;
5. só então reconstruir e validar os checkpoints existentes.
