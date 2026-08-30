# SOS Sales — Runbook de Publicação Controlada

Este runbook publica o SOS Sales sem reutilizar credenciais, sessões ou volumes
do CRM TX. O primeiro release é de **operação supervisionada**: recepção
inbound, cockpit autenticado, handoff, follow-up, outcome e prova de tráfego.
O envio WAHA permanece desabilitado até homologação própria.

## Gates obrigatórios antes de publicar

- [ ] Branch de release passa `npm run check` no commit exato a ser publicado.
- [ ] Acesso SSH confirmado ao VPS novo e fingerprint registrado.
- [ ] Projeto Supabase remoto com permissão de aplicar migrations e Auth
  configurado; nenhum segredo é salvo no Git.
- [ ] Migrations `00001` a `00007` aplicadas e conferidas no Supabase remoto.
- [ ] Pelo menos um usuário operador e um workspace/membership reais criados.
- [ ] DNS do domínio do SOS Sales aponta para o VPS e firewall permite somente
  `22`, `80` e `443` publicamente.
- [ ] Redis é privado à rede Docker; Postgres é o Supabase remoto, nunca um
  banco local exposto pela VPS.
- [ ] `is_outbound_enabled` está desativado em workspace e canal.

## Segredos e variáveis

Crie `/opt/sos-sales/.env.production` no VPS, permissões `0600`, fora do Git.
O arquivo deve conter os valores reais, sem aspas de exemplo:

```dotenv
NODE_ENV=production
PORT=4334
HOST=0.0.0.0
DATABASE_URL=postgresql://<scoped-runtime-user>:<password>@<supabase-host>:5432/postgres?sslmode=require
REDIS_URL=redis://sos-sales-redis:6379
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_AUDIENCE=authenticated
WAHA_WEBHOOK_SECRET=<new-isolated-secret>
WAHA_API_KEY=<waha-api-key>
META_VERIFY_TOKEN=<meta-webhook-verify-token>
META_APP_SECRET=<meta-app-secret>
```

Para cada canal WAHA ativo, inclua também
`WAHA_WEBHOOK_SECRET_<CHANNEL_CONNECTION_ID_COM_HIFENS_TROCADOS_POR_UNDERSCORES>`.

O `VITE_SUPABASE_ANON_KEY` pode ir para o build do frontend. Nunca inclua
`SUPABASE_SERVICE_ROLE_KEY`, chave WAHA, senha Postgres, token Meta ou chave de
IA no frontend, no `docker compose`, em logs ou em arquivos versionados.

## Ordem de publicação

1. Confirmar SSH no novo VPS e instalar Docker Engine/Compose, Caddy e fail2ban.
2. Criar usuário de deploy sem login por senha e diretórios `/opt/sos-sales`.
3. Configurar firewall: SSH restrito à origem administrativa quando possível,
   HTTP/HTTPS públicos; nenhuma porta de Redis, WAHA, Studio ou API diretamente
   pública.
4. Aplicar migrations no Supabase remoto de forma forward-only e registrar o
   resultado. Executar testes de RLS com dois workspaces antes de apontar DNS.
5. Gerar frontend e API com `APP_ENV=production` e executar
   `bash scripts/preflight-production-deploy.sh`. O preflight bloqueia release
   sem bundle, manifesto do commit, runtime, compose ou CA oficial válida.
6. Executar `bash scripts/stage-production-release.sh`. O stage envia o conjunto
   frontend + API + runtime + CA + compose para
   `/opt/sos-sales/releases/<commit>` sem alterar o release ativo.
7. Após aprovação humana, executar
   `bash scripts/promote-production-release.sh "$(git rev-parse HEAD)"`. A troca
   do symlink `/opt/sos-sales/current` é atômica e API/Caddy são recriados juntos.
8. Verificar `/health` e `/ready`; publicar só se ambos responderem 200 e
   `ready` reportar `database`, `redis`, `waha-inbound-worker`,
   `outbound-worker` e `receptionist-worker` saudáveis.
9. Configurar Caddy com TLS automático, redirecionamento HTTP→HTTPS e proxy
   somente para frontend/API. Definir `trustProxy=1` somente atrás desse proxy.
10. Executar o Golden Path com usuário piloto: login Supabase, workspace,
   leitura de fila/dossiê, handoff, follow-up, fato, desfecho e Traffic Proof.
11. Ativar monitoramento, retenção de logs e backup/restauração testada. Só então
   liberar os primeiros operadores.

## WAHA: gate separado

Não use a sessão nem o volume do CRM TX. Suba uma instância SOS isolada, privada
na rede Docker, com credenciais novas, webhook HTTPS assinado e uma sessão de
teste. Antes de habilitar outbound, prove no motor selecionado:

- correlação/idempotência por mensagem;
- comportamento após timeout depois de possível envio;
- reconciliação determinística sem reenvio cego;
- ciclo `SENT`, `DELIVERED`, `READ` e `FAILED` append-only;
- kill switch de workspace e canal bloqueando antes do provedor.

Sem essas provas, mantenha os dispatches somente como rascunho/aprovação humana.

## Rollback

- Executar `bash scripts/rollback-production-release.sh`; o ponteiro `current`
  volta para `previous`, restaurando em conjunto frontend, API, runtime, CA e
  compose. Migrations são forward-only e não sofrem rollback destrutivo.
- Desativar outbound no banco antes de qualquer intervenção.
- Preservar volumes Redis/WAHA e coletar logs, mas não reutilizar sessão WAHA
  em outro produto.
- Se a readiness falhar durante a promoção, o script restaura automaticamente
  o release anterior e recria API/Caddy antes de retornar erro.

## Evidências mínimas de GO

Anexar ao release: hash do commit, saída de `npm run check`, lista das migrations
remotas, resultado de RLS com dois workspaces, `/health` e `/ready` pós-deploy,
TLS válido, backup/restore validado e Golden Path piloto assinado pelo operador.
