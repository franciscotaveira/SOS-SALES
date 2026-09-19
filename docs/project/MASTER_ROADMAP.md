# Master Roadmap — SOS Sales V3

## Norte

```text
Novo cliente
→ onboarding
→ canal saudável
→ lead real
→ atendimento
→ outcome
→ atribuição
→ CAPI
→ operação observável
```

## Caminho crítico

```text
G — Rebaseline
→ P — Plataforma tenant-first
→ CH — Motor de canais
→ CRM — Núcleo comercial
→ UI — Cockpit
→ META/CAPI — Loop de aquisição e retorno
→ AI — IA supervisionada
→ ONB — Onboarding repetível
→ OPS — Operação
→ MIG — Haven e migração
→ GA — Beta e disponibilidade geral
```

AI e META podem ser especificados em paralelo após estabilização dos contratos, mas nenhum efeito externo é ativado antes dos gates anteriores.

## Fase G — Governança e baseline

| ID | Entrega | Dependência | Gate de saída |
|---|---|---|---|
| G-00 | Snapshot bruto e recuperável do estado atual | — | referência imutável, diff e arquivos não rastreados preservados |
| G-01 | Inventário factual do working tree | G-00 | todo arquivo mapeado para iteração/pacote |
| G-02 | Documentos canônicos do projeto | paralelo a G-00/G-01; aceite exige G-00 | roadmap, board, gates, matriz e riscos revisados |
| G-03 | Plano de reconstrução e separação | G-01/G-02 | ordem, ownership e checkpoints aprovados |
| G-04 | Separar Iterações 2.7, 3 e 4 | G-03 | nenhum commit mistura domínios |
| G-05 | Auditar retrospectivamente 1–2.6 e revalidar 2.7/3 | G-04 | manifests por SHA; aceitações antigas confirmadas ou reabertas |
| G-06 | CI mínimo e evidence manifest | G-05 | gates automáticos vinculados ao SHA |

Nenhum código funcional novo começa antes de G-05.

## Fase P — Plataforma tenant-first

| ID | Entrega | Gate |
|---|---|---|
| P-01 | organizações, workspaces e memberships | CRUD tenant-safe |
| P-02 | autenticação JWT/Supabase | issuer/audience/JWKS e falhas comprovadas |
| P-03 | RBAC de aplicação | matriz de permissões negativa |
| P-04 | RLS/FORCE RLS | zero leitura ou escrita cross-tenant |
| P-05 | segredos e keyring | rotação sem indisponibilizar itens antigos |
| P-06 | auditoria append-only | eventos críticos rastreáveis |

Estado atual: base consolidada até Iteração 2.6; 2.7 requer checkpoint em G-05.

## Fase CH — Motor de comunicação

| ID | Entrega | Dependência | Gate |
|---|---|---|---|
| CH-00 | modelo mínimo de contato, thread e mensagem | G-05 | persistência tenant-safe suficiente para o E2E de canal |
| CH-01 | RLS do worker fail-closed | CH-00 | testes cross-tenant com roles reais |
| CH-02 | claims, retry, lease e fencing | CH-01 | dois workers sem duplicação |
| CH-03 | estados terminais e reconciliação | CH-02 | nenhum item preso; ambíguo reconciliável |
| CH-04 | ingress seguro | CH-01 | raw body, assinatura, replay e logs seguros |
| CH-05 | Redis rate limiting e proxy confiável | CH-04 | cota consistente entre réplicas |
| CH-06 | keyring E2E | CH-04 | item v1 processado após ativar v2 |
| CH-07 | SSRF e mídia segura | CH-04 | DNS, redirect, IP, mídia e allowlist |
| CH-08 | WABA operacional | CH-02/06/07 | texto, mídia, template, janela e status |
| CH-09 | WAHA operacional | CH-02/06/07 | sessão, webhook, envio e mídia |
| CH-10 | Docker dual-engine | CH-08/09 | profiles reproduzíveis e saudáveis |
| CH-11 | produtor transacional | CH-03 | message + outbox na mesma transação |
| CH-12 | E2E técnico | CH-10/11 | webhook → conversa → resposta → status |

## Fase CRM — Núcleo comercial

| ID | Entrega | Dependência |
|---|---|---|
| CRM-01 | ownership, responsáveis e políticas de atribuição | CH-12 |
| CRM-02 | funis, etapas e oportunidades | CRM-01 |
| CRM-03 | atividades, notas e tags | CRM-01 |
| CRM-04 | outcomes com valor e prova | CRM-02 |
| CRM-05 | agenda por porta | CRM-02 |
| CRM-06 | APIs, paginação e filtros comerciais | CRM-01..05 |
| CRM-07 | auditoria e projeções operacionais | CRM-06 |

Invariantes: contato não é oportunidade; conversa não é venda; outcome exige identidade, instante e origem; toda entidade tenant-owned carrega `workspace_id`.

## Fase UI — Cockpit operacional

| ID | Entrega | Dependência |
|---|---|---|
| UI-01 | fila real de conversas | CRM-07 |
| UI-02 | timeline real | UI-01 |
| UI-03 | composer e envio transacional | CH-11/UI-02 |
| UI-04 | dossiê e oportunidade | CRM-07 |
| UI-05 | atribuição humana e handoff | UI-03 |
| UI-06 | funil Kanban | CRM-07 |
| UI-07 | agenda | CRM-06 |
| UI-08 | configuração e saúde de canais | CH-12 |
| UI-09 | estados universais e acessibilidade | UI-01..08 |
| UI-10 | Browser QA 375/768/1440 | UI-09 |

## Fase META/CAPI — Aquisição, atribuição e retorno

| ID | Entrega | Dependência |
|---|---|---|
| META-01 | conexão e inventário de ativos | CH-08 |
| META-02 | Graph API versionada | META-01 |
| META-03 | CTWA e Lead Ads | META-01 |
| META-04 | ledger de touchpoints | META-03 |
| META-05 | resolver por hierarquia de evidências | META-04 |
| CAPI-01 | política de elegibilidade | CRM-05/META-05 |
| CAPI-02 | outbox e deduplicação | CAPI-01 |
| CAPI-03 | dispatcher, retry e reconciliação | CAPI-02 |
| CAPI-04 | recibos e diagnóstico | CAPI-03 |
| CAPI-05 | painel de saúde | CAPI-04 |
| CAPI-06 | anúncio → outcome → recibo | CAPI-05 |

Ficam fora: criação automática de campanhas, alteração autônoma de orçamento e publicação sem aprovação.

## Fase AI — IA supervisionada

| ID | Entrega | Dependência |
|---|---|---|
| AI-01 | porta agnóstica de modelo | CRM-07 |
| AI-02 | prompt/playbook versionado | AI-01 |
| AI-03 | conhecimento por workspace | AI-01 |
| AI-04 | ferramentas delimitadas | CRM-06/AI-02 |
| AI-05 | política de autonomia | AI-02 |
| AI-06 | handoff determinístico | UI-05/AI-05 |
| AI-07 | memória por conversa | AI-03 |
| AI-08 | evals e red team | AI-04..07 |
| AI-09 | shadow mode | AI-08 |
| AI-10 | ativação gradual | AI-09 |

## Fase ONB — Onboarding repetível

| ID | Entrega | Dependência |
|---|---|---|
| ONB-01 | workspace, equipe e papéis | CRM-07 |
| ONB-02 | escolha WABA/WAHA | CH-12 |
| ONB-03 | Embedded Signup WABA | META-01 |
| ONB-04 | onboarding WAHA | CH-09 |
| ONB-05 | diagnóstico automático | ONB-03/04 |
| ONB-06 | configuração do funil | CRM-03 |
| ONB-07 | configuração de IA | AI-10 |
| ONB-08 | configuração Meta/CAPI | CAPI-05 |
| ONB-09 | checklist de go-live | anteriores |
| ONB-10 | reexecução e suporte | ONB-09 |

## Fase OPS — Operação

### OPS-F — Fundação transversal

| ID | Entrega | Dependência | Gate |
|---|---|---|---|
| OPS-F01 | logs, métricas e traces correlacionados | G-06 | correlação sem PII crua |
| OPS-F02 | DLQ e fila de reconciliação | CH-03 | itens inspecionáveis e reprocessáveis |
| OPS-F03 | feature flags por workspace e efeito externo | P-04 | kill switch auditável |
| OPS-F04 | alertas e dashboards técnicos | OPS-F01/02 | alertas P0 reproduzidos em lab |

OPS-F acompanha os pacotes funcionais; não fica adiado para o final.

### OPS-R — Prontidão pré-piloto

| ID | Entrega | Dependência | Gate |
|---|---|---|---|
| OPS-R01 | impersonation temporária e auditada | P-06 | expiração e trilha comprovadas |
| OPS-R02 | retenção, exportação e eliminação LGPD | CRM-07 | política e testes por tenant |
| OPS-R03 | backup e restore | CRM-07 | restauração ensaiada |
| OPS-R04 | runbooks de deploy, rollback e incidente | OPS-F04 | operador diferente do autor executa |
| OPS-R05 | runbooks de outage, reconciliação e rotação | CH-12/CAPI-04 | simulações aprovadas |
| OPS-R06 | gate operacional do piloto | OPS-R01..05 | zero P0/P1 e rollback ensaiado |

## Fase MIG — Haven e migração

| ID | Entrega | Dependência | Gate |
|---|---|---|---|
| MIG-01 | exportador V2 read-only | CRM-07 | exportação repetível sem escrever na V2 |
| MIG-02 | staging e normalização | MIG-01 | divergências classificadas |
| MIG-03 | ingestão idempotente e relatório de divergência | MIG-02 | reexecução sem duplicar |
| MIG-04 | shadow sem efeitos externos | MIG-03/OPS-F03 | comparação observável, writer V2 único |
| MIG-05 | dry-run Haven | MIG-04/OPS-R06 | critérios de go/no-go aprovados |
| MIG-08 | rollback ensaiado | MIG-05 | retorno à V2 dentro do SLO |
| MIG-06 | delta sync e cutover | MIG-05/08 | autorização explícita e rollback pronto |
| MIG-07 | observação 72h | MIG-06 | SLOs e divergências dentro dos limites aprovados |
| MIG-09 | template para próximos clientes | MIG-07/08 | segundo onboarding executável sem desenvolvedor |

## Gates de mercado

### Technical Alpha

- E2E de canal;
- zero cross-tenant;
- zero perda de webhook aceito;
- ambíguos reconciliáveis;
- WABA e WAHA testados separadamente.

### Product Alpha

- operador atende conversa real;
- outcome registrado;
- CAPI elegível recebe recibo;
- IA pode ser desligada;
- degradação é visível.

### Haven Pilot

- shadow 24–72h;
- inbound antes de outbound;
- outbound por allowlist;
- CAPI Test Events antes de produção;
- rollback ≤15 min;
- zero perda, duplicidade observável ou violação tenant.

### Private Beta

- 3–5 workspaces;
- onboarding repetível;
- 30 dias de operação;
- custo por workspace conhecido;
- suporte executado por pessoa diferente do desenvolvedor.

### GA

- onboarding sem desenvolvedor;
- backup/restore e incident response;
- LGPD e entitlements;
- capacidade validada;
- rollout e rollback por workspace.
