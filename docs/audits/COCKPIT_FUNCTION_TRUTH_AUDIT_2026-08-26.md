# Auditoria P0 — Verdade funcional do Cockpit

Data: 2026-08-26  
Escopo: `src/components/cockpit/**`, com rastreio dos gateways/rotas usados pelo Cockpit.  
Modo: read-only; nenhum dado de produção, VPS ou configuração externa foi alterado.

## Status executivo

**NOT_READY para declarar que todas as funções visíveis do Cockpit são reais e persistentes.** O núcleo de atendimento possui contratos backend claros, porém há superfícies que apresentam estado local, dados compilados ou atualização otimista como se fossem persistência operacional.

## Matriz de capacidades

| Capacidade visível | Evidência | Classificação | Risco |
|---|---|---|---|
| Listar prioridades/jornadas e carregar cockpit | `LiveCockpitView.tsx:588-640`; gateway `listPriorities`, `listJourneys`, `getCockpit` | Backend real/persistente | Baixo, sujeito a disponibilidade/auth |
| Assumir, resolver e devolver handoff à IA | `LiveCockpitView.tsx:713-750`; gateway de handoff | Backend real/persistente | Médio; requer reteste autenticado |
| Alterar estágio, follow-up, resultado comercial e fato conhecido | `LiveCockpitView.tsx:754-821`; gateways correspondentes | Backend real/persistente | Médio |
| Enviar mensagem direta | `LiveCockpitView.tsx:860-890`; `gateway.sendDirectMessage` | Backend real, mas com UI otimista | **Alto**: bolha temporária aparece antes da confirmação; refresh no erro reduz, mas não substitui idempotência/estado confirmado |
| Botões/lista/Flow/template WABA | `LiveCockpitView.tsx:478-575` | Backend real via `authenticatedFetch` | Alto: ação externa; precisa evidência de provider e reconciliação |
| Limpar histórico/jornada | `LiveCockpitView.tsx:897-940` | Backend real via POST | **Crítico**: ação destrutiva, embora protegida por confirmação |
| Copilot | `LiveCockpitView.tsx:1951-1981` | Backend real com fallback local | **Alto**: em erro/ausência de resposta, `analyzeConversationDossier` gera sugestão local; deve ser rotulada como inferência e nunca como fato |
| Vault de mídia: listar/enviar | `SalesMediaVaultModal.tsx:38-44,90-97` | Parcial: catálogo compilado/localStorage; envio delegado ao pai | Alto: não há CRUD/asset storage backend comprovado |
| Vault de mídia: adicionar recurso | `SalesMediaVaultModal.tsx:99-121` | **Somente frontend/mock** | **Crítico**: cria URL fixa de Mixkit/Unsplash, tamanho/duração inventados e salva só em `localStorage` |
| Agenda externa: slots | `ExternalAgendaDrawer.tsx:53-153` e `computeSmartDetectedSlots` | **Mock/fixture local** | **Crítico**: horários, equipe e preços são constantes; não consulta agenda externa nem reserva |
| Agenda externa: sincronizar | `ExternalAgendaDrawer.tsx:712-728` | **Somente frontend** | **Crítico**: `setTimeout` de 1s apenas grava `lastSyncedAt` em localStorage e afirma que grade foi reanalisada |
| Agenda externa: salvar conexão | `ExternalAgendaDrawer.tsx:737-753` | Somente frontend | Alto: grava provider/URL localmente e anuncia “Conectado” sem handshake OAuth/API |
| Inserir horário no rascunho | `ExternalAgendaDrawer.tsx:755-760` | Frontend com dados mock | **Crítico**: pode inserir preço/horário sem disponibilidade real; não agenda |
| Classificar cliente recorrente/novo | `LiveCockpitView.tsx:830-858` | Somente frontend/localStorage | Médio: não é persistido no backend nem compartilhado entre operadores |
| Notas operacionais do dossiê | `LiveCockpitView.tsx:2500-2516` | **Somente frontend** | Alto: nota inicial e novas notas desaparecem ao desmontar/trocar jornada |
| Meta de receita diária | `LiveCockpitView.tsx:946-1000` | Somente frontend/localStorage | Médio: não é fonte financeira auditável |
| Macros, endereço e objeções | `LiveCockpitView.tsx:1610-1622,1766-1862` | Frontend; parte usa bundle local | Médio: texto pronto não equivale a execução backend |
| Gravação de áudio | `LiveCockpitView.tsx:1882-1907` | Parcial/somente frontend | Alto: gravação é representada como texto `[Áudio]`; não há upload comprovado nesse componente |
| Upload de mídia no composer | `LiveCockpitView.tsx:1920-1930,2196` | Parcial | Alto: depende do callback pai; contrato de persistência/provider deve ser verificado |

## Falsos sucessos e pontos de atenção

1. **Agenda** é o maior falso sucesso: a UI usa linguagem de conexão, sincronização, “horário disponível” e confirmação, mas a fonte é uma lista estática e filtros locais.
2. **Vault** permite “Novo Recurso” com asset externo genérico e persiste apenas no navegador. Outro operador/dispositivo não verá o recurso.
3. **Notas, lealdade e meta diária** parecem dados do CRM, mas são estado de sessão/localStorage.
4. **Copilot** tem caminho backend, porém cai silenciosamente para inferência local quando o endpoint falha. O fallback precisa permanecer explicitamente marcado como sugestão não verificada.
5. O envio de mensagem mostra uma bolha otimista antes da confirmação (`temp-*`). Isso é aceitável apenas com reconciliação determinística; o usuário não deve interpretar a bolha temporária como entrega ao WhatsApp.

## Recomendações bloqueantes

- Ocultar ou marcar Agenda externa, Vault CRUD, notas, lealdade e meta diária como “local / não sincronizado” até existir contrato backend e teste de persistência.
- Remover preços e slots hardcoded da Agenda ou trocar a ação por link oficial de agendamento, sem afirmar disponibilidade.
- Para mídia, criar endpoint autenticado de catálogo/upload e persistência por workspace; nunca usar URLs genéricas como asset criado.
- Para notas/lealdade/meta, definir tabelas/rotas e atualizar a UI somente após resposta confirmada.
- Manter fallback do Copilot, mas exibir estado “sugestão local — não verificada” e impedir que seja tratado como fato/preço.
- Instrumentar envio outbound com `dispatchId`/idempotência e estado `pending → confirmed/failed`, em vez de apenas uma mensagem temporária.

## O que passou neste recorte

Os handlers de leitura do cockpit, handoff, estágio, follow-up, resultado comercial, fatos conhecidos e envio direto estão conectados a gateways/rotas reais no código. Isso não substitui um E2E autenticado no Lab, mas diferencia o núcleo implementado das funções locais acima.

## Reteste para fechar P0

Para cada capacidade classificada como real: executar no Docker Lab autenticado, capturar request/response, estado persistido e estado após reload. Para cada capacidade local/mock: não declarar pronta; fechar somente após contrato backend, erro explícito e teste de reconciliação.
