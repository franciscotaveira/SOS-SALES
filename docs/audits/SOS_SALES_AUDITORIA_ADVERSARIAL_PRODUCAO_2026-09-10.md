# Auditoria adversarial de produção — SOS Vendas

**Data:** 10 set 2026  
**Escopo:** TX Commercial Core, commit `e1c8474f00790b4773871e5ff287716d9e46201f`  
**Método:** skills `qa-only` e `health`, revisão adversarial manual, Docker Lab, build, testes, inspeção read-only de containers, API, banco e frontend publicados.  
**Parecer:** **PRODUÇÃO PUBLICADA E ONLINE, MAS NÃO HOMOLOGADA PONTA A PONTA.**

O artefato publicado corresponde ao commit auditado, o frontend público funciona em mobile e desktop e as dependências declaradas pelo `/ready` estão saudáveis. A homologação integral está bloqueada porque o worker CAPI está desligado em produção, uma suíte obrigatória falha e existem brechas de concorrência capazes de enviar mensagens depois do encerramento de uma jornada ou duplicar ações do operador.

## Atualização de remediação — 10 set 2026 — validação da remediação

**Situação atual:** **Correções para AUD-001 a AUD-010 implementadas, com testes automatizados e verificações de runtime no Docker Lab. Homologação autenticada e externa pendente. Nenhuma promoção realizada.**

| Achado | Estado da correção | Evidência atual |
|---|---|---|
| AUD-001 | Implementado; E2E pendente | CAPI habilitada por padrão nos composes; `/ready` do Lab retorna `capi-worker: ok`; erros do loop deixam o worker não saudável e são registrados. A prova externa no Meta Test Events continua pendente porque não foi enviado evento real. |
| AUD-002 | Implementado; E2E pendente | RPC de reserva usa `FOR UPDATE`, valida jornada `OPEN` e bot ativo; trigger impede fechar, pausar ou transferir ao humano durante reserva `SENDING`. |
| AUD-003 | Implementado; E2E pendente | Segunda mensagem usa reserva e fingerprint próprios com `message_kind='TEXT_SECONDARY'`. |
| AUD-004 | Implementado; E2E pendente | Resume exige jornada `OPEN`; retorno de handoff e retomada da jornada fazem rollback juntos; frontend não ignora mais erros. |
| AUD-005 | Implementado; E2E pendente | Fila usa `nextCursor`, mescla páginas por ID e oferece “Carregar mais conversas”. |
| AUD-006 | Implementado; E2E pendente | Enter e botão compartilham uma trava síncrona por `ref`; somente uma criação fica em voo. |
| AUD-007 | Implementado; E2E pendente | Modal mantém uma chave idempotente por abertura e bloqueia clique concorrente antes do rerender. |
| AUD-008 | Implementado; E2E pendente | `datetime-local` recebe componentes locais; UTC é produzido somente no submit. |
| AUD-009 | Corrigido | Contrato público 422 restaurado; suíte API integral passou. |
| AUD-010 | Implementado; E2E pendente | O argumento foi renomeado para `retryDelaySeconds`; falha fatal usa `dead_letter_outbox_event` cercada por claim token e worker ID. |

Validação da remediação:

- Frontend: typecheck aprovado; **24/24 testes**; build de produção aprovado. A origem Tailwind foi limitada a `src` e `index.html`, eliminando o CSS inválido gerado a partir de documentos. Permanece o aviso de chunk principal acima de 500 kB.
- API: typecheck aprovado; **559/559 testes** em **86 arquivos**, incluindo teste real de PostgreSQL para reserva versus encerramento em sequências ordenadas; não constitui teste de concorrência simultânea entre duas conexões.
- Contratos: **101/101** chamadas frontend mapeadas; zero rota ausente.
- Docker Lab: imagens reconstruídas; frontend e API saudáveis; `/health` retorna ambiente `lab`; `/ready` retorna banco, Redis, WAHA inbound, outbound, receptionist e CAPI como `ok`.
- Supabase Lab: as duas migrações novas foram aplicadas diretamente porque o ledger local já tinha deriva preexistente em migrações anteriores. O schema aceitou ambas e o teste transacional passou. Nenhuma alteração foi feita no Supabase de produção.
- Release: builds de frontend e API preparados. Preflight executado e bloqueado por working tree com alterações não commitadas. Nenhum commit ou deploy foi realizado.

Limites que continuam válidos:

- O Cockpit autenticado não foi inspecionado visualmente com conta de homologação. Paginação com mais de 50 jornadas, Enter repetido e cliques concorrentes ainda precisam de execução E2E. A atualização da fila recarrega as páginas já abertas; envio preserva texto alterado enquanto a requisição está em andamento.
- Reservas que permaneçam em `SENDING` após crash bloqueiam transições até reconciliação; este mecanismo não tem expiração automática. A recuperação entre a primeira e a segunda mensagem e o resume direto com handoff aceito ainda exigem validação específica.
- A CAPI não foi demonstrada contra Meta Test Events e o banco auditado não possui configuração ativa; portanto o pilar externo continua **não demonstrado**, embora o runtime e o mecanismo de entrega estejam corrigidos no Lab.
- Não houve deploy, migração ou reinício no VPS.

## Estado comprovado na auditoria original (antes das correções)

| Dimensão | Resultado | Evidência |
|---|---|---|
| Release API | Confirmada | `/health` retorna commit completo `e1c8474...`; manifest do container contém o mesmo SHA. |
| Bundle API | Confirmado | SHA-256 local e VPS: `3e264bffec8579175ca4159b24019165bb6b86978f0be1e334515ead4f214944`. |
| Frontend | Confirmado | HTML, JS principal e CSS publicados têm os mesmos hashes do build local. |
| Infraestrutura | Online | Caddy, API, WAHA e Redis ativos; `/health` e `/ready` respondem `200`. |
| UI pública | Confirmada | Login carregou em 375×812 e 1440×900, sem erros no console. |
| Cockpit autenticado | Não confirmado | Não havia sessão segura de homologação disponível para executar a matriz visual autenticada. |
| Build | Aprovado com alertas | Frontend e API compilam; preflight de produção passa. Bundle principal tem 1,047 MB e há CSS inválido gerado (`file:line`). |
| Testes frontend | Aprovado | 22/22 testes. |
| Testes API | Reprovado | 554/555 testes; falha em `JRN-API-03`. |
| Contratos HTTP | Aprovado no verificador | 101/101 chamadas mapeadas, zero rotas ausentes. |
| CAPI real | Não confirmado | Zero configurações habilitadas, zero outcomes, zero eventos outbox CAPI e zero deliveries no banco de produção. |

Capturas:

- [Login mobile](../../.gstack/qa-reports/screenshots/prod-login-mobile-2026-09-10.png)
- [Login desktop](../../.gstack/qa-reports/screenshots/prod-login-desktop-2026-09-10.png)
- [Login do Docker Lab](../../.gstack/qa-reports/screenshots/lab-login-mobile-2026-09-10.png)

## Vulnerabilidades e inconsistências

### AUD-001 — Worker CAPI desligado e ausente da prontidão

- **Severidade:** P0, bloqueador de homologação do pilar CAPI.
- **Estado:** [KNOWN] O container de produção não contém `META_CAPI_WORKER_ENABLED=true`. O servidor só instancia o worker quando essa variável é exatamente `true` (`apps/api/src/server.ts:362-363`).
- **Evidência adicional:** [KNOWN] O `/ready` não inclui CAPI entre as dependências (`apps/api/src/server.ts:369-376`), e o loop do worker descarta silenciosamente exceções (`apps/api/src/infrastructure/workers/capi-dispatch-worker.ts:218-224`). Produção tem zero configurações CAPI ativas, zero outcomes e zero deliveries.
- **Cenário de falha:** após um workspace habilitar CAPI, um `WON` entra na outbox, mas nenhum processo o consome. `/ready` continua verde e não alerta a operação.
- **Impacto:** perda silenciosa do fechamento de atribuição Meta e falsa percepção de saúde operacional.
- **Correção recomendada:** incluir CAPI no runtime e no health provider, registrar falhas estruturadas e falhar o `/ready` quando o worker configurado não estiver saudável.
- **Critério de aceite:** `/ready` exibe `capi-worker`; um evento controlado no Meta Test Events percorre outcome → outbox → delivery `DISPATCHED`; reinício e falha transitória preservam o mesmo `event_id`.

### AUD-002 — Jornada pode ser encerrada depois da última checagem e antes do envio da IA

- **Severidade:** P1, alta.
- **Estado:** [KNOWN] A consulta de elegibilidade é fail-closed quando o banco falha (`receptionist-agent.ts:828-830`) e bloqueia status diferente de `OPEN` (`receptionist-agent.ts:802-803`).
- **Brecha:** [KNOWN] A segunda checagem ocorre em `receptionist-agent.ts:1266-1269`, mas a reserva posterior não trava nem revalida o status da jornada. A RPC `reserve_receptionist_outbound` apenas grava a reserva (`20260909120000_allow_runtime_role_receptionist_outbound.sql:43-53`). O envio ao provedor ocorre depois (`receptionist-agent.ts:1337-1366`).
- **Cenário de falha:** T1 valida `OPEN`; T2 grava `WON/LOST/ABANDONED` e commita; T1 reserva e envia a mensagem mesmo com a jornada já encerrada.
- **Impacto:** contato indevido após venda, perda ou abandono; quebra de confiança e de regra comercial.
- **Correção recomendada:** mover a autorização final para uma RPC transacional que faça `SELECT ... FOR UPDATE`, confirme `status='OPEN'`, titularidade e bot ativo, e crie a reserva no mesmo commit.
- **Critério de aceite:** teste concorrente com barreira de commit prova zero chamadas WAHA/WABA quando o outcome vence a corrida.

### AUD-003 — Segunda mensagem complementar ignora encerramento e não tem reserva própria

- **Severidade:** P1, alta.
- **Estado:** [KNOWN] Depois de completar a primeira reserva, o agente espera 1 segundo e envia a segunda mensagem sem nova consulta de bot/status e sem nova reserva idempotente (`receptionist-agent.ts:1379-1415`).
- **Cenário de falha:** a primeira mensagem sai; durante a espera, o operador conclui a jornada; a segunda pergunta comercial ainda é enviada.
- **Impacto:** mensagem após encerramento e possibilidade de duplicação em retomada/reprocessamento.
- **Correção recomendada:** tratar cada efeito externo como reserva separada e revalidar atomicamente a jornada antes de cada chamada ao provedor.
- **Critério de aceite:** encerrar ou pausar a jornada durante a espera impede a segunda chamada; retry não duplica nenhuma parte.

### AUD-004 — “Retomar IA” permite estado zumbi de jornada e handoff

- **Severidade:** P1, alta.
- **Estado:** [KNOWN] `/bot/resume` altera qualquer jornada do workspace e não exige `status='OPEN'` (`agent-routes.ts:795-805`). A resposta calcula `botActive` sem considerar o status comercial (`agent-routes.ts:813-836`).
- **Brecha na UI:** [KNOWN] Quando existe handoff `ACCEPTED`, a UI ignora qualquer falha de `returnHandoffToAi` e reativa o bot mesmo assim (`LiveCockpitView.tsx:723-731`). O fluxo inverso também ignora falha do segundo passo (`LiveCockpitView.tsx:706-715`).
- **Cenário de falha:** devolver handoff falha, `resumeBot` funciona e a UI mostra sucesso; o handoff continua aceito pelo humano enquanto `responder_owner='sos_sales'` e o bot está ativo. Outro cenário reativa flags em jornada fechada.
- **Impacto:** dual-engine, resposta concorrente humano/IA e estado visual contraditório após atualização.
- **Estado atual do banco:** [KNOWN] as consultas read-only encontraram zero jornadas fechadas com bot habilitado e zero handoffs aceitos fora do estado humano/pausado. O risco está no caminho de escrita publicado, ainda sem ocorrência presente.
- **Correção recomendada:** uma única RPC transacional deve validar jornada aberta, canal vinculado, transição do handoff e titularidade antes de reativar; a UI não deve engolir falhas.
- **Critério de aceite:** falha em qualquer etapa faz rollback integral; após F5, banco, botões e owner permanecem no mesmo estado.

### AUD-005 — Fila “Todas” oculta jornadas acima de 20

- **Severidade:** P1, alta para operação.
- **Estado:** [KNOWN] O gateway suporta cursor (`salesOsGateway.ts:1070-1091`), mas o Cockpit carrega `limit: 20`, usa apenas `journeyPage.data` e descarta `nextCursor` (`LiveCockpitView.tsx:547-552`).
- **Cenário de falha:** o workspace tem 21 ou mais jornadas; as mais antigas não aparecem e não existe “carregar mais”.
- **Impacto:** oportunidades invisíveis, atraso de SLA e falsa fila vazia.
- **Correção recomendada:** paginação incremental com cursor, indicador de carregamento e preservação da seleção/filtros.
- **Critério de aceite:** fixture com 55 jornadas permite acessar as 55, sem duplicar ou perder itens entre páginas.

### AUD-006 — Enter pode criar múltiplos envios simultâneos

- **Severidade:** P1, alta.
- **Estado:** [KNOWN] O botão usa `disabled={actionInProgress...}`, mas o handler de `Enter` não consulta `actionInProgress` antes de chamar `onCreateOutboundDraft` (`LiveCockpitView.tsx:2699-2714`).
- **Cenário de falha:** Enter repetido antes do primeiro retorno cria duas requisições com o mesmo texto.
- **Impacto:** mensagens duplicadas e fila de aprovação inconsistente.
- **Correção recomendada:** guarda síncrona por `ref`, desabilitação do input e chave idempotente estável para a intenção de envio.
- **Critério de aceite:** dez eventos Enter durante uma resposta lenta produzem uma única criação no backend.

### AUD-007 — Follow-up tem idempotência de backend, mas o clique duplo gera chaves diferentes

- **Severidade:** P2, média.
- **Estado:** [KNOWN] A RPC deduplica corretamente a mesma chave e possui constraint única (`20260818000010_concurrency_and_idempotency_hardening.sql:28-59`). O gateway frontend cria um novo UUID por chamada (`salesOsGateway.ts:1413-1431`).
- **Cenário de falha:** dois cliques chegam antes do rerender que aplica `inProgress`; cada requisição recebe uma chave diferente e ambas podem inserir tarefas.
- **Impacto:** follow-ups duplicados e cobrança operacional em dobro.
- **Correção recomendada:** gerar e manter uma chave por abertura/submit do modal e adicionar trava síncrona local.
- **Critério de aceite:** duplo clique concorrente retorna a mesma tarefa com `idempotent=true` na segunda resposta.

### AUD-008 — Horário padrão do follow-up sofre deslocamento visual em Brasília

- **Severidade:** P2, média.
- **Estado:** [KNOWN] O valor inicial de `datetime-local` é criado com `toISOString().slice(0,16)` (`LiveCockpitView.tsx:3048-3052`). Em UTC-3, 10:00 local vira `13:00` no campo. A submissão de uma escolha manual de 10:00 gera corretamente `13:00Z` (`LiveCockpitView.tsx:3103-3106`).
- **Cenário de falha:** o operador aceita o valor padrão pensando que foi agendado para 10:00; o campo mostra e salva 13:00 local.
- **Impacto:** follow-up três horas atrasado em Brasília.
- **Correção recomendada:** formatar o valor inicial em componentes locais, sem passar por UTC; converter para ISO apenas no submit.
- **Critério de aceite:** com `TZ=America/Sao_Paulo`, o campo abre em 10:00 e o banco recebe 13:00Z.

### AUD-009 — Suíte API falha por quebra do contrato de erro do follow-up

- **Severidade:** P2, bloqueador de homologação técnica.
- **Estado:** [KNOWN] `JRN-API-03` espera `Invalid journey operation request`, mas a rota devolve `Validação: dueAt - Invalid datetime` (`journey-operations.ts:80-92`). Resultado: 1 teste falhou, 554 passaram.
- **Impacto:** clientes que dependem do contrato estável podem quebrar; a release não satisfaz a própria suíte obrigatória.
- **Correção recomendada:** escolher um contrato público estável e alinhar implementação e teste, sem expor detalhes internos desnecessários.
- **Critério de aceite:** 555/555 testes da API e teste de regressão para corpo inválido, header inválido e parâmetros inválidos.

### AUD-010 — Falha fatal da CAPI usa parâmetro com semântica errada

- **Severidade:** P2, média.
- **Estado:** [KNOWN] O worker chama `failEvent(... maxAttempts: 1)` esperando DLQ imediata em erro fatal (`capi-dispatch-worker.ts:143-152`). O gateway envia esse valor como quinto argumento de `fail_outbox_event`, mas a RPC interpreta o argumento como `p_retry_delay_seconds`, enquanto decide DLQ por `outbox_events.max_attempts` (`initial_domain_schema.sql:697-739`).
- **Cenário de falha:** payload permanentemente inválido é reenviado até atingir o limite da linha, em vez de ir imediatamente para dead letter.
- **Impacto:** chamadas desnecessárias à Meta, ruído operacional e demora na reconciliação.
- **Correção recomendada:** separar explicitamente `retryDelaySeconds` de política de tentativas e criar uma operação de dead letter fatal.
- **Critério de aceite:** erro fatal termina em `DEAD_LETTER` na primeira tentativa; erro transitório respeita backoff e limite configurados.

## Controles confirmados

- [KNOWN] `commercial_journeys.status` é `NOT NULL`; a verificação de IA não depende de um status nulo ambíguo.
- [KNOWN] Falha/timeout ao consultar o estado do bot resulta em silêncio, não em envio.
- [KNOWN] Outcome, fechamento da jornada e inserção na outbox pertencem à mesma transação. Se a outbox falhar, o outcome também faz rollback. A entrega externa para Meta é desacoplada após o commit.
- [KNOWN] O claim da outbox usa `FOR UPDATE SKIP LOCKED`, lease, worker ID e claim token. Complete/fail rejeitam claims obsoletos.
- [KNOWN] O CAPI usa `outcomeId` como `event_id` determinístico. Um retry preserva a chave enviada à Meta.
- [KNOWN] `/tracking/test-capi` exige Test Event Code no servidor, exige telefone, envia token apenas em header Authorization e está protegido por autenticação, tenant e papel de owner.
- [KNOWN] Rascunhos incluem usuário, workspace e jornada na chave e os testes unitários passaram. A limpeza global de rascunhos não é chamada no logout, mas isso não demonstrou vazamento entre jornadas distintas.

## Health score

**8,3/10, WARNING.** Typecheck: 10/10. Testes: 7/10 pelo critério da skill (>95% aprovados com uma falha). Lint dedicado, dead code, shellcheck e GBrain não estavam configurados e foram excluídos com redistribuição de peso. Esta é a primeira entrada do histórico, portanto ainda não há tendência.

## Decisão de release

**NÃO APROVAR como “produção confirmada por completo”.** A release está corretamente publicada e a superfície pública está operacional. Para homologar o núcleo comercial, é obrigatório resolver AUD-001, AUD-002, AUD-003, AUD-004, AUD-005 e AUD-006, restaurar 100% da suíte e executar uma prova autenticada dos cinco pilares com conta segura de homologação. Para CAPI, a prova deve usar Meta Test Events e comprovar o percurso persistido no banco, sem evento real de campanha.

## Limitações da auditoria

- Não foram enviados WhatsApps nem eventos externos reais.
- A produção foi inspecionada apenas em leitura.
- O Cockpit autenticado não foi exercitado por falta de sessão de homologação disponível.
- A skill `review` não pôde ser executada fielmente porque o arquivo obrigatório `.agents/skills/gstack/review/checklist.md` não existe na instalação; a revisão adversarial manual cobriu o checklist fornecido pelo usuário.
