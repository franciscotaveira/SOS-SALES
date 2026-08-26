# SOS Sales — Frontend/Backend Assurance

> Data: 25 ago 2026
> Escopo: contratos visíveis no frontend, persistência, autorização e execução real no backend
> Produção: somente inspeção read-only
> Lab: migrations, rebuild, autenticação e testes controlados
> Decisão atual: `NOT_READY_FOR_PRODUCTION_DEPLOY`

## 1. Resultado executivo

O alerta foi confirmado. Havia controles operacionais com aparência de produto pronto que existiam apenas no navegador: modo global da IA, calibração comportamental, modo semi-autônomo, trilha de auditoria, API/webhooks, equipe, infraestrutura e outras configurações.

O primeiro lote P0 foi corrigido no checkout e homologado no Lab. Nenhuma dessas mudanças foi enviada à produção.

## 2. Veredito sobre o walkthrough do Gemini

| Alegação | Veredito | Evidência |
|---|---|---|
| Guardrail de preço foi adicionado | `PARTIAL` | O prompt e testes unitários contêm a regra; o teste direto NVIDIA usa prompt próprio e não comprova o fluxo webhook → DB → agente → WABA. |
| Configuração dinâmica está sincronizada por workspace | `FAIL no release auditado` | A UI de calibração persistia em `localStorage`; o runtime não consumia o modo global do frontend. |
| Fallback estático é transparente/seguro | `FAIL` | Fallback permite resposta com configuração não publicada. A correção local remove essa autorização e falha fechado. |
| Aba Agência/Clientes integra o Receptionist | `UNPROVEN` | A superfície visual não constitui contrato de publicação consumido pelo agente. |
| 337/337 testes passaram | `STALE` | Execução atual após as correções: 50 arquivos, 340/340 testes passando. |
| Frontend e API estão sincronizados no VPS | `PARTIAL` | Captura 21:34Z: manifests e `/version` concordam em `be1e05...`, mas `cleanTree=false`; não há proveniência reprodutível. |
| Receptionist 24/7 está integralmente operacional | `UNPROVEN` | Health/readiness estão verdes e as chaves de runtime existem, mas não foi executado canário outbound real neste escopo; `WABA_BOOKING_FLOW_ID` não aparece no container. |

## 3. Contrato da IA corrigido no Lab

### Fonte de verdade

- `workspace_agent_config` agora guarda `autonomy_mode`, `runtime_enabled`, `behavior_config`, `published_at` e `published_by`.
- Somente `owner` pode publicar configuração global.
- A UI lê e publica pela API autenticada; não usa mais `localStorage` para autorizar autonomia.
- O agente só pode responder quando todos os gates são verdadeiros:
  1. provider configurado e `RECEPTIONIST_ENABLED=true`;
  2. configuração do workspace publicada;
  3. `runtime_enabled=true`;
  4. `autonomy_mode=autonomous_24_7`;
  5. jornada com `bot_enabled=true`;
  6. jornada sem pausa humana.
- Ausência de tabela, linha, publicação, provider ou banco bloqueia outbound.

### Verdade na interface

- Alteração de modo só mostra sucesso após confirmação 200 do backend.
- Erro de API força estado supervisionado e mostra erro ao operador.
- O simulador QA não altera mais o runtime real.
- O modo semi-autônomo e seu autoenvio após 10 segundos foram desativados até existir execução/auditoria server-side.
- Logs e “96% de precisão” inventados foram removidos.
- O Atlas não inventa orientação quando a API falha e não afirma “Online 24/7” sem verificação.
- Configurações locais sem backend ficam bloqueadas no modo API com aviso explícito.

## 4. Contratos HTTP

Auditoria estática atual:

- 110 arquivos frontend;
- 118 arquivos backend;
- 65 chamadas HTTP do frontend;
- 65 rotas correspondentes;
- 0 chamadas literais sem rota backend.

Isso comprova existência de contrato, não sucesso funcional. Nas ações WABA ainda não homologadas, o backend responde `501 WABA_CAPABILITY_NOT_IMPLEMENTED`, e a UI recebe capabilities e desabilita Pix nativo, GPS, produto e carrossel. Flow e botões permanecem expostos porque possuem implementação backend.

## 5. Evidência do Lab

| Gate | Resultado |
|---|---|
| TypeScript frontend | PASS |
| TypeScript API | PASS |
| Testes focados IA/RBAC | 31/31 PASS |
| Suíte API completa | 50 arquivos, 340/340 PASS |
| `/health` Lab | 200, `v2.0.0-lab` |
| `/ready` Lab | DB, Redis e worker `ok` |
| GET config autenticado | 200 |
| PUT config como owner | 200 e leitura posterior consistente |
| Estado final do workspace | `copilot_supervised`, `runtime_enabled=false` |
| Jornadas com bot ativo após testes | 0 |
| Erros recentes DB/worker após correção de rede | 0 observados no recorte final |

## 6. Produção observada, sem mutação

Captura read-only às `2026-08-25T21:34:34Z`:

- `/health`: 200;
- `/ready`: 200, DB/Redis/worker ok;
- `/version`: commit `e773ec7`, bundle `be1e05...`, `cleanTree=false`;
- API iniciada às `21:00:41Z`, sem restart loop;
- 0 HTTP 5xx e 0 polling errors no recorte de oito horas do script;
- chaves `RECEPTIONIST_ENABLED`, `NVIDIA_API_KEY`, `NVIDIA_NIM_BASE_URL` e `NVIDIA_NIM_MODEL` presentes;
- `WABA_BOOKING_FLOW_ID` ausente.

Esses sinais provam disponibilidade e presença de configuração, não resposta correta ao cliente nem consumo do contrato novo.

## 7. Resíduos ainda abertos

| ID | Risco | Estado |
|---|---|---|
| FB-001 | Release de produção criado de árvore suja | P0 aberto |
| FB-002 | Contrato novo da IA ainda não implantado em produção | P0 aberto |
| FB-003 | 25 escritas em `localStorage`; parte é preferência segura, parte ainda representa função operacional | P1 em classificação/remediação |
| FB-004 | 9 imports de mocks/fixtures; superfícies operacionais foram bloqueadas, agenda/notas/inteligência ainda exigem limpeza completa | P1 aberto |
| FB-005 | Cinco ações WABA não implementadas; agora falham explicitamente e ficam ocultas por capability | Contido, não concluído |
| FB-006 | Canário real NVIDIA → WABA com dois números controlados não foi executado | Gate externo pendente |
| FB-007 | Booking Flow não está configurado no container de produção | P1 aberto |

### Contenções adicionais deste lote

- Gestão de Clientes não fabrica mais um workspace/canal “conectado” a partir do endpoint idempotente de bootstrap. Em modo API, a criação de subconta falha explicitamente até existir contrato backend próprio.
- Catálogo, documentos, aprendizado e perfis de agente baseados em fixtures não são exibidos no modo API. A Tese continua disponível porque agora possui contrato backend.
- Tracking em modo API inicia vazio, mostra erro quando o backend falha e não recorre a defaults Haven/localStorage. Inclusão e exclusão de campanhas passam a persistir pela API.

## 8. Gate para produção

Não realizar deploy enquanto qualquer item abaixo falhar:

1. checkout limpo e commit exclusivo das correções;
2. build reproduzível com manifests correspondentes;
3. backup e migration dry-run do `workspace_agent_config`;
4. deploy API antes do frontend, mantendo runtime global desligado;
5. smoke autenticado GET/PUT como owner e bloqueio viewer;
6. comprovação de zero jornadas ativas após migration;
7. canário em uma jornada controlada;
8. observação de logs, persistência e handoff;
9. autorização explícita do Francisco para ativar autonomia e para qualquer outbound real.

## 9. Rollback

- UI: manter/copiar modo `copilot_supervised` e `runtime_enabled=false`.
- Backend: rollback para artefato anterior sem ativar jornadas.
- Banco: migration é aditiva; não remover colunas durante incidente. Desabilitar runtime global é o rollback operacional imediato.
- Provedor: não enviar retries manuais sem reconciliar provider message ID e estado no banco.

## 10. Correções aplicadas em 2026-08-26 (somente Lab)

- Removida a ação de composer `SOS Destravar Venda`, que gerava horários, Pix e condições sem origem verificável no backend.
- Removidos macros com Pix/endereço/horários fictícios; Pix e endereço só aparecem quando existem no perfil comercial carregado.
- Status de WhatsApp deixou de mascarar falhas do endpoint com fallback stale do workspace; erro agora resulta em estado indisponível.
- Command Palette passou a declarar apenas a busca realmente implementada (telas e comandos).
- Docker Lab passou a construir o frontend dentro da imagem com `VITE_SUPABASE_URL` local; `.dockerignore` reduz o contexto e evita carregar artefatos de produção.
- Corrigidos estados ausentes do Kanban (`dragOverColId` e modal de nova conversa) e erro de narrowing da fila do cockpit.

Validação local: `npm run build`, `npm run lint` e `APP_ENV=lab npm --prefix apps/api run build` passaram. A validação integrada do Docker Lab foi concluída quando o daemon Docker ficou disponível; nenhum VPS foi alterado.

### Revalidação com Docker ativo (2026-08-26)

- Frontend Lab construído em arm64 após inclusão explícita dos bindings nativos de Rollup, LightningCSS e Tailwind Oxide.
- `sos-sales-lab-api`, `sos-sales-lab-web`, Redis e WAHA ativos; API e web healthy.
- Login real do usuário descartável no Supabase Lab passou; `/workspaces`, `/journeys`, `/priorities`, `/cockpit` e `/agent/config` responderam 200.
- O avatar deixou de consultar o workspace default incorreto e passou a usar o workspace autenticado; a chamada passou a retornar sem 403.
- Console do navegador limpa após reload: sem erros; nenhum deploy ou mutação no VPS.

Pendência observada: o endpoint de status WhatsApp pode levar até alguns segundos e algumas requisições ficam `pending` durante polling; deve ser tratado como risco de latência/timeout do gateway WAHA antes do canário real.

### Reconciliação com a release real do VPS

A auditoria foi refeita com o frontend implantado no VPS preservado como baseline isolado em `http://localhost:3334` e o candidato corrigido em `http://localhost:3333`. A API Lab foi reconstruída com SHA-256 `1ff83128...`, idêntico ao bundle do VPS. O baseline reproduziu o `403` causado pelo workspace hardcoded do avatar; o candidato eliminou o erro e manteve as rotas críticas em HTTP 200. Evidências e limitações estão em `VPS_BASELINE_RECONCILIATION_2026-08-26.md`.
