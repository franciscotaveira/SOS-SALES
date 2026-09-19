# Product Charter — SOS Sales V3

## Visão

O SOS Sales V3 é o sistema operacional comercial para empresas que anunciam na Meta e vendem ou agendam pelo WhatsApp.

Sua promessa central é fechar o ciclo com prova:

```text
Meta Ads / CTWA / Lead Ads
→ identificação e atribuição
→ WhatsApp WABA ou WAHA
→ atendimento humano ou IA supervisionada
→ qualificação, funil e agenda
→ outcome comercial com identidade e valor
→ CAPI com recibo e diagnóstico
```

Nenhum lead deve desaparecer, nenhuma venda deve ser inventada e nenhuma falha crítica deve parecer “sem dados”.

## Problema

Empresas que vendem pelo WhatsApp perdem valor porque:

- não identificam com segurança qual anúncio originou a conversa;
- deixam leads sem atendimento ou acompanhamento;
- separam conversa, funil, agenda e resultado comercial;
- devolvem sinais incompletos ou incorretos para a Meta;
- dependem de configuração técnica artesanal para cada cliente.

## Público inicial

Empresas de serviços que:

- anunciam na Meta;
- recebem leads pelo WhatsApp;
- vendem ou agendam durante a conversa;
- possuem de 1 a 30 operadores;
- precisam provar campanha → conversa → resultado.

Haven é o primeiro piloto. Suas exceções não podem se tornar regras globais do produto.

## Personas

| Persona | Necessidade | Resultado esperado |
|---|---|---|
| Proprietário | Relacionar leads, receita e mídia | visão de resultados baseada em outcomes reais |
| Gestor comercial | Controlar fila, SLA e funil | nenhum lead esquecido |
| Operador | Atender com contexto e rapidez | cockpit simples e histórico íntegro |
| Gestor de tráfego | Medir origem e retorno | atribuição e CAPI verificáveis |
| Administrador | Conectar canais, equipe e permissões | onboarding repetível |
| Suporte | Diagnosticar sem violar tenants | logs, métricas, auditoria e runbooks |
| Lead | Ser atendido sem perder contexto | continuidade entre IA e humano |

## Jornadas obrigatórias

1. Criar workspace, equipe e papéis.
2. Conectar WABA oficial ou WAHA e provar saúde do canal.
3. Receber webhook, persistir inbox, normalizar e criar contato/conversa uma vez.
4. Exibir o lead no Cockpit com origem conhecida ou honestamente não atribuída.
5. Atender por humano ou IA supervisionada com handoff determinístico.
6. Qualificar, agendar, mover no funil e registrar ganho ou perda.
7. Avaliar elegibilidade CAPI, enviar evento e armazenar recibo.
8. Detectar, expor e reconciliar falhas de canal, fila e provider.
9. Migrar um workspace da V2 com shadow, delta, cutover e rollback.

## Fronteira do MVP

Inclui:

- identidade, workspace, RBAC, RLS e auditoria;
- WABA e WAHA por workspace;
- contatos, conversas, mensagens, funil, outcome e agenda básica;
- Cockpit humano;
- IA supervisionada e handoff;
- CTWA, Lead Ads, atribuição por evidência e CAPI;
- onboarding assistido e depois repetível;
- observabilidade, reconciliação, suporte e migração Haven.

Não inclui no MVP:

- n8n;
- construtor visual genérico;
- CRM horizontal para qualquer processo;
- automação autônoma de campanhas e orçamento;
- Instagram Direct ou Messenger;
- billing sofisticado;
- dados fictícios em produção;
- migração big bang da V2.

## Resultados esperados

Ao final, um cliente elegível deve conseguir, sem intervenção de engenharia:

1. criar e configurar o workspace;
2. conectar WhatsApp e Meta com diagnóstico claro;
3. receber e atender leads reais;
4. usar IA com supervisão e handoff;
5. registrar resultado comercial verificável;
6. enviar conversão elegível à Meta;
7. ver recibo ou causa da falha;
8. operar com segurança e suporte documentado.

## Métricas de produto e operação

O piloto Haven estabelece a baseline antes de qualquer meta comercial definitiva. A equipe deve medir:

- tempo entre criação do workspace e primeiro webhook válido;
- percentual de onboardings concluídos sem intervenção de engenharia;
- tempo até primeira resposta humana ou da IA;
- quantidade e idade de leads sem atendimento;
- percentual de conversas encerradas com outcome explícito;
- cobertura de atribuição e nível da evidência usada;
- percentual de outcomes elegíveis despachados à CAPI com recibo;
- idade da fila de reconciliação e tempo de triagem;
- custo operacional por workspace;
- quantidade de intervenções de suporte por onboarding.

Metas técnicas de segurança e integridade permanecem absolutas: zero violação cross-tenant, zero segredo em log e zero evento aceito perdido. Metas comerciais serão aprovadas após a baseline do piloto, sem inventar números antecipadamente.

## Princípios permanentes

- Truth in Data.
- Tenant-first e fail-closed.
- Segredos nunca entram em contratos de domínio ou logs.
- Conversa não é venda; lead não é receita.
- CAPI só é sucesso com recibo.
- WABA é o provider oficial preferencial; WAHA é alternativa explícita.
- A IA é supervisionada por padrão.
- A V2 permanece intacta até cutover por workspace autorizado.
