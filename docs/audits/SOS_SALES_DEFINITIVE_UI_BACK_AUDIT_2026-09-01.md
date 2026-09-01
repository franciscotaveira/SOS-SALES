# Auditoria definitiva UI ↔ Backend — SOS Sales MVP

Data: 2026-09-01  
Base auditada: `d97014d0479c7f1da62eed1137b1acf824be9050`  
Objetivo: reduzir o SOS Sales ao fluxo essencial de um SaaS de entrada sem apagar capacidades futuras e sem expor ações que não tenham contrato real no backend.

## 1. Regra de produto adotada

O produto autenticado de produção deve apresentar somente cinco caminhos:

1. Agora — atender e decidir.
2. Conversas — localizar e retomar contatos.
3. Funil — acompanhar estágio comercial.
4. Resultados — comprovar origem e configurar Meta Ads/CAPI.
5. Configurações — WhatsApp, IA, tempo de resposta e equipe.

Empresas e subcontas permanecem disponíveis apenas para owner, dentro de Administração. Recursos avançados continuam no código para futuros planos, mas não competem com o fluxo do MVP.

## 2. Classificação definitiva por tela

| Tela | Mantido no MVP | Realocado ou consolidado | Ocultado do MVP, preservado no código | Contrato backend | Estado da evidência |
|---|---|---|---|---|---|
| Agora | fila, busca, filtros, assumir/devolver atendimento, mensagens, follow-up, etapa, concluir, IA assistida e ações WABA compatíveis | filtros de perfil e canal viraram seletores compactos; WABA aparece apenas no canal Meta; modo Foco usa as mesmas regras | agenda sem provedor, cofre local de mídia e Atlas flutuante | cockpit, handoff, journey stage, outcome, dispatch, operational settings e AI Copilot | PASS em mapeamento e testes; canário autenticado pós-release pendente |
| Conversas | lista, busca, filtros persistidos e abertura da conversa | categorias derivadas apenas do serviço persistido | filtros customizados locais e inferência por palavras do nome/mensagem | journeys e mensagens autenticadas | PASS em mapeamento; reload integrado pendente |
| Funil | quatro etapas operacionais e movimentação persistida | conclusão comercial centralizada na ação Concluir | coluna Ganho redundante, funil customizado local e KPIs financeiros inventados | journey stage e commercial outcome | PASS em mapeamento e teste de segurança; persistência integrada pendente |
| Resultados | prova de tráfego/CTWA para admin e conexão Meta Ads/CAPI para owner | modelos aprovados WABA foram movidos para Configurações > WhatsApp | analytics antigo, broadcast, links/QR e painel denso de tracking | traffic proof e tracking owner-only | PASS em contrato; chamada real à Meta não executada nesta auditoria |
| Configurações | WhatsApp, IA, SLA e equipe | modelos WABA ficam dentro do canal conectado; IA essencial publica modo, tom, objetivo e guardrails | editor avançado do playbook permanece oculto do plano de entrada | channel config/status, agent config owner-only, operational settings e membership | PASS em mapeamento; validação autenticada pós-release pendente |
| Empresas | criar e desativar/remover acesso a empresas e subcontas | concentrado em Administração | nenhuma exclusão física nova | diretório e gestão owner-only | contrato existente; mutação real não executada nesta auditoria |

## 3. Correções de verdade funcional

### Frontend

- Produção ignora overrides de feature flag gravados no navegador.
- Navegação e pesquisa global usam as mesmas telas reais.
- O Cockpit não classifica intenção, serviço, origem de anúncio ou canal por palavras digitadas pelo cliente.
- Badges são mostrados somente quando existe classificação persistida.
- Ações WABA aparecem apenas em uma conversa WABA/Meta.
- Foram removidos da superfície autenticada os atalhos sem contrato operacional: agenda externa local e cofre local de mídia.
- O funil deixou de calcular receita, ticket e conversão a partir de valores inexistentes.
- Resultados passou a ter somente prova de anúncios e conexão Meta.
- Tracking não guarda token no navegador e não devolve segredo ao frontend.

### Backend

- GET/POST de tracking são owner-only e têm validação de corpo.
- Tracking passou a pertencer a um canal real WABA/WAHA.
- Não é mais criada uma conexão Meta falsa chamada `Meta CAPI Tracking` com status conectado.
- Sem canal real, a API responde `409 WHATSAPP_CHANNEL_REQUIRED`.
- A migration `20260901103000_tracking_channel_ownership_cleanup.sql` migra dados do registro fantasma para o canal real e reclassifica o legado como `other` desconectado. O registro deixa de aparecer como WhatsApp, mas permanece como âncora de auditoria para não quebrar jornadas, mensagens ou despachos históricos.
- A cópia do runtime usada no deploy voltou a incluir `PostgresWorkspaceMembershipGateway`, mantendo autorização de equipe alinhada ao runtime da API.

## 4. Evidência executada

| Verificação | Resultado |
|---|---|
| TypeScript frontend | PASS |
| TypeScript API | PASS |
| Testes frontend | 15/15 PASS |
| Testes unitários API | 204/204 PASS |
| Auditoria de contratos | 72/72 chamadas mapeadas; 0 rota ausente |
| Build frontend produção | PASS |
| Build API produção | PASS |
| Vulnerabilidades de dependências de produção | 0 frontend; 0 API |
| VPS `/health` antes do release | PASS em `d97014d...` |
| VPS `/ready` antes do release | database, redis, inbound, outbound e receptionist `ok` |

O aviso de bundle grande do frontend e o seletor CSS inválido preexistente não bloquearam o build, mas permanecem como dívida de desempenho/limpeza. A API possui uma vulnerabilidade baixa somente em ferramenta de desenvolvimento (`esbuild`), não presente nas dependências de produção.

## 5. Limites da afirmação

Mapear uma chamada para uma rota não prova que o provedor entregou a mensagem nem que o dado reapareceu após reload. Nesta execução não foram realizados:

- migration no banco de produção;
- envio real WABA/WAHA;
- alteração real de funil, handoff, empresa ou configuração;
- chamada real CAPI/Meta;
- navegação autenticada pós-release.

Essas verificações são deliberadamente posteriores à promoção e devem usar atores controlados. Nenhum resultado desta seção pode ser chamado de PASS antes do canário.

## 6. Gate de liberação

O pacote está **aprovado para homologação**, não aprovado ainda para promoção cega em produção.

Para liberar:

1. revisar o diff e congelar o commit;
2. executar preflight e aplicar a migration em ambiente isolado;
3. promover frontend, API, runtime e migration como uma única release;
4. validar login owner e operator;
5. validar Agora: receber, atualizar sem refresh manual, responder e confirmar persistência após reload;
6. validar Funil: mover etapa, recarregar e confirmar banco;
7. validar WABA Haven e WAHA SOS Sales com dois atores controlados;
8. validar criação/desativação de empresa como owner;
9. validar tracking sem criar canal duplicado;
10. reler `/health`, `/ready`, logs e versão; executar rollback se qualquer P0 falhar.

## 7. Critério final de MVP

O MVP só recebe estado `READY` quando todos os testes do gate 4–10 tiverem evidência. Até lá, o estado correto é `BUILDABLE / RELEASE CANDIDATE`, com produção atual preservada em `d97014d...`.
