# Glossário e Decisões de Produto

## Glossário

| Termo | Definição |
|---|---|
| Workspace | ambiente isolado de uma empresa/unidade |
| Tenant | fronteira lógica de isolamento, normalmente o workspace |
| WABA | WhatsApp Business Platform oficial da Meta |
| WAHA | adapter de sessão WhatsApp por QR, usado como alternativa |
| Thread | conversa comercial normalizada |
| Opportunity/Journey | acompanhamento comercial da conversa |
| Outcome | resultado explícito: ganho, perdido ou outro permitido |
| Próxima ação | tarefa com responsável e prazo |
| Radar | mecanismo de sugestões governadas |
| CAPI | Meta Conversions API |
| Inbox | fila persistente de eventos recebidos |
| Outbox | fila transacional de efeitos externos |
| Reconciliation | resolução de estado externo ambíguo |
| RLS | isolamento de linhas aplicado pelo PostgreSQL |
| Provider | serviço externo de canal, IA, pagamento ou armazenamento |

## Decisões canônicas

### D-01 — Produto vertical

O CHAT-SALES atende empresas que operam vendas, atendimento ou agendamento pelo WhatsApp. Não tenta substituir todos os sistemas empresariais.

### D-02 — Multi-tenant por padrão

Toda capacidade comum é global. Marca, dados, regras, credenciais e limites são configurações do workspace.

### D-03 — Haven é piloto

Haven serve para validar jornadas. Nomes, IDs, catálogos e regras da Haven não entram no núcleo.

### D-04 — Um núcleo, extensões opcionais

CHAT-SALES controla canal, verdade comercial e governança. n8n executa processos adicionais por contratos restritos.

### D-05 — Um WAHA compartilhável

Uma implantação WAHA pode suportar múltiplas sessões isoladas. Não é necessário duplicar o serviço para cada produto; capacidade e falhas devem ser monitoradas.

### D-06 — IA supervisionada

IA pode resumir, classificar e sugerir. Envio, cobrança, mudança de outcome e ações sensíveis exigem política e, inicialmente, decisão humana.

### D-07 — Custo externo transparente

Custos de Meta, IA, VPS, mídia, armazenamento e automações são medidos e atribuíveis. Créditos da Meta não são saldo interno do CHAT-SALES.

### D-08 — Prova antes de declaração

Container saudável, teste unitário e tela carregada não provam uma jornada real. “Funciona em produção” exige prova ponta a ponta no tenant correto.
