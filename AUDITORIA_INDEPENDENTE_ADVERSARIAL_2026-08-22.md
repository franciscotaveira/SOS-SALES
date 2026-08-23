# SOS Sales v2.0 — Auditoria Independente Adversarial

**Data da coleta:** 2026-08-22 01:49 BRT / 04:49 UTC  
**Escopo:** checkout local, testes, build, Docker Lab, autenticação, multi-tenancy, webhooks WAHA/WABA, segredos, dependências, artefato publicado, VPS, PostgreSQL e backup  
**Checkout auditado:** `main` em `f07ecadc73c7a252789f048bc493a303f4e1f1c5`, com 41 entradas modificadas/não rastreadas  
**Modo:** somente leitura sobre código e produção; nenhum deploy, restart, POST destrutivo, envio de mensagem ou alteração de banco foi executado

## 0. Veredito executivo

> **NO-GO / REPROVADO PARA PRODUÇÃO.**

As alegações de “100% remediado”, “41/41 arquivos e 268/268 testes”, “TypeScript com zero erros”, “release rastreável” e “ambiente 100% homologado” **não são sustentadas pelo estado atual**.

O risco não é apenas uma pendência de engenharia. Há um **incidente ativo de controle de acesso em produção**:

- `GET /api/v1/workspaces/{workspace}/contacts` respondeu `200` sem `Authorization` e entregou **50 contatos reais** na verificação de 2026-08-22 04:47 UTC;
- status WAHA, tracking, relatório de SLA e dados WABA também responderam `200` anonimamente;
- o bundle publicado registra `logout` e `clear-history` sem os guardas fail-closed presentes no checkout;
- o logout anônimo tem caminho destrutivo completo comprovado, sem que fosse necessário executá-lo;
- o clear-history anônimo possui caminho para exclusão tenant-wide, com confiança 8/10; não foi executado por segurança;
- a aplicação usa uma role PostgreSQL com `BYPASSRLS`, ampliando o impacto de qualquer falha de autorização.

O estado local também não está liberável: a API tem 9 erros TypeScript, a integração falha, o Docker de produção não constrói e o Docker Lab aponta por padrão para o banco de produção.

## 1. O que foi provado, contradito ou ficou bloqueado

| Alegação anterior | Evidência independente atual | Resultado |
|---|---|---|
| “41/41 arquivos, 268/268 testes OK” | Unitários: 11/11 arquivos e 83/83 testes. Integração: 16 arquivos falharam, 16 passaram; 30 testes falharam e 101 passaram. | **CONTRADITA** |
| “TypeScript: zero erros” | `npm exec -- tsc --noEmit`, executado dentro de `apps/api`, retorna 9 erros. O comando `npm --prefix apps/api exec -- tsc --noEmit` pode usar o `tsconfig` da raiz e produzir falso verde. | **CONTRADITA** |
| “Build completo aprovado” | O bundle local pode ser gerado, mas `docker build -f Dockerfile.api .` falha com `Cannot find module '/scripts/generate-release-manifest.mjs'`. | **CONTRADITA** |
| “WhatsApp Flow 100% verificado” | O teste criptográfico isolado passa. A rota real lê `action`, `screen`, `data` e `flow_token` no objeto externo, embora `FlowCrypto` os retorne em `decryptedBody`; isso também aparece no TypeScript. | **CONTRADITA NO FLUXO REAL** |
| “Autenticação fail-closed implantada” | O checkout contém hooks. O bundle publicado não contém esses guardas; rotas irmãs respondem anonimamente e os handlers destrutivos estão registrados. | **CONTRADITA EM PRODUÇÃO** |
| “Release/commit provado por `/version`” | Produção declara `d715ee2`, mas esse objeto não existe no checkout; o valor coincide com o prefixo do container. Não há `GIT_COMMIT_SHA` nem manifesto dentro do container. | **CONTRADITA** |
| “Docker Lab pronto para homologação” | O compose contém DSN/senha de produção e chave WAHA como defaults; subir o Lab tocaria produção. | **BLOQUEADA POR ISOLAMENTO INSEGURO** |
| “Backup e restore homologados” | Há um dump plaintext, modo `0644`, legível por usuário sem privilégio, com dados e material de segredo; não há automação ou restore drill comprovado. | **CONTRADITA** |
| “9/9 E2E aprovam produção” | Os scripts usam credencial real em texto claro; alguns executam mutações comerciais e webhooks falsos. Não constituem um gate seguro nem atual. | **EVIDÊNCIA INVÁLIDA/OBSOLETA** |

## 2. Evidência de execução

### 2.1 Gates locais

| Gate | Resultado atual | Interpretação |
|---|---|---|
| Frontend `npx tsc --noEmit` | `0` | Frontend tipa no snapshot atual. |
| API `npm exec -- tsc --noEmit` em `apps/api` | `2`, 9 erros | Bloqueia release. |
| `npm run test:unit` em `apps/api` | 11 arquivos / 83 testes, todos OK | Cobertura estreita; não prova integração nem produção. |
| `production-runtime.test.ts` | 23/24 | `HLT-07` falha sem PostgreSQL local. |
| `npm run test:integration` | 16 arquivos falharam, 16 passaram; 30 falhas / 101 passes | Banco local ausente e erros de ingestão; gate vermelho. |
| `npm run check:api` | `2` | Para nos mesmos 9 erros TypeScript. |
| `node scripts/test-flows-crypto.mjs` | `0` | Primitiva criptográfica isolada OK; não cobre a rota quebrada. |
| `docker build -f Dockerfile.api .` | `1` | Script de manifesto não existe dentro do estágio builder. |
| `npm audit --omit=dev` na raiz | 0 vulnerabilidades de produção | Raiz sem achados atuais. |
| `npm --prefix apps/api audit --omit=dev` | 5 vulnerabilidades: 3 high, 1 moderate, 1 low | Gate de supply chain vermelho. |

Erros TypeScript determinísticos:

1. módulo inexistente `infrastructure/database/workspace-normalization.js`;
2. três propriedades do body do Flow não tipadas;
3. quatro propriedades lidas no nível errado do resultado de `FlowCrypto.decryptRequest`;
4. `WorkspaceDirectory` usado sem import/declaração.

### 2.2 Produção, black-box seguro

Coleta sem token e sem mutações:

| Endpoint | HTTP | Evidência sanitizada |
|---|---:|---|
| `/health` | 200 | produto/versão/commit declarados |
| `/ready` | 200 | DB, Redis e worker declarados OK |
| `/version` | 200 | commit declarado `d715ee2` |
| `/api/v1/workspaces` | 401 | prova que não havia autenticação implícita no proxy |
| `.../channels/whatsapp/status` | 200 | status e metadados de sessão expostos |
| `.../contacts` | 200 | `success=true`, **50 contatos** |
| `.../tracking` | 200 | configuração de tracking exposta |
| `.../reports/performance-sla` | 200 | métricas do tenant expostas |
| `.../channels/waba/channel-info` | 200 | dados do canal/telefone WABA expostos |

Nenhum valor pessoal foi copiado para este relatório.

### 2.3 VPS e artefato

- containers principais estavam em execução; isso prova disponibilidade parcial, não segurança;
- API/WAHA não tinham healthcheck efetivo observado no runtime publicado; Redis tinha;
- WAHA usa tag mutável `latest`;
- `/ready` não verifica WAHA nem Caddy;
- logs WAHA mostraram erros recorrentes de QR; Caddy tentava renovar certificado para hostname morto;
- SHA-256 do bundle API publicado: `891e857209ed40d77bcd9e4b3c6d088c5d08f8c12a31c51f8cadc84b42c7a14e`;
- SHA-256 do bundle API local: `7ad2db3814b26875afaeb803a580ba243f3d1e4c472a81a52e5d146f9fdde8fc`;
- frontend publicado correspondia ao asset local verificado, mas sem manifesto de proveniência;
- o bundle remoto contém fallback que usa o hostname/container como “commit”; o manifesto esperado não existe no container;
- o checkout contém guardas de autenticação, mas o bundle remoto não contém as mensagens/guardas fail-closed correspondentes.

## 3. Achados de segurança acima do gate 8/10

### P0-01 — Exposição anônima de PII e configurações em produção

**Severidade:** CRITICAL  
**Confiança:** 10/10  
**Status:** VERIFIED em black-box, com resposta sanitizada

Um atacante que conheça ou obtenha o UUID de um workspace pode consultar contatos, status WAHA, tracking, SLA e dados WABA sem bearer token. A própria resposta de contatos retornou 50 registros reais.

**Impacto:** violação de confidencialidade, possível incidente LGPD, reconhecimento de infraestrutura e preparação de ataques destrutivos.

### P0-02 — `clear-history` anônimo no artefato publicado

**Severidade:** CRITICAL  
**Confiança:** 8/10  
**Status:** STATICALLY VERIFIED; impacto final deliberadamente não executado

O bundle publicado registra `POST .../clear-history` sem os guardas do checkout. O handler abre transação e executa DELETE tenant-wide em mensagens, fatos, decisões, ações, handoffs, resultados, agenda, notas e pipeline. A role runtime tem `BYPASSRLS` e privilégios DELETE confirmados nas tabelas críticas verificadas.

**Limite da prova:** uma trigger, FK ou falta de privilégio em alguma tabela não inventariada pode provocar rollback. Isso não reduz a necessidade de contenção imediata.

### P0-03 — Credencial real de operador versionada em quatro scripts

**Severidade:** CRITICAL  
**Confiança:** 9/10  
**Status:** VERIFIED no checkout e histórico Git

Arquivos afetados, com o valor deliberadamente omitido:

- `scripts/test-e2e-all-routes.js:11`;
- `scripts/test-all-system-features.js:39-41`;
- `scripts/production-guarantee.mjs:57-60`;
- `scripts/master-goal-validation.mjs:28-31`.

**Impacto:** takeover da conta se a senha ainda for válida; remoção do HEAD não basta, pois o segredo está no histórico.

### P0-04 — Docker Lab contém credenciais e aponta por padrão para produção

**Severidade:** CRITICAL  
**Confiança:** 10/10  
**Status:** VERIFIED em `docker-compose.lab.yml:37-44`

O Lab recebe um DSN de produção completo e chave WAHA como fallback. Um teste local, reset, migração ou webhook pode operar contra dados reais.

**Impacto:** vazamento de segredo, corrupção de dados e falsa separação de ambientes. O Lab não foi iniciado por esse motivo.

### P0-05 — IDOR cross-tenant em Autonomous Revenue com RLS neutralizado

**Severidade:** CRITICAL  
**Confiança:** 10/10  
**Status:** INDEPENDENTLY VERIFIED

`autonomous-revenue-routes.ts` exige somente que exista um `operatorActor`; não confirma que o ator pertence ao `workspaceId` enviado. Os serviços consultam o workspace fornecido, e a role de produção possui `rolbypassrls=true`.

**Exploit:** um usuário autenticado do tenant A envia o UUID do tenant B e acessa oportunidades de ghosting/retenção ou dispara análise sobre jornada alheia.

### P1-01 — Logout WAHA anônimo em produção

**Severidade:** HIGH  
**Confiança:** 10/10  
**Status:** INDEPENDENTLY VERIFIED sem executar o POST

O handler usa a chave interna para apagar a sessão WAHA e recriá-la vazia. Rotas irmãs do mesmo plugin responderam anonimamente; o bundle não contém os guardas do checkout. Um atacante pode desconectar o telefone e forçar novo QR.

### P1-02 — Papel `viewer` pode executar ações destrutivas no checkout atual

**Severidade:** HIGH  
**Confiança:** 10/10  
**Status:** INDEPENDENTLY VERIFIED

`assertTenantAccess` verifica apenas se o workspace aparece na lista do ator. A propriedade `role` (`owner`, `operator`, `viewer`) não participa da decisão. Logo, viewer com membership pode usar logout, clear-history, sync e broadcast.

### P1-03 — TLS do PostgreSQL não valida o certificado

**Severidade:** HIGH  
**Confiança:** 9/10  
**Status:** INDEPENDENTLY VERIFIED em `pool.ts:19`

Toda conexão não local usa `rejectUnauthorized: false`. Um adversário em posição de rede pode apresentar certificado arbitrário e interceptar credenciais/dados do banco.

### P1-04 — Backup de produção plaintext e world-readable

**Severidade:** HIGH  
**Confiança:** 9/10  
**Status:** VERIFIED no VPS

O dump `/opt/sos-sales/backups/db_backup_v1.0.0-rc1.sql` estava `root:root`, modo `0644`, com diretórios pais atravessáveis. A leitura por UID/GID não privilegiado foi confirmada. O arquivo contém contatos, mensagens e material `_secret_token`. Não foi encontrada automação, criptografia, retenção ou restore drill.

### P1-05 — Fastify vulnerável a bypass de validação por Content-Type

**Severidade:** HIGH  
**Confiança:** 8/10  
**Status:** DEPENDENCY VERIFIED; exploração de endpoint específico não executada

O runtime usa Fastify 4.29.1, afetado por CVE-2026-25223. Um `Content-Type` manipulado pode contornar a validação de schema e alcançar handlers com body não validado. Referência: [GitHub Advisory GHSA-jx2c-rxcm-jvmq](https://github.com/advisories/GHSA-jx2c-rxcm-jvmq).

Também há alerta high em `@fastify/static` (CVE-2026-15074), mas a exposição concreta do plugin em uma rota sensível não foi provada; por isso ficou fora da contagem principal. Referência: [GitHub Advisory GHSA-83w8-p2f5-377r](https://github.com/advisories/GHSA-83w8-p2f5-377r).

## 4. Defeitos de release/readiness não classificados como vulnerabilidade CSO principal

1. **Webhook WAHA não é transacional:** marca replay antes da persistência; falha posterior pode perder evento. O receptor novo também seleciona `LIMIT 1` em qualquer canal do workspace, sem filtrar provider/session/status.
2. **Anti-replay é in-memory:** reinício perde a janela; o Map cresce até limpeza oportunista.
3. **Flow real quebrado:** usa o wrapper de `decryptRequest` como body; o teste isolado mascara a falha de integração.
4. **Migração de segredos incoerente:** inserts esperam `id`, mas a migração não cria essa coluna; consumidores ainda consultam colunas Vault removidas pelo desenho novo.
5. **Mocks/fallback de billing:** AbacatePay não está configurado no runtime; a rota pública devolve comportamento simulado. Isso viola a regra de não usar mock em produção, embora a exploração financeira não tenha sido demonstrada.
6. **Manifesto não fail-closed:** aceita árvore suja e defaulta ambiente para `production`; o Dockerfile não copia o script requerido.
7. **CI supply-chain:** actions usam tags mutáveis (`@v4`, `@v2`) e não SHAs; não há `CODEOWNERS` encontrado.
8. **E2E perigoso:** scripts “de garantia” têm credenciais reais e alguns alteram outcomes, reconciliação e webhooks de produção.

## 5. Superfície e modelo de ameaça

O censo estático encontrou **103 rotas Fastify**:

- 88 tratadas como autenticadas no checkout atual;
- 11 webhooks/integrações públicas;
- 1 mutação pública de billing;
- 3 endpoints de sistema;
- nenhum RBAC explícito por capability nas rotas sensíveis auditadas.

### STRIDE resumido

| Classe | Evidência principal | Risco |
|---|---|---|
| Spoofing | credencial versionada; webhooks com segredo global | Alto |
| Tampering | clear-history e logout alcançáveis no bundle remoto | Crítico |
| Repudiation | E2E/mutações sem trilha de release confiável | Alto |
| Information Disclosure | 50 contatos e metadados de canais sem auth | Crítico |
| Denial of Service | logout remoto, QR instável, rotas destrutivas | Alto |
| Elevation of Privilege | viewer sem capability; IDOR + BYPASSRLS | Crítico |

## 6. Plano de contenção e remediação

### Fase A — Contenção de incidente, antes de qualquer deploy funcional

1. Preservar logs e hashes do bundle/container atual para investigação.
2. Bloquear no Caddy/API todas as rotas `/api/v1/workspaces/*` que não passam autenticação; priorizar contacts, reports, tracking, channel-info, logout e clear-history.
3. Rotacionar a senha do operador exposta, revogar sessões e revisar logs do Supabase desde a primeira inclusão no Git.
4. Rotacionar credenciais presentes no compose/histórico e remover os valores do Git, inclusive histórico compartilhado.
5. Restringir backup para diretório `0700`, arquivo `0600`, criptografar e inventariar cópias.
6. Notificar o DPO/responsável LGPD para avaliar obrigação de resposta a incidente.

### Fase B — Correção local obrigatória

1. Corrigir os 9 erros TypeScript e tornar `npm run check:api` gate real.
2. Aplicar autenticação e membership fail-closed no app, com RBAC por capability (`viewer` somente leitura).
3. Aplicar `assertTenantAccess` em Autonomous Revenue e remover `BYPASSRLS` da role da aplicação.
4. Refatorar WAHA para um único pipeline transacional, idempotência persistente e resolução de canal/provider exata.
5. Corrigir `FlowCrypto` na rota e adicionar teste que chama o endpoint criptografado completo.
6. Corrigir migração `channel_connection_secrets` em banco limpo e testar upgrade/rollback.
7. Tornar Docker Lab isolado, com PostgreSQL descartável local e sem qualquer fallback de produção.
8. Corrigir Dockerfile para copiar o gerador de manifesto; falhar em árvore suja/commit desconhecido para release.
9. Atualizar Fastify e plugins para versões corrigidas, rodando testes de contrato e regressão.
10. Habilitar validação CA do PostgreSQL.

### Fase C — Homologação antes de redeploy

Critérios observáveis:

- API e frontend TypeScript com exit `0` no diretório correto;
- unitários, integração e migrations em banco vazio com 100% dos testes executados passando;
- Docker image construída do zero e manifesto presente dentro da imagem;
- Docker Lab usa banco/Redis/WAHA exclusivamente locais;
- matriz negativa confirma `401` sem token, `403` cross-tenant e `403` para viewer em mutações;
- clone sanitizado do backup valida `clear-history`, RLS e restore sem tocar produção;
- DAST seguro contra staging cobre todos os 103 endpoints;
- `/version` retorna SHA do Git e SHA-256 do bundle que correspondem ao artefato implantado;
- backup criptografado, automatizado, monitorado e restaurado em ensaio documentado;
- somente depois: canary, observação e promoção com rollback ensaiado.

## 7. Limites explícitos da auditoria

- O POST de logout e o POST de clear-history **não foram chamados em produção**.
- O Docker Lab não foi iniciado porque seu default conecta ao banco de produção.
- A suíte de integração não pôde ficar verde sem PostgreSQL local seguro; seu resultado vermelho foi registrado, não mascarado.
- Não houve homologação real com fornecedores Meta/WAHA/AbacatePay.
- Não foi executado restore de backup em clone isolado.
- Esses limites impedem um GO, mas não enfraquecem os achados comprovados nem o veredito NO-GO.

## 8. Decisão recomendada

**Decisão executiva:** tratar como incidente P0, conter primeiro e só então iniciar um ciclo de correção + Lab isolado + canary. Não executar os scripts E2E existentes contra produção e não promover o checkout atual.

---

**Aviso CSO:** esta auditoria foi assistida por IA e não substitui auditoria profissional ou teste de intrusão por equipe qualificada. O método reduz ruído e exige caminhos de exploração concretos, mas pode perder vulnerabilidades sutis ou interpretar fluxos complexos incorretamente. Para um CRM multi-tenant com PII, WhatsApp e integrações externas, contrate pentest independente antes de declarar produção homologada.
