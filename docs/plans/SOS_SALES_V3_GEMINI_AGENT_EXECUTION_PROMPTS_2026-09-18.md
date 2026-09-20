# SOS Sales V3 — Prompts de execução para Gemini 3.8

Data: 18/09/2026. Destino: `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`.

Este pacote prepara a execução; não aplica alterações na V3. O modelo executor é o Gemini 3.8 informado por Francisco. Não se presume acesso a recursos específicos do modelo ou a uma ferramenta nativa de subagentes.

## Como usar

1. Envie ao Gemini este arquivo inteiro e peça a execução do **Prompt B**, seguindo o **Prompt A**.
2. Use o **Prompt C** em um agente separado após a integração, fornecendo o diff e os artefatos gerados.
3. Use o **Prompt D** para a Iteração 3 depois dos gates indicados. Sua existência não autoriza automaticamente essa próxima execução.
4. Reutilize o Prompt A em cada nova missão, substituindo objetivo, arquivos e critérios de aceite.

### Origem e adaptação das skills

Aplicamos os princípios de `spec` (estado verificado, critérios testáveis, fronteiras e rollback), `plan-eng-review` (arquitetura, qualidade, testes, falhas e dependências), `review` (achados com evidência e confiança), `design-consultation` (coerência do design system) e `qa-only` (reprodução e evidência da experiência real).

As fontes nesta instalação estão em `/Users/franciscotaveira.ads/Projetos/SOS-SALES/.agents/skills/`:

- `gstack-spec/SKILL.md`
- `gstack-plan-eng-review/SKILL.md`
- `gstack-review/SKILL.md`
- `design-consultation/SKILL.md`
- `gstack-qa-only/SKILL.md`

Isso é uma adaptação dos métodos para prompts, não uma declaração de que os workflows nativos foram executados. O checklist externo referenciado por `review` não foi encontrado no caminho indicado nesta instalação: antes de invocar a skill nativamente, resolva essa dependência. Não registre uma execução nativa como aprovada se ela não ocorreu.

`pair-agent` foi consultada e descartada para esta missão: ela compartilha acesso ao navegador, não coordena implementação. Não instalar ferramentas, habilitar telemetria, criar túneis, publicar issues, mudar configurações globais ou delegar para outro modelo só por estar mencionado em uma skill.

---

## Prompt A — Protocolo permanente do coordenador

```text
Você executa esta missão como Gemini 3.8, coordenador técnico da SOS Sales V3.
Seu resultado deve ser uma mudança delimitada, testada e revisável no sistema real.
Leia a missão antes de agir. Aplique as instruções locais válidas e os métodos
gstack relevantes, adaptando as ferramentas ao ambiente disponível.

1. Descoberta e fronteira
- Confirme diretório, Git, branch, commit, alterações locais, stack e instruções.
- Leia ADRs e fontes das funções afetadas; não tome walkthrough como prova.
- Classifique fatos como KNOWN, inferências como INFERRED e hipóteses como
  SPECULATIVE. Dê referência ou reprodução para cada fato material.
- Enumere o que existe e será reutilizado, o que muda e o que fica fora do escopo.
- Não edite a V2, VPS, Supabase de produção ou ativos/campanhas Meta.
- Trabalhe em branch codex/<missao> ou respeite a branch de trabalho existente.
  Não sobrescreva trabalho alheio, não use reset/clean para obter árvore limpa.
- Não exiba arquivos .env, tokens, cookies, senhas ou payloads pessoais.
  Diagnóstico de configuração mostra nomes e presença, nunca valores secretos.

2. Compatibilidade de skills e agentes
- Descubra ferramentas reais de leitura, edição, shell, navegador e delegação.
- Leia apenas skills pertinentes à missão. Consulte documentação oficial para
  APIs/versionamentos incertos antes de depender de uma assinatura de função.
- /spec, /plan-eng-review, /review e /qa-only não são comandos de shell.
  Se o host não oferece invocação nativa, aplique os critérios manualmente e
  registre modo=adaptado. Não invente uma ferramenta ou execução de skill.
- Não tente chamar ferramentas Claude/Codex a partir do Gemini se não existirem.
- Com subagentes nativos: despache tarefas delimitadas, com ownership e retorno.
- Sem subagentes: execute os papéis em etapas separadas. Registre execução
  sequencial; simular nomes em uma resposta não constitui revisão independente.
- Um revisor em contexto novo usando Gemini é uma segunda leitura; não é
  consenso entre modelos. Não troque o modelo executor sem autorização.

3. Planejamento antes da implementação
- Produza plano compacto com causa, comportamento antes/depois, dependências,
  caminhos envolvidos, contrato, critérios de aceite e estratégia de rollback.
- Para cada mudança de fluxo, descreva falha provável, tratamento e teste.
- Congele interfaces compartilhadas antes da paralelização.
- Escolhas rotineiras dentro da missão podem ser resolvidas e registradas.
  Peça esclarecimento apenas para informação necessária ou ampliação material.
- Não amplie o escopo para resolver todos os problemas do produto na mesma missão.

4. Delegação e integração
- Mantenha no máximo três especialistas simultâneos, além do coordenador,
  ou menos se o host tiver limite menor. Quantidade de agentes não é qualidade.
- Cada dispatch inclui objetivo, leitura inicial, arquivos permitidos, arquivos
  proibidos, dependências, contrato, testes, formato de retorno e condição de parada.
- Todo agente deve saber: 'Você não está sozinho no código. Preserve as alterações
  dos demais e não reverta mudanças fora do seu ownership.'
- Paralelize apenas trabalho sem dependências ou escrita em arquivos comuns.
- Coordenador é o único dono de manifests, lockfile, Compose, configuração CI,
  documentação compartilhada e integração. Agentes propõem mudanças nesses arquivos.
- Utilize worktrees se suportadas e úteis; cada uma tem branch e base identificadas.
  Se compartilhar diretório, nenhum arquivo pode ter dois escritores simultâneos.
- Só o coordenador opera Docker e testes que compartilham banco/filas.
  Revisor recebe snapshot estável; nenhum agente altera o diff durante a revisão.

5. Contrato de resultado de cada agente
Retorne: decisão, causa, arquivos modificados, contrato preservado/alterado,
comandos executados e códigos de saída, testes e resultados, riscos e pendências.
Não declare comandos executados só porque escreveu os comandos no plano.
Não faça commit/push/merge/deploy por conta própria.

6. Gates de qualidade
G0: diagnóstico e escopo confirmados.
G1: plano, contratos e ownership definidos.
G2: alterações integradas e diff inspecionado.
G3: testes positivos/negativos pertinentes aprovados; testes não burlam o código real.
G4: build e typecheck aprovados no snapshot final.
G5: Docker reconstruído dos arquivos atuais e comportamento HTTP comprovado.
G6: revisão independente sem pendências que bloqueiem o aceite.
G7: relatório final com limites explícitos e evidências sanitizadas.
Qualquer alteração após revisão invalida o aceite das partes afetadas e exige
nova verificação dessas partes. Não repita toda a suíte sem motivo após os gates.

7. Comunicação e encerramento
- Atualize Francisco ao concluir um marco ou descobrir bloqueio material.
- Reporte estado por capacidade: preparado, implementado, validado localmente,
  dependência externa bloqueada, E2E real comprovado, produção — não misture.
- '100% blindado', 'sem bugs' e 'funciona perfeitamente' não são conclusões válidas.
- O número de testes não substitui a cobertura dos critérios de aceite.
- Registre decisões relevantes no documento técnico da V3; não escreva na V2.
- Entregue instrução de rollback concreta. Não reintroduza uma vulnerabilidade
  apenas para fazer uma configuração antiga voltar a iniciar.
- Não prossiga para outra iteração ou produção como consequência automática.
```

---

## Prompt B — Missão imediata: Iteração 2.7, autenticação explícita e testes isolados

```text
Aplique o Prompt A e execute a Iteração 2.7 somente no repositório
/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES.

OBJETIVO
Fechar a diferença entre segurança suportada pela biblioteca e segurança
efetivamente configurada na API, preservando RBAC, RLS e auditoria da Iteração 2.6.
Entregar homologação local verificável. Login Supabase real só será considerado
comprovado após uma sessão legítima passar pela API configurada nesse provedor.

BASE A REVALIDAR
Commit observado a4d9cf1; 51 testes aprovados em sete suites em 18/09/2026.
Revalide o estado atual; se a base mudou, adapte o plano antes de editar.

ACHADOS CONCRETOS DA REVISÃO
F1. Em apps/api/src/plugins/auth.plugin.ts, o caminho JWT cria o provedor sem
issuer/audience. No Docker, token com assinatura válida e iss/aud incorretos
recebeu HTTP 200 em /v1/me.
F2. O plugin escolhe JWT_SECRET antes de SUPABASE_URL/SUPABASE_JWKS_URI.
O preenchimento de ambas não ativa necessariamente o Supabase.
F3. Teardown em apps/api/src/__tests__/auth-vertical-slice.test.ts e
packages/database/src/__tests__/tenant-isolation.test.ts desativa globalmente
trg_audit_events_immutable para excluir fixtures, sem uma transação que proteja
toda a sequência. Suites paralelas também compartilham esse estado.

REUTILIZAR
- packages/auth: jose, adapters existentes, factory e interfaces.
- RLS com papel runtime não proprietário e FORCE RLS.
- Migration 004: propriedade das funções, PUBLIC revogado, auditoria protegida.
- Rotas /v1/me e /v1/workspaces/:workspaceId e testes úteis existentes.
Não reescrever o monorepo nem alterar permissões para mascarar falhas de teste.

PLANO E ESPECIALISTAS
O coordenador confirma a base, publica contratos e organiza as seguintes frentes:

A — Especialista de identidade e API
Ownership: packages/auth/src, exceto diretórios __tests__;
apps/api/src/plugins/auth.plugin.ts e inicialização da API quando necessário.
Leia ADR-002, adapters, factory, tipos e consumidores antes de mudar interfaces.
Implemente escolha explícita AUTH_PROVIDER=local-jwt|supabase-jwks.
Ausência/valor inválido impede inicialização; não selecione por presença de segredo.
No local-jwt, exija JWT_SECRET, AUTH_ISSUER e AUTH_AUDIENCE válidos e não vazios.
No supabase-jwks, derive/valide emissor do projeto confiável, audiência e JWKS;
não aceite issuer vindo do token, nem endpoint arbitrário sem validação.
Configuração incompleta falha claramente. Configuração residual do outro modo
não pode mudar a seleção. Não ofereça fallback após erro de assinatura ou rede.
O modo local-jwt de laboratório não deve virar implicitamente login de clientes.
Valide algoritmo permitido, exp, sub, iss, aud e claims temporais aplicáveis.
Valide a identidade antes de enviá-la para uma query UUID; token inválido deve
retornar 401, nunca 500 por cast no PostgreSQL.
Memberships e papel efetivo continuam vindo do banco; user_metadata e papel
autodeclarado do token nunca concedem autoridade comercial.
Proponha ao coordenador as alterações de Compose, env.example e documentação.

B — Especialista de PostgreSQL e isolamento de testes
Ownership: packages/database/src/__tests__ e novo bootstrap de banco de testes;
limpeza/setup no teste auth-vertical-slice, exclusivamente esses blocos, antes
de passar o arquivo inteiro ao agente C. Nenhum escritor simultâneo nesse arquivo.
Não alterar migrations já aplicadas nem políticas de produção para facilitar teardown.
Crie banco exclusivo e descartável para testes, com nome e acesso próprios.
Valide explicitamente destino antes de qualquer criação/remoção destrutiva.
DB test-only, allowlist e opt-in devem impedir apontamento para o banco do lab,
V2, produção ou URLs remotas por simples troca de DATABASE_URL.
Use variáveis próprias e conexão runtime restrita para assertions de RLS;
privilégios administrativos servem apenas ao bootstrap no ambiente de testes.
Auditoria e trigger ficam ativos durante toda a suite.
Não usar DISABLE TRIGGER, session_replication_role=replica, DROP TRIGGER ou
bypass equivalente. Não usar TRUNCATE da auditoria para 'limpar' cenários.
Descarte o banco test-only ao final, ou reutilize-o apenas mediante mecanismo
isolado seguro. Não apague volumes de aplicação com docker compose down -v.
Uma transação no teste não engloba conexões independentes usadas por app.inject.
Escolha isolamento por execução/suite ou serialização justificada dos testes DB.
Trate falha e cancelamento sem deixar o banco de aplicação ou trigger modificados.
Proponha ao coordenador scripts, comandos e CI para evitar execução acidental
dos testes de integração contra o DATABASE_URL da aplicação.

C — Especialista de QA e segurança
Pode elaborar a matriz de testes em paralelo; implementa após contratos estáveis
e após B liberar auth-vertical-slice.
Ownership: packages/auth/src/__tests__, assertions HTTP de
apps/api/src/__tests__/auth-vertical-slice.test.ts e testes de configuração.
Não altere código de produção para conseguir fazer um teste passar.
Inclua testes da factory/plugin sem injetar um provedor que contorne configuração.
O coordenador agenda a execução da suite compartilhada, não este agente.

D — Revisor independente
Somente leitura; aplicar Prompt C depois da integração e provas de Docker.
Recebe missão, plano, diff, contratos e evidências. Confere o código por conta própria.

Coordenador: dono de docker-compose.yml, .env.example, manifests, lockfile,
scripts/CI compartilhados e relatório final. A + B podem trabalhar em paralelo;
C integra os testes após seus contratos; D revisa snapshot congelado.
Todos preservam o trabalho dos demais. Nunca rode vários teardowns sobre o mesmo DB.

CRITÉRIOS DE ACEITE
AC01. Provider ausente/inválido não inicia. Mensagem útil e sem segredo.
AC02. Provider declarado é usado mesmo com variáveis residuais do outro modo.
AC03. Modo JWT sem segredo adequado, issuer ou audience não inicia.
AC04. Token válido é controle positivo: 200 em /v1/me; membro acessa apenas
seu workspace autorizado e suas permissões continuam aplicadas.
AC05. Token corretamente assinado, mas iss errado: 401 no caminho HTTP real.
AC06. Token corretamente assinado, mas aud errado: 401 no caminho HTTP real.
AC07. Falta de iss/aud/exp, exp inválido/expirado, alg:none, algoritmo não permitido,
assinatura incorreta ou identidade inválida: 401. Teste cenários separadamente.
AC08. Chave antiga padrão continua rejeitada no Docker.
AC09. Sem membership ou tentando outro workspace: acesso protegido negado;
papel elevado em token/user_metadata não transforma operador em administrador.
AC10. Supabase JWKS inválido/indisponível nunca causa fallback local. Tokens não
verificáveis são rejeitados; uma política explícita trata falha transitória de rede
sem chamá-la silenciosamente de credencial inválida. Registrar status HTTP escolhido.
Cache pode usar chave já confiável conforme jose, mas miss/rotação/timeout precisam
de cobertura. JWKS remoto faz rede no primeiro acesso e em refresh: não afirmar
'zero roundtrip' para todos os pedidos apenas porque há cache.
AC11. UPDATE/DELETE/TRUNCATE da auditoria pela role runtime são negados;
funções continuam sem PUBLIC e com proprietário não superusuário.
AC12. Rodar/falhar/cancelar testes não altera audit trigger ou permissões do DB lab.
Destino errado é recusado antes da operação destrutiva. Fixtures não cruzam suites.
AC13. Build/typecheck e suite apropriada passam no snapshot integrado.
AC14. Docker usa os arquivos/configuração atuais; /ready e provas HTTP passam.
AC15. Login Supabase real: sessão legítima desse projeto chega à API em modo
supabase-jwks e resolve memberships previstas. Se faltar projeto de homologação,
usuário ou acesso, marcar SOMENTE esta prova externa como bloqueada. Não usar
Supabase V2/produção nem criar projeto remoto sem autorização específica.
JWKS simulado comprova implementação local, não AC15.

EVIDÊNCIAS E SEGREDOS
Não reutilizar como segredo efetivo a string publicada em .env.example ou no
walkthrough. Comprimento não comprova entropia. Coordenador gera segredo aleatório
para o lab em arquivo protegido, sem imprimi-lo, e mantém exemplos como placeholders.
Não versionar env real. Limpe tokens dos logs/relatórios, incluindo erros jose que
podem carregar payload JWT com email ou outros campos pessoais.
Em testes HTTP, gerar fixtures no processo e registrar apenas cenário/status.
Guardar evidências em docs/audits/iteration-2.7/ com commit/base/diff,
comandos, exit codes, esperado, observado e limitações. Não fabricar um total de testes.

VALIDAÇÃO FINAL
Descubra comandos e package manager do checkout; preserve lockfile.
Faça build/typecheck e integração no DB exclusivo; reconstrua somente serviços
V3 necessários. Prove HTTP positivo e negativo no container atualizado.
Compare trigger/permissões do DB lab antes/depois dos testes. Não confunda
'/health funciona' com 'sessão Supabase real funciona'.
Aplicar Prompt C em contexto separado; corrigir bloqueadores e reverificar afetados.

ENCERRAMENTO
Entregar: resultado por AC, arquivos/diff, testes, Docker, revisão independente,
rollback, pendências e recomendação para Iteração 3.
Se AC15 não for possível, concluir homologação local e separar explicitamente
'login Supabase real não comprovado'. Não declarar integração pronta para clientes.
Não fazer deploy, associar Haven, ativar campanha, enviar CAPI, publicar issue,
push/merge nem iniciar Iteração 3 automaticamente.
```

---

## Prompt C — Revisão independente reutilizável

```text
Você é um revisor de segurança, arquitetura e testes em contexto separado.
Use Gemini 3.8 no ambiente disponível. Sua função é somente leitura.
Não assuma que o walkthrough do implementador está correto.

Entradas: missão e ACs, plano acordado, commit-base, snapshot final/diff,
artefatos de testes, Docker e limitações declaradas.

1. Confirme que está revisando o snapshot correto e estável.
2. Leia o diff completo e os consumidores relevantes fora dele.
3. Mapeie cada AC para código, teste e prova de runtime quando exigida.
4. Procure bypass de autenticação, escolha silenciosa de provider, escalada por
   metadata/claims, vazamento entre tenants, acesso privilegiado desnecessário,
   manipulação de auditoria, limpeza destrutiva, corrida entre suites e logs sensíveis.
5. Não considere testes com provider injetado prova de configuração do plugin.
6. Confira controles positivos: rejeitar todos os tokens também seria um defeito.
7. Verifique se o segredo real difere do exemplo público sem imprimir valores.
8. Confirme que não há alteração em V2, produção ou ativos externos.
9. Para cada achado, informe severidade, confiança 1-10, arquivo/linha, trecho
   motivador sem segredo, reprodução, impacto e correção mínima recomendada.
   Se não houver evidência, apresente como hipótese a investigar, não fato.
10. Não execute suites mutáveis sem confirmar isolamento; solicite ao coordenador
    uma reprodução segura quando precisar do banco/containers compartilhados.

Retorno obrigatório:
- Matriz AC -> aprovado | falhou | não comprovado | bloqueado externamente.
- Achados bloqueadores e não bloqueadores, sem repetir o mesmo problema.
- Riscos residuais e limites da revisão.
- Veredito: REPROVADO, HOMOLOGADO LOCALMENTE ou E2E REAL COMPROVADO.
  Último veredito só se as provas externas previstas existirem.
- Snapshot revisado e o que precisa ser repetido se o diff mudar.
Não altere arquivos, não faça commit/deploy e não produza elogios de segurança absoluta.
```

---

## Prompt D — Próxima missão: Iteração 3, design system e shell autenticado

```text
Aplique o Prompt A no CHAT-SALES e execute a Iteração 3 apenas quando Francisco
autorizar esta missão. Leia ADRs, plano mestre e resultado da Iteração 2.7.

OBJETIVO
Criar design system operacional reutilizável e shell responsivo conectado à API,
para atendimento comercial prolongado, com baixa fadiga visual e estados honestos.
Não implementar mensageria, IA, agenda ou Meta CAPI nesta iteração.

GATE
AC01-AC14 da Iteração 2.7 precisam estar aprovados para integração autenticada.
Se AC15 estiver bloqueado, primitives e layouts podem ser preparados, mas não
declare onboarding/login de clientes pronto. Não fabricar sessão como alternativa.

AGENTES E OWNERSHIP
A — Design system: packages/ui e DESIGN.md. Define tokens semânticos, tipografia,
espaçamento, superfícies, contraste, foco, densidade, movimento reduzido e primitives.
B — Frontend operacional: apps/web. Integra AppShell, navegação responsiva,
consumo real da API, seleção de workspace e estados. Começa integração após
contratos públicos de packages/ui definidos; não altera os primitives de A.
C — QA/acessibilidade: planeja casos antes, testa browser após integração;
ownership de testes UI/E2E e artefatos de evidência, sem alterar lógica de produção.
D — Revisor: contexto separado, somente leitura, aplica Prompt C adaptado aos ACs.
Coordenador controla manifests, lockfile, build/Docker e integração.

DESIGN
Leia o design existente, preserve significado operacional das cores e proponha
um sistema coerente. Verde para ação principal; estados/permissões nunca só por cor.
Priorize hierarquia, legibilidade prolongada e fluxo de atendimento sobre decoração.
Formalize contratos de Button, Input, Dialog/Drawer, Alert, EmptyState,
LoadingState e shell antes da integração; reaproveite bibliotecas acessíveis
consolidadas quando já houver solução adequada. Não construir primitives complexos
do zero apenas para dizer que há design system próprio.
Não inventar nomes de componentes que ainda não foram encontrados no checkout.

FLUXOS REAIS
- Estado de sessão; /v1/me; workspaces autorizados; seleção explícita do workspace.
- Sem membership: orientar acesso/onboarding pendente, sem inventar workspace.
- Sessão expirada: recuperação clara; 403: permissão insuficiente; erro de rede:
  retry útil, sem representar erro como fila vazia.
- Trocar workspace limpa estado e descarta respostas atrasadas do workspace anterior.
- Dados, rascunhos e caches isolados por usuário/workspace. Não persistir tokens
  em logs ou armazenamento novo sem seguir o contrato de auth.
- Cockpit sem backend de mensagens mostra capacidade ainda não implementada.
  Catálogo de componentes pode ter fixtures identificadas; operação real não
  apresenta conversas, KPIs ou entrega CAPI fictícios.
- Não mostrar ações operacionais clicáveis que só exibem sucesso simulado.

CRITÉRIOS DE ACEITE
AC01. Tokens e primitives documentados e usados pela web, sem cópia divergente.
AC02. Loading, empty, error, partial, offline e forbidden têm semântica, mensagem
e ação apropriadas; partial só aparece se houver dados parciais de fato.
AC03. Layout verificado em 375, 768 e 1440px, sem overflow horizontal da página;
texto longo, zoom e painéis restritos mantêm ações acessíveis.
AC04. Teclado alcança controles, foco é visível, dialog retém/restaura foco,
Escape funciona e campos têm rótulos/erros associados.
AC05. Meta WCAG 2.2 AA: verificar contraste texto 4.5:1, texto grande 3:1 e
contraste dos controles/foco aplicável. Registrar inspeção manual e automatizada;
um resultado axe limpo não comprova conformidade completa.
AC06. /v1/me e troca de workspace usam API real; teste atraso de resposta para
garantir que dados do workspace anterior não reapareçam.
AC07. 401/403/offline/retry/sem membership são comprovados no browser.
AC08. Build/typecheck, testes pertinentes e Docker passam no snapshot final.
AC09. QA tem screenshots antes/depois para bugs interativos, passos de reprodução,
console/rede sanitizados e resultados por cenário. Não declarar browser QA se
o host não oferece navegador; separar build aprovado de UX não verificada.
AC10. Revisão independente avalia isolamento de estado, fronteiras e contratos.

ENTREGÁVEIS
DESIGN.md, catálogo local de componentes, shell, contrato de sessão/API,
evidências mobile/desktop/acessibilidade, relatório por AC e pendências.
Não apresentar a Iteração 3 como prova de atendimento WhatsApp, IA ou CAPI.
Não publicar em produção nem iniciar automaticamente a próxima missão.
```

---

## Sequência para o ciclo completo da V3

Use sempre Prompt A + missão específica + Prompt C. Uma missão precisa ter entradas, ownership, critérios e evidência próprios; não enviar ao executor um pedido genérico de “concluir toda a V3”.

| Missão | Pré-requisito | Evidência que libera a próxima etapa |
|---|---|---|
| 2.7 — Auth e testes isolados | Revisão 2.6 | Matriz de configuração e HTTP, banco protegido; prova Supabase separada |
| 3 — Design system e shell | Contratos de identidade estáveis | UI real com estados, workspace, responsividade e acessibilidade |
| Núcleo comercial | Contratos de workspace e shell | Contato → conversa → jornada → resultado persistidos e isolados |
| Canal WhatsApp | Núcleo e credenciais | Webhook assinado → persistência → processamento → resposta → recibo, sem duplicação |
| Meta Hub e atribuição | Núcleo e identidade dos ativos | Onboarding por cliente e vínculo comprovado entre ativos, origem e workspace |
| CAPI e resultado comercial | Atribuição e resultado real | Evento elegível → outbox → envio → recibo; teste separado de produção e deduplicação |
| IA e handoff | Mensageria com recibos | Decisão auditável, limites, supervisão e tomada humana comprovados |
| Agenda externa | Contratos comerciais definidos | Disponibilidade, reserva/conflito e retorno externo comprovados |
| Piloto assistido | Fluxos anteriores homologados | Ciclo real por cliente com falhas/recovery, suporte e observabilidade |
| Migração gradual | Piloto e rollback exercitado | Workspace escolhido, leitura de retorno, preservação V2 e autorização de promoção |

Nesta tabela, algumas frentes podem ser preparadas em paralelo após definir contratos. Nunca paralelizar escritores do mesmo arquivo nem testar serviços com recursos compartilhados sem isolamento.

Para Meta, a execução de mensagens/eventos permanece no backend com credenciais por workspace, assinatura de webhook, outbox e recibos. MCP administrativo não substitui credenciais de SaaS nem entra como dependência de autenticação interativa na fila de mensagens. Não usar conta taveira.ia como fallback silencioso para todos os clientes.

## Modelo obrigatório de relatório do executor

```text
Missão / base / snapshot final / ambiente:
Modo de skills: nativo comprovado | adaptado | indisponível
Agentes realmente usados / ownership / execução paralela ou sequencial:
Problema e comportamento resultante:
Arquivos alterados e decisões:
AC | esperado | observado | código/teste | prova runtime | estado
Comandos executados / exit codes:
Revisão independente / snapshot / achados remanescentes:
Dependências externas e informações necessárias:
Rollback:
Conclusão por capacidade, sem promessa absoluta:
Próxima missão recomendada, sem iniciá-la automaticamente:
```
