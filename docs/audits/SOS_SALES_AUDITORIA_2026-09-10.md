# Auditoria SOS Sales — 10/09/2026

Status: auditoria técnica com ressalvas; homologação autenticada dos cinco pilares pendente.

## Escopo e rastreabilidade

- Revisão de código do checkout f388c5a73064a556fbcb87fe6451bb0eef224085, com alterações locais preexistentes em CAPI, resultados comerciais e Cockpit. Nenhuma dessas alterações foi feita pela auditoria.
- VPS: health observado às 19:35 UTC informou production, v2.0.0-prod e o mesmo commit. Isso é identidade declarada pela API, não comprovação criptográfica do conteúdo servido.
- Containers API/Caddy ativos há 18 horas; WAHA há 7 dias; Redis saudável. Isso não comprova sessão WhatsApp conectada nem processamento ponta a ponta.
- Lab saudável; health informa dev-local, sem identidade suficiente para equiparar seu bundle ao checkout.
- Navegador gstack: login público do Lab e VPS, viewport 375 × 667. Sem sessão autenticada disponível. Não foram disparadas mensagens, alterados registros ou executados testes mutantes no VPS.
- Evidências visuais: /tmp/sos-audit-login-20260910.png e /tmp/sos-audit-prod-login-20260910.png. São capturas de login, não do Cockpit autenticado.

## Achados priorizados

### A01 — P1: “Todas” omite atendimentos além da primeira página

Confirmado em código local e HEAD. `LiveCockpitView.tsx:549` solicita limit=20; armazena somente journeyPage.data e descarta nextCursor. O gateway suporta cursor em `salesOsGateway.ts:1069`. A busca em `LiveCockpitView.tsx:1013` também filtra apenas o conjunto carregado.

Impacto: em um workspace com mais de 20 jornadas, um contato fora da primeira página pode parecer inexistente na fila e na busca. Prioridades também são limitadas a cinco; não tratar essa amostra como total operacional.

Reprodução a executar no Lab: usar 21 jornadas, procurar uma presente apenas na segunda página. Critério de correção: paginação ou busca no servidor, com indicação honesta de carregamento e contagem.

### A02 — P1: inserir horário chama envio direto

Confirmado em código local e HEAD. `ExternalAgendaDrawer.tsx:757` monta a sugestão e chama onInsertSlotToDraft. A ligação em `LiveCockpitView.tsx:1618` chama handleCreateOutboundDraft, que em :862 executa gateway.sendDirectMessage.

O roteiro canônico do pilar 4 exige preencher o composer e permitir revisão antes do envio. A interface mistura “Inserir” e texto de envio, tornando a ação ambígua. Não houve envio real nesta auditoria.

Critério de correção: inserir no rascunho da jornada selecionada, preservar o conteúdo existente e enviar somente pela ação explícita de envio; ou revisar formalmente o requisito e rotular claramente o envio imediato.

### A03 — P2: layout mistura largura do contêiner e largura da janela

Confirmado no código local e HEAD; efeito visual autenticado ainda não reproduzido. O grid usa C<760, C<1120 e C>=1120, mas fila/chat usam hidden md:flex, e Voltar usa md:hidden. Em uma janela >=768 com contêiner <760, o grid tem uma coluna enquanto fila e chat ficam visíveis e o retorno fica escondido.

Há ainda um limite apertado no modo de três colunas: 280+480+340=1100px, mais dois gaps de 10px, consumindo os 1120px por completo.

Critério de correção: visibilidade, seleção inicial e botão de retorno usam o mesmo estado de largura útil. Validar C=759/760/1119/1120 e janela 768/1024, incluindo sidebar aberta e zoom.

### A04 — P2: contador de Ativas diverge dos itens exibidos

Confirmado no código local e HEAD. `LiveCockpitView.tsx:984` inclui status OPEN na lista de Ativas. O contador em :1246 não inclui OPEN, usando somente in_progress, etapas QUALIFIED/PROPOSAL ou priorityReason.

Reprodução determinística pelo predicado: jornada OPEN em etapa inicial e sem priorityReason aparece na lista, mas não soma no badge. Critério: compartilhar um único predicado de atividade e testar o caso OPEN.

### A05 — P2: Enter não respeita envio em andamento

Confirmado no código. O botão Enviar fica desabilitado por actionInProgress, porém o onKeyDown em `LiveCockpitView.tsx:2705` não verifica esse estado. O texto permanece no campo durante o await, permitindo duas chamadas ao pressionar Enter repetidamente. A duplicação efetiva no canal depende do backend e não foi demonstrada.

Critério: trava compartilhada pelo teclado e botão; testar Enter repetido com resposta lenta, erro, troca de contato e digitação de novo texto durante o envio. A preservação do rascunho em retorno false já está implementada, diferentemente do diagnóstico antigo.

### A06 — P3: build conclui com avisos

Build frontend APP_ENV=lab passou em 28,35s. O minificador encontrou declaração CSS inválida [file:line]{file:line}. Bundle principal 1.046,93 kB, gzip 265,49 kB; Vite alerta chunk acima de 500 kB. Isso indica trabalho de higiene e carregamento; não prova lentidão em dispositivo real. Log: /tmp/sos-audit-build.log.

## Verificações executadas

| Verificação | Resultado | Limite |
|---|---|---|
| TypeScript frontend | Passou | Não valida interação |
| TypeScript API | Passou | Não valida serviços externos |
| Frontend Vitest | 22 testes, 8 arquivos passaram | Sem E2E autenticado |
| API unitários | 308 testes, 46 arquivos passaram | Inclui testes locais ainda não commitados |
| Build frontend Lab | Passou com avisos | Não publicado |
| Login Lab mobile | Sem overflow horizontal; inputs com labels associados; console sem erros | Apenas tela pública |
| Login VPS | HTTP 200 e formulário renderizado | Sem login |
| Health Lab e VPS | status ok | Não certifica os cinco pilares |

Não foram executados a suíte de integração com banco, rebuild dos containers, testes de mensagens reais ou verificação externa no Events Manager. O runner instalado da API informou Vitest 1.6.1, enquanto package.json declara ^4.1.11: alinhar instalação/lockfile antes de usar esta execução como evidência de ambiente reproduzível.

## Cobertura dos cinco pilares

| Pilar | Conclusão |
|---|---|
| WhatsApp / Cockpit / Funil | Defeitos de fila e UX confirmados no código; persistência e envio real pendentes |
| Meta Ads / CAPI | Unitários passaram, inclusive alterações locais; aceitação externa de eventos pendente |
| Agente 24/7 / handoff | Unitários de políticas e worker passaram; conversa e transição real pendentes |
| Agenda externa | Divergência inserir/enviar confirmada; disponibilidade real não verificada |
| WAHA / WABA | Container WAHA ativo; autenticação, sessão e entrega interativa não verificadas |

## Ordem de correção e validação

1. Corrigir paginação/busca e ação de agenda; impedir perdas comerciais e envios ambíguos.
2. Unificar regras de largura e predicado de Ativas; bloquear reentrada do envio.
3. Executar casos autenticados no Lab com workspace de teste e dados controlados, incluindo >20 jornadas e falhas de rede.
4. Homologar canais e CAPI com destinatário de teste e evidência externa explicitamente autorizados.
5. Só depois concluir aprovação de release e refinamento visual. Nenhuma mudança no produto ou deploy foi realizada nesta auditoria.
