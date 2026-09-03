# Plano de fechamento para produção — SOS Sales

> **Autoridade:** este documento é o runbook de release. Escopo, prioridades e gates de
> produto/engenharia são definidos em
> `docs/plans/SOS_SALES_META_FIRST_MVP_MASTER_PLAN_2026-08-30.md`. O deploy só pode
> começar quando o GO técnico aplicável do plano-mestre estiver comprovado.

Data: 2026-08-31  
Branch: `codex/production-ca-fix`  
Commit candidato remoto: `ea602b2c2b134c97ffd8fddae58bbe2891642d11`  
Base: `main`

## Decisão operacional de 31/08/2026

O VPS passa a ser a **única autoridade para integrações reais**: WABA, WAHA, webhooks,
workers de outbound e IA conectada a conversas reais. O Docker Lab continua existindo
para build, contratos, banco isolado e regressão, mas fica proibido de carregar tokens,
números, canais ou callbacks oficiais.

Esta decisão não autoriza edição manual de código dentro do container. Toda correção
continua nascendo em Git, é empacotada como release imutável, promovida com rollback e,
após comprovada, torna-se também a referência do Docker Lab.

Motivo: o canário anterior misturou dispatch/banco do Lab com callback no VPS. A Meta
aceitou a requisição, mas não houve prova de `SENT`, `DELIVERED` nem recebimento no
aparelho. O cenário está classificado como `FAIL` até novo teste integral no VPS.

## Objetivo

Liberar o MVP já construído sem criar novas funções, preservando WABA, WhatsApp,
IA, dados e rollback. A liberação só termina quando a cadeia real estiver provada:

`UI autenticada → API → RBAC → banco → fila/worker → WAHA/WABA → IA → persistência → reload`

## Premissas que precisam permanecer verdadeiras

1. O release atual do VPS continua ativo até o candidato passar todos os gates.
2. Nenhuma jornada terá o bot habilitado globalmente; o teste de IA será controlado.
3. Frontend, API, runtime, CA e compose são uma unidade indivisível de release.
4. Health HTTP isolado não aprova produção; WABA/IA e persistência precisam de prova real.
5. Migrações são forward-only; não haverá reparo destrutivo do histórico nesta liberação.
6. Alterações não relacionadas presentes no workspace não entram no PR de produção.

## Estado comprovado

- API local: 57 arquivos e 398 testes aprovados.
- Teste adversarial de replay: 10/10 aprovado isoladamente após limpeza de fixtures.
- Build de frontend e API: aprovado com `APP_ENV=production`.
- Preflight: manifesto, commit, compose, runtime e CA oficial aprovados.
- GitHub CI do commit candidato: quatro checks aprovados.
- Produção atual: permanece na versão anterior saudável; candidato ainda não promovido.

## Sequência de conclusão — plano VPS-first controlado

### Fase 0 — congelar e conter

- Registrar `/version`, `/ready`, containers, release ativo e hashes dos artefatos.
- Criar backup lógico dos registros de canais, segredos sem exposição, mensagens,
  dispatches e eventos necessários à reconciliação.
- Confirmar que o release anterior é restaurável e que nenhum teste está pendente.
- Manter IA global e outbound de canário desligados até o momento autorizado.

**Gate:** baseline atual `dd5bae7` preservada, backup com checksum e rollback resolvível.

### Fase 1 — fechar a origem do release

- Criar worktree limpo a partir de `origin/codex/production-ca-fix`.
- Auditar o diff `origin/main...ea602b2` em modo somente leitura.
- Proibir a inclusão das alterações não relacionadas existentes no checkout principal.
- Confirmar que frontend, API, runtime, migrations e compose pertencem ao mesmo SHA.
- Validar TLS, compose, runtime factory, atomicidade, rollback e ausência de segredos.
- Executar build e toda a suíte automatizada no worktree limpo.

**Gate:** árvore limpa, testes verdes, build verde, manifesto igual ao SHA e revisão
sem achado P0/P1 aberto.

### Fase 2 — separar Lab e produção definitivamente

- Lab inicia sempre com outbound externo bloqueado.
- Lab não recebe `META_*`, tokens WABA, números oficiais nem secrets WAHA de produção.
- Runtime recusa provider real quando `APP_ENV != production`, salvo modo de teste
  explícito que use credenciais e destinos sintéticos.
- Webhook oficial permanece apontado somente para `crm.iaparavendas.tech`.
- Adicionar teste que falha se uma configuração de produção vazar para o compose Lab.

**Gate:** nenhuma credencial oficial no container Lab e tentativa real fail-closed.

### Fase 3 — stage imutável no VPS

- Executar `scripts/preflight-production-deploy.sh`.
- Executar `scripts/stage-production-release.sh`.
- Validar `/opt/sos-sales/releases/<sha>` no VPS sem alterar `current`.
- Validar configuração por presença, nunca imprimir valores secretos.

**Gate:** release completa em `/opt/sos-sales/releases/<sha>`, compose válido e
produção ainda executando `dd5bae7`.

### Fase 4 — promoção atômica e smoke técnico

- Registrar `current`, containers e endpoints antes da mudança.
- Executar `scripts/promote-production-release.sh <sha>`.
- O script deve trocar o release como conjunto e restaurar `previous` automaticamente
  se `/health` ou `/ready` falhar.
- Confirmar `/version`, autenticação negativa, banco, Redis e worker.

**Gate:** `/health` e `/ready` 200, versão igual ao SHA promovido e nenhum erro novo
de inicialização. Falha restaura automaticamente `dd5bae7`.

### Fase 5 — diagnosticar WABA no mesmo ambiente

- Confirmar que o Phone Number ID pertence ao canal Haven esperado.
- Confirmar webhook `messages` inscrito e challenge/HMAC válidos.
- Validar que status desconhecido não é descartado sem correlação observável.
- Correlacionar `dispatch_id`, `provider_message_id`, callback e mensagem persistida.
- Registrar códigos Meta sanitizados quando houver `FAILED`.

**Gate:** um callback controlado consegue ser associado ao canal e à mensagem no banco
do próprio VPS. `ACCEPTED` isolado não aprova esta fase.

### Fase 6 — canário real autorizado

- Confirmar readiness de banco, Redis, inbound WAHA, outbound e receptionist.
- Confirmar autenticação e isolamento de workspace.
- Consultar canal WABA real e suas capabilities com usuário autorizado.
- Processar um evento controlado: webhook → persistência → worker → UI/reload.
- Enviar uma mensagem controlada e verificar estado persistido, sem reenvio duplicado.
- Executar um canário de IA em apenas uma jornada/número autorizado e confirmar:
  resposta sem preço inventado, handoff humano, pausa e retomada.
- Confirmar que jornadas não selecionadas continuam com bot desligado.

**Ordem obrigatória do canário:**

1. Haven WABA envia uma única mensagem template aprovada para o número SOS Sales.
2. O banco registra uma tentativa e um único `provider_message_id`.
3. Webhook registra `SENT` e depois `DELIVERED`, ou `FAILED` com código rastreável.
4. Francisco confirma visualmente a mensagem no aparelho.
5. O número SOS Sales responde uma vez; WAHA persiste inbound no VPS e a UI mostra a
   conversa após reload.
6. Repetição da mesma chave idempotente não cria segunda mensagem.

**Gate:** `ACCEPTED → SENT → DELIVERED → confirmação no aparelho → resposta inbound
persistida → reload`. Qualquer elo ausente é `FAIL`.

### Fase 7 — IA e handoff em uma conversa

- Ativar apenas a jornada allowlisted.
- Testar preço desconhecido, agendamento e pedido de humano.
- Exigir resposta fundamentada, handoff persistido, pausa e retomada.
- Confirmar que nenhuma segunda IA ou outro número responde à mesma conversa.
- Desativar o canário e reconciliar zero jornadas adicionais ativas.

**Gate:** zero alucinação numérica, uma única resposta automática e controle humano real.

### Fase 8 — decisão GO/NO-GO e estabilização

GO exige evidência de todas as fases anteriores. Qualquer falha de readiness, tenant,
WABA, persistência, idempotência ou IA resulta em NO-GO e rollback imediato.

Após GO:

- observar erros, fila, retries e status Meta por pelo menos 30 minutos;
- registrar a matriz final `PASS/FAIL/BLOCKED/UNVERIFIED`;
- promover o SHA aprovado em Git/main conforme o fluxo do repositório;
- reconstruir o Docker Lab a partir desse mesmo SHA, com providers externos bloqueados;
- nunca copiar arquivos modificados manualmente do container para o Git.

## Rollback

Executar `scripts/rollback-production-release.sh`. Validar novamente `/health`,
`/ready`, `/version`, containers e logs. O rollback deve restaurar conjuntamente
frontend, API, runtime, CA e compose; nunca restaurar apenas `dist`.

## Fora deste release

- Refinamento visual adicional, mobile e novas funcionalidades.
- Expansão global do bot para todas as jornadas.
- Reparação cosmética do histórico de migrations.
- Remoção de funções ou consolidação de telas sem auditoria funcional específica.
- Uso do VPS como ambiente de desenvolvimento interativo ou edição manual de containers.
- Sincronização de segredos de produção para o Docker Lab.

## Evidência final obrigatória

| Prova | Resultado esperado |
|---|---|
| SHA/manifesto | Mesmo release em Git, build e VPS |
| CI | 4/4 verde no SHA promovido |
| Health/readiness | HTTP 200 e cinco dependências saudáveis |
| WABA/WAHA | Canal real consultável, inbound e outbound persistidos |
| IA | Canário controlado, guardrails e handoff comprovados |
| Multi-tenant | Acesso próprio permitido e cruzado negado |
| Reload | Estado permanece após recarregar a UI |
| Rollback | Release anterior resolvível e restaurável como unidade |

## Critério de conclusão

O SOS Sales estará liberado como MVP de produção apenas quando o usuário puder entrar,
operar uma conversa real do WhatsApp e observar o estado correto após reload, enquanto
WABA, IA, isolamento e rollback estiverem comprovados por evidência do VPS.
