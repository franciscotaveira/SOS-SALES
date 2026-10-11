# PRD — CHAT-SALES

## 1. Objetivo do produto

Permitir que uma empresa organize e converta conversas do WhatsApp em trabalho comercial verificável, reduzindo perda de leads, tempo de resposta, retrabalho e ausência de acompanhamento.

## 2. Público-alvo

### Segmento inicial

Empresas com 1 a 30 operadores que:

- recebem demanda pelo WhatsApp;
- vendem produtos, serviços ou horários;
- precisam acompanhar leads e retornos;
- desejam automação sem perder controle humano;
- usam Meta Ads ou querem medir conversões.

### Personas

| Persona | Trabalho principal | Dor | Resultado esperado |
|---|---|---|---|
| Proprietário | acompanhar vendas | pouca visibilidade | visão confiável de operação e resultados |
| Gestor | distribuir e cobrar acompanhamento | leads esquecidos | fila, funil e prazos claros |
| Operador | responder e vender | contexto fragmentado | conversa, dados e ações em uma tela |
| Marketing | medir origem | atribuição frágil | outcome e CAPI com evidência |
| Administrador | configurar empresa | dependência técnica | onboarding repetível |
| Integrador | conectar sistemas | APIs improvisadas | contratos estáveis e auditáveis |

## 3. Jobs to be done

1. Quando uma mensagem chegar, quero vê-la na empresa correta e responder com contexto.
2. Quando houver intenção comercial, quero registrar e acompanhar a oportunidade.
3. Quando o lead parar, quero saber quem deve agir e até quando.
4. Quando precisar vender, quero consultar catálogo, gerar proposta ou cobrança sem sair da conversa.
5. Quando uma venda for concluída, quero registrar o resultado e atribuir corretamente.
6. Quando uma automação for necessária, quero conectar n8n ou outro sistema sem abrir acesso irrestrito.
7. Quando a IA sugerir algo, quero entender a evidência e decidir antes de uma ação sensível.

## 4. Requisitos funcionais

### RF-01 — Identidade e tenancy

- autenticar usuários;
- listar workspaces autorizados;
- aplicar RBAC por ação;
- impedir acesso entre tenants;
- registrar eventos administrativos.

### RF-02 — Canais WhatsApp

- cadastrar WABA ou WAHA por workspace;
- testar, conectar, revogar e exibir saúde;
- receber mensagens com deduplicação;
- enviar mensagens por outbox;
- registrar status de entrega.

### RF-03 — Cockpit

- listar conversas abertas, em atenção, todas e fechadas;
- buscar por nome ou telefone;
- exibir timeline e mídia;
- manter rascunho por conversa;
- abrir claramente o contexto do lead;
- atualizar conversa e lista com feedback visível.

### RF-04 — Contatos

- criar, consultar e editar contato;
- armazenar nome, telefone, empresa, e-mail, tags e observações;
- desativar automações via opt-out sem apagar histórico;
- acessar a ficha a partir da lista e da conversa.

### RF-05 — Funil e oportunidades

- criar oportunidade;
- abrir card detalhado;
- editar valor, estágio e observações;
- mover entre estágios com concorrência controlada;
- registrar ganho ou perda explicitamente.

### RF-06 — Próxima ação

- criar atividade manual ou originada do Radar;
- definir responsável, descrição e prazo;
- concluir, cancelar ou adiar;
- filtrar conversas que precisam de atenção.

### RF-07 — Radar

- encontrar conversas elegíveis;
- gerar sugestão com motivo e evidência;
- aceitar, dispensar, invalidar ou expirar;
- ao aceitar, preparar rascunho/próxima ação;
- nunca enviar mensagem apenas pelo aceite.

### RF-08 — Catálogo, propostas e cobrança

- CRUD completo de produtos e serviços;
- imagem, SKU, categoria, preço e status;
- criar proposta vinculada ao contato/conversa;
- gerar Pix com valor real;
- registrar liquidação separadamente do evento de marketing.

### RF-09 — Templates WABA e IA assistida

- orientar categoria, variáveis e regras da Meta;
- gerar um rascunho por IA;
- permitir edição e pré-visualização;
- submeter e acompanhar status no provider;
- nunca prometer aprovação pela Meta.

### RF-10 — Integrações

- emitir credencial restrita por workspace;
- oferecer API versionada;
- cadastrar destinos de webhook com assinatura;
- limitar escopos, taxa e origem;
- registrar entrega, retry e DLQ;
- disponibilizar modelos n8n sem entregar controle do canal.

## 5. Requisitos não funcionais

| Área | Requisito |
|---|---|
| Isolamento | zero acesso cross-tenant |
| Integridade | zero evento aceito perdido |
| Idempotência | ingress, outbound, suggestions e webhooks repetíveis |
| Segurança | segredos criptografados e fora de logs |
| Disponibilidade | alvo beta de 99,9% para API própria |
| Latência | mensagem no Cockpit p95 inferior a 5 s, salvo provider |
| Auditoria | ações administrativas e sensíveis rastreáveis |
| Acessibilidade | navegação por teclado, labels e contraste compatível WCAG AA |
| Portabilidade | providers WhatsApp e IA atrás de adapters |
| Recuperação | backup, restore e rollback ensaiados |

## 6. Métricas

- tempo até primeiro canal saudável;
- tempo até primeira mensagem real;
- tempo de primeira resposta;
- leads sem resposta por faixa de idade;
- oportunidades sem próxima ação;
- taxa de outcomes explícitos;
- taxa de sugestões aceitas/dispensadas;
- percentual de CAPI com recibo;
- falhas e idade de filas;
- intervenções técnicas por onboarding;
- custo de infraestrutura e IA por workspace.

## 7. Fora do escopo imediato

- automação irrestrita de campanhas e orçamento;
- ERP e contabilidade completa;
- discador/telefonia;
- construtor genérico concorrente do n8n;
- IA autônoma com permissão ampla;
- atribuição inventada quando a origem é desconhecida.

## 8. Critério de sucesso comercial

Um novo cliente deve conseguir conectar um canal, receber uma conversa real, criar uma oportunidade, registrar próxima ação, concluir um outcome e consultar o resultado sem alteração de código específica para sua empresa.
