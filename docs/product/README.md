# CHAT-SALES — Documentação Canônica do Produto

**Versão documental:** 1.0
**Data-base:** 2026-10-05
**Escopo:** produto multi-tenant para empresas que vendem, atendem ou agendam pelo WhatsApp.
**Regra:** Haven, Sora, Chapecó e qualquer outro workspace são clientes do produto; nenhum deles define a arquitetura global.

## Estado dos requisitos

| Marcador | Significado |
|---|---|
| `[IMPLEMENTADO]` | existe no código e passou pelo gate técnico indicado; não implica publicação |
| `[PUBLICADO]` | está presente no runtime da VPS verificado na data da evidência |
| `[VALIDADO-E2E]` | percorreu a jornada real no tenant e ambiente corretos |
| `[PARCIAL]` | parte existe, mas o contrato completo ainda não passou pelos gates necessários |
| `[PLANEJADO]` | decisão de produto documentada, ainda não entregue |
| `[EXTERNO]` | depende de Meta, provider, banco, cliente ou aprovação externa |

Os marcadores são cumulativos. Uma capacidade pode estar `[IMPLEMENTADO]` sem estar `[PUBLICADO]`, e publicada sem estar `[VALIDADO-E2E]`.

## Documentos

1. [Blueprint do Produto](./01-BLUEPRINT.md)
2. [PRD — Product Requirements Document](./02-PRD.md)
3. [Arquitetura e Modelo de Dados](./03-ARQUITETURA.md)
4. [Especificação Funcional e UX](./04-ESPECIFICACAO-FUNCIONAL.md)
5. [Multi-tenancy, Onboarding e Planos](./05-MULTITENANCY-ONBOARDING.md)
6. [Integrações, API, Webhooks e n8n](./06-INTEGRACOES.md)
7. [IA, Radar e Governança](./07-IA-E-GOVERNANCA.md)
8. [Segurança, SLO e Operação](./08-SEGURANCA-E-OPERACAO.md)
9. [Roadmap e Critérios de Mercado](./09-ROADMAP.md)
10. [Glossário e Decisões](./10-GLOSSARIO-E-DECISOES.md)
11. [Matriz de Requisitos e Aceite](./11-MATRIZ-DE-ACEITE.md)
12. [Modelo Operacional e Comercial](./12-MODELO-OPERACIONAL-COMERCIAL.md)
13. [Estado Publicado e Evidências](./13-ESTADO-PUBLICADO.md)

## Ordem de autoridade

Quando houver divergência:

1. código, migrations e comportamento publicado;
2. estes documentos em `docs/product`;
3. ADRs e documentação técnica vigente;
4. documentos históricos de execução, auditoria e evidência.

Documentos históricos continuam válidos como prova, mas não definem sozinhos o produto atual.
