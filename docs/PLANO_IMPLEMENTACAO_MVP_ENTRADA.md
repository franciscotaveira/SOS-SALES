# Plano de Implementação — SOS Sales MVP de Entrada

## 1. Objetivo do produto

Entregar um SaaS simples, confiável e acessível para pequenas empresas iniciarem o atendimento comercial por WhatsApp sem implantação complexa.

Faixa comercial inicial: R$ 47 a R$ 97 por mês.

Promessa operacional do MVP:

> Receber conversas, distribuir o atendimento entre pessoas, responder com segurança, acompanhar o lead no funil e devolver eventos qualificados à Meta.

O MVP não perde recursos existentes. Recursos avançados ficam em uma segunda camada, condicionados a contrato de backend, permissão, configuração e capacidade real do canal.

## 2. Escopo fechado do MVP

### Primeira camada — sempre visível

1. Agora: fila prioritária e atendimento da conversa.
2. Conversas: histórico e busca de contatos.
3. Funil: movimentação comercial simples.
4. Configuração inicial: empresa, usuários e conexão WhatsApp.
5. Empresas: criação, seleção e remoção segura de subcontas.

### Ações essenciais dentro de Agora

1. Assumir atendimento.
2. Responder texto, mídia ou áudio quando o canal suportar.
3. Agendar follow-up.
4. Mover etapa do funil.
5. Registrar conclusão/desfecho.
6. Devolver atendimento à IA ou encerrar handoff.

### Segunda camada — contextual

- IA de sugestão de resposta.
- Dossiê e fatos conhecidos.
- Templates, botões, listas, mídia e Flows WABA.
- Agenda externa.
- Campanhas, tracking e CAPI.
- Grupos, broadcast e ferramentas administrativas.

Esses recursos não são removidos. Eles aparecem apenas quando o usuário tem permissão e o backend confirma que o recurso está disponível e configurado.

## 3. Regra de verdade funcional

Nenhuma função será considerada pronta somente porque existe um botão ou porque uma rota retorna HTTP 200.

Cada ação precisa provar a cadeia completa:

`UI → API autenticada → RBAC/tenant → regra de negócio → provedor/fila → persistência → leitura após reload`

Classificação obrigatória por função:

| Estado | Regra de interface |
|---|---|
| Operacional | Exibir e habilitar |
| Configuração pendente | Exibir orientação clara para configurar |
| Indisponível no canal | Ocultar da ação principal e explicar no contexto |
| Backend ausente | Não fingir execução; registrar como débito técnico |
| Redundante | Reutilizar o fluxo canônico e remover apenas o acesso duplicado |
| Perigoso/destrutivo | Colocar em camada secundária, exigir confirmação e auditar |

## 4. Arquitetura de canal

### Fonte canônica por workspace

Cada workspace deve ter exatamente uma configuração ativa de entrada e saída por número:

- `META_WABA`: canal oficial preferencial para clientes conectados pela Cloud API.
- `WAHA`: fallback ou canal legado controlado, nunca concorrendo pelo mesmo número.
- `NONE/DEGRADED`: nenhuma conexão operacional; produto entra em modo de configuração.

Regras:

1. Um número não pode ser atendido simultaneamente por WABA e WAHA.
2. Webhooks são associados por `phone_number_id`, sessão e workspace.
3. Eventos possuem idempotência persistida.
4. Mensagens exibem origem, estado de envio, entrega, leitura e erro reais.
5. O frontend consulta capacidades do canal antes de mostrar ações especiais.
6. Token inválido, crédito insuficiente ou webhook parado produzem estado degradado visível.

## 5. Arquitetura de IA

### Roteamento

1. Se o número for elegível e estiver configurado no Meta Business Agent, a Meta pode ser a respondente automática.
2. Quando houver handoff, o SOS Sales assume o controle da conversa.
3. Se o número não for elegível, o agente próprio do SOS Sales pode atuar.
4. Se nenhuma IA estiver disponível, a conversa continua com atendimento humano.

### Guardrails obrigatórios

- Nunca inventar preço, estoque, agenda, pagamento ou política.
- Responder somente com conhecimento persistido e versionado do workspace.
- Sugestão de IA entra no composer para revisão; nunca envia automaticamente por tecla Tab.
- Handoff humano é persistido e auditável.
- Toda ação externa da IA usa ferramenta com contrato explícito, timeout, retry e registro.
- Falha de IA nunca bloqueia leitura ou resposta humana.

## 6. Fases de implementação

### Fase 0 — Congelamento e inventário

Objetivo: impedir novas divergências enquanto o MVP é fechado.

Entregáveis:

- Definir o branch/release canônico.
- Registrar a revisão que está no VPS e a revisão em desenvolvimento.
- Inventariar telas, botões, modais, endpoints e tabelas.
- Criar matriz `função → componente → endpoint → permissão → provedor → persistência → teste`.
- Marcar cada item como operacional, parcial, quebrado, redundante ou fora do MVP.

Aceite:

- Nenhuma função visível sem classificação.
- Nenhum deploy originado de checkout diferente do branch canônico.

### Fase 1 — Agora essencial

Objetivo: transformar a tela principal no posto de trabalho do atendente.

Mudanças:

- Primeira camada: Assumir, Follow-up, Etapa, Concluir e Responder.
- Menu Mais: dossiê, devolver à IA, encerrar handoff e limpar histórico.
- Copiloto fechado por padrão e aberto sob demanda.
- Remover o acesso duplicado de Objeções; manter macros dentro de Atalhos.
- Mostrar estado de sincronização e falha do canal sem poluir a conversa.
- Manter mídia e áudio apenas se a capability do canal permitir.

Contratos a validar:

- `acceptHandoff`, `resolveHandoff`, `returnHandoffToAi`.
- `createFollowUp`, `updateStage`, `createOutcome`.
- `sendMessage`, upload/mídia e status da mensagem.
- Leitura de cockpit, mensagens e atualização após reload.

Aceite:

- Um operador conclui o fluxo principal sem abrir configurações.
- Nenhuma ação primária é mock ou somente local.
- Atualização nova aparece sem recarregamento manual ou, no fallback, por polling explícito e saudável.

### Fase 2 — WhatsApp e sincronização

Objetivo: garantir que toda a operação nasce de uma conexão real.

Mudanças:

- Unificar cadastro e status do canal por workspace.
- Bloquear duplicidade do mesmo número entre WABA e WAHA.
- Validar webhook de entrada, mensagens enviadas, status e mídia.
- Implementar health operacional por canal: conectado, degradado, desconectado e configuração pendente.
- Reconciliar mensagens após indisponibilidade sem duplicar eventos.
- Separar falha de autenticação, crédito, janela de 24 horas e provedor.

Aceite:

- Mensagem real recebida aparece no workspace correto.
- Resposta real chega ao número controlado e persiste após reload.
- Evento repetido não cria mensagem duplicada.
- Reinício da API não perde o vínculo do canal.

### Fase 3 — Conversas, Funil e multiatendimento

Objetivo: fechar o ciclo comercial básico.

Mudanças:

- Busca por nome e telefone usando API real.
- Conversa tem responsável, fila, handoff e histórico únicos.
- Dois operadores não assumem silenciosamente a mesma conversa.
- Mudança de etapa persiste e aparece no Agora, Conversas e Funil.
- Follow-up possui responsável, data, estado e conclusão.
- Desfecho registra ganho, perda ou continuação sem valor inventado.

Aceite:

- Alterações permanecem após logout/login e reload.
- Usuário de outro workspace não lê nem altera o registro.
- Conflito de atendimento recebe resposta determinística da API.

### Fase 4 — Empresas, usuários e onboarding

Objetivo: uma PME conseguir começar sem suporte técnico.

Fluxo de três passos:

1. Criar empresa e administrador.
2. Conectar WhatsApp e validar recebimento.
3. Convidar atendente ou iniciar com o proprietário.

Mudanças:

- Criar e remover subconta por contrato backend.
- Remoção exige confirmação, bloqueia workspace em uso e mantém trilha de auditoria.
- Checklist consulta estado real: canal, webhook, primeiro contato e usuário.
- Empty states oferecem a próxima ação possível, sem dados de demonstração.
- Pix, catálogo, IA e tracking entram como configuração posterior opcional.

Aceite:

- Novo cliente chega à primeira conversa real sem edição manual de banco ou `.env`.
- Workspace incompleto nunca aparece como operacional.

### Fase 5 — Meta Ads e devolução de conversão

Objetivo: conectar atendimento ao aprendizado das campanhas.

MVP:

- Capturar CTWA/referral quando fornecido pela Meta.
- Associar campanha, anúncio e contato sem fabricar atribuição.
- Registrar eventos qualificados: lead, qualified lead e purchase/agendamento confirmado.
- Enviar CAPI com idempotência, consentimento/base legal aplicável e log de resposta.
- Mostrar status do evento: pendente, enviado, aceito, rejeitado.

Aceite:

- Um lead controlado conserva a origem desde webhook até desfecho.
- O evento de teste aparece aceito pela Meta com identificador persistido.
- Reenvio não duplica conversão.

### Fase 6 — Recursos avançados preservados

Objetivo: manter diferenciais sem aumentar a carga cognitiva do plano de entrada.

Regras:

- Templates, botões, listas, Flows, grupos e broadcast ficam atrás de capability e plano.
- Rotas hoje declaradas como `unsupportedWabaAction` não podem aparecer como operacionais.
- Agenda só sugere horários vindos do provedor persistido.
- IA autônoma requer configuração, canário e kill switch por workspace.
- Analytics exibe somente métricas com proveniência rastreável.

Aceite:

- Nenhum recurso avançado interfere no atendimento básico quando indisponível.
- Upgrade de plano libera interface já conectada ao mesmo contrato canônico.

### Fase 7 — Auditoria e liberação

Gates locais/controlados:

1. Lint/typecheck relevante e build web/API.
2. Testes unitários e integração afetados.
3. Teste autenticado por perfil: owner, admin e operator.
4. Isolamento multi-tenant.
5. E2E do fluxo essencial com números controlados.
6. Teste de reload e reconciliação.
7. Teste de falha: token inválido, provedor indisponível e janela fechada.
8. Preflight de produção e artefatos vinculados ao Git SHA.

Promoção:

- Stage imutável no VPS.
- Aprovação humana.
- Promoção atômica de frontend e API.
- Verificação de `/health`, `/ready`, `/version` e logs.
- Canário em um workspace controlado.
- Rollback se qualquer gate crítico falhar.

## 7. Ordem de execução recomendada

| Prioridade | Bloco | Motivo |
|---|---|---|
| P0 | Agora + sincronização WhatsApp | É o valor diário percebido e o maior risco atual |
| P0 | Matriz de verdade funcional | Impede novos botões sem backend |
| P1 | Conversas + Funil + multiatendimento | Fecha a operação comercial básica |
| P1 | Onboarding + empresas | Torna o produto vendável sem implantação artesanal |
| P2 | CTWA + CAPI | Prova valor para aquisição e retenção |
| P2 | IA com fallback | Diferencial sem virar dependência crítica |
| P3 | Recursos Meta avançados | Upsell depois do núcleo estável |

## 8. Definition of Done do MVP

O SOS Sales estará pronto para comercialização controlada quando:

- Um novo workspace puder ser criado e removido pela interface com autorização correta.
- Um número puder ser conectado sem duplicidade de provedor.
- Mensagens reais entrarem, sincronizarem e persistirem no workspace correto.
- Um operador puder assumir, responder, seguir, mover e concluir um lead.
- Um segundo operador enxergar o estado correto do atendimento.
- A IA puder falhar sem interromper o trabalho humano.
- Atribuição Meta, quando existente, sobreviver até o desfecho.
- Nenhuma tela de produção usar mock, preço inventado ou sucesso falso.
- O release possuir Git SHA, preflight, canário e rollback comprovados.

## 9. Fora do primeiro lançamento

- Automação autônoma sem supervisão.
- Broadcast amplo sem governança de opt-in, template e custo.
- Agenda nativa completa sem integração real.
- Métricas de ROI calculadas com estimativas não auditáveis.
- Suporte simultâneo irrestrito a todos os canais Meta.
- Customização visual profunda por cliente.

Esses itens permanecem no produto como evolução, não como promessa do plano de entrada.

## 10. Métricas de sucesso

- Tempo até primeira conversa real: até 10 minutos.
- Taxa de mensagens sincronizadas sem intervenção: acima de 99% no canário.
- Duplicidade de mensagem: zero no conjunto controlado.
- Ação essencial concluída sem erro: acima de 98%.
- Tempo para operador assumir conversa: até 2 cliques.
- Funções primárias sem contrato backend: zero.
- Incidentes que exigem edição manual de banco: zero no onboarding.

