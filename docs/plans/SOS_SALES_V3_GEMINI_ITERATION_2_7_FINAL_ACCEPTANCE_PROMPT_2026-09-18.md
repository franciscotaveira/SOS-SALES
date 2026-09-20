# V3 — Aceite final da Iteração 2.7 para Gemini 3.8

Revisão de 18/09/2026. Este documento é um prompt de execução; não modifica a V3.

## Evidências desta revisão

- Branch `codex/iteration-2.7`, mudanças ainda não commitadas sobre `a4d9cf1`.
- Suíte repetida: 58 testes passaram em sete suites.
- Docker HTTP: identidade fictícia com token válido → 200; emissor incorreto → 401; audiência incorreta → 401.
- Escolha explícita do provedor e validação issuer/audience estão implementadas.
- `DISABLE TRIGGER` foi removido dos teardowns examinados.
- Sessão Supabase legítima continua não comprovada; não constitui prova negativa do adapter.

## Lacunas verificadas

1. `packages/database/src/test-support.ts:15` permite qualquer banco com nome terminado em `_test`. Não verifica protocolo, host, porta, nome autorizado, opt-in nem equivalência dos destinos runtime/migration. Isso não comprova a proteção fail-closed descrita no relatório. Não foi demonstrado acesso remoto ou dano: a lacuna está na guarda.
2. `test-support.ts:24` inclui a URL inteira em um erro de parsing. Uma entrada malformada pode carregar credenciais. Não reproduzir com segredo real.
3. `packages/auth/src/jwt-provider.ts:91` e o adapter Supabase registram o objeto de erro bruto. A execução desta revisão mostrou `err.payload.email`, `sub`, `iss` e outros claims nos logs. O logger atual não remove esse payload.
4. O banco `sos_sales_v3_test` foi provisionado manualmente. O helper cria pools; não provisiona nem descarta o banco. Os teardowns só encerram recursos e preservam fixtures. A suíte passou novamente, porém não há um ciclo de provisionamento/descarte reproduzível em checkout novo.
5. O relato de papéis sequenciais não comprova revisão em contexto independente. Registrar a identidade da execução/contexto, snapshot e achados do revisor, ou declarar segunda leitura pelo próprio implementador.

## Prompt para enviar ao Gemini

```text
Você é Gemini 3.8. Aplique o protocolo do Prompt A do pacote
SOS_SALES_V3_GEMINI_AGENT_EXECUTION_PROMPTS_2026-09-18.md e feche somente
as pendências de aceite da Iteração 2.7 em
/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES.

Não criar uma nova reconstrução do produto. Preserve as correções de JWT,
provider explícito, RBAC, RLS e auditoria. Não editar V2/VPS/produção.
Revalide branch, diff, arquivos e evidências antes de implementar.

AGENTES
A — Isolamento e ciclo de vida dos testes
Ownership: packages/database/src/test-support.ts, bootstrap test-only e testes
desse helper. Propor mudanças de scripts/CI ao coordenador.
B — Observabilidade de autenticação
Ownership: pontos de logging dos adapters auth e helper de sanitização/logging
necessário, com testes de captura de logs em arquivos novos sob sua responsabilidade.
C — QA integrador
Após A/B estabilizarem contratos: testes API/DB existentes, matriz final e reprodução
em ambiente novo. Não alterar os arquivos de implementação de A/B.
D — Revisor somente leitura em contexto novo
Depois do snapshot congelado: aplicar Prompt C do pacote e emitir seu próprio relatório.
Coordenador controla manifests/lockfile/Compose, scripts compartilhados e evidências.
A e B podem trabalhar em paralelo. Só coordenador opera banco/Docker compartilhados.
Todos preservam as alterações dos demais e não escrevem fora do ownership acordado.
Se o host não tem agentes nativos, declarar papéis sequenciais. Não chamar isso
de revisão independente nem inventar dispatches; entregar pacote para revisor externo.

TAREFA A — Destino seguro e ambiente reproduzível
- Validar protocolo PostgreSQL, destino local autorizado, porta prevista e nome
  exato/prefixo test-only governado antes de conectar ou criar/remover recursos.
- DB runtime e migration precisam apontar para o mesmo destino de teste, com
  roles esperadas distintas. Rejeitar destino divergente.
- Exigir opt-in explícito para operações administrativas e recusar contexto
  não-test. Não tomar o texto '_test' como autorização suficiente.
- Não resolver a guarda com conexão preliminar à URL insegura: validar antes.
- Depois da validação estática e antes das fixtures, confirme current_database(),
  marcador test-only e atributos da role runtime no servidor autorizado.
- Tentativas DDL negativas precisam de transação com ROLLBACK garantido, mesmo
  se a tentativa tiver sucesso inesperado. Um teste de DROP TABLE não pode
  destruir a tabela antes de detectar a regressão de privilégio.
- Erros não podem incluir URL completa, senha, token ou credencial.
- Implementar comando documentado de bootstrap/migrate/run/dispose exclusivo
  para testes. Preferir DB por execução/suite; manter alternativa serial se necessária
  e justificada, impedindo concorrência entre runners no mesmo DB.
- Descartar apenas recurso criado/identificado pelo próprio runner test-only.
  Nunca usar down -v ou remoção de volumes da aplicação.
- Preservar trigger e privilégios da auditoria durante a suíte inteira.
  Proibir DISABLE TRIGGER, session_replication_role, DROP TRIGGER e TRUNCATE
  da auditoria como mecanismo de limpeza.
- Após falha/cancelamento, manter banco de aplicação intacto; recuperar órfãos
  test-only de forma identificada, limitada e segura.
- Não depender de um comando manual feito anteriormente pelo implementador.

TAREFA B — Logs seguros
- Não registrar objetos de erro JWT/JWKS brutos que contenham payload.
- Logar somente atributos permitidos, como código de erro, categoria do provedor,
  status e correlationId. Não confiar que trocar level=warn para debug resolve.
- Manter diagnóstico suficiente para distinguir credencial inválida de falha do
  provedor, sem incluir claims, email, subject, cookies ou token no log de rejeição.
- Cobrir também URLs de conexão malformadas e erros com causas encadeadas.
- Se fizer defesa adicional no logger, não substituir por ela a sanitização no ponto
  de origem. Verificar tanto forma estruturada quanto saída serializada.

ACEITE
R01. Matriz de URLs aceita somente o destino autorizado e rejeita host remoto,
porta diferente, protocolo inválido, banco lab/V2/produção, nome somente parecido,
destinos runtime/migration divergentes e ausência de opt-in administrativo.
R02. Casos rejeitados não abrem conexão nem realizam operação administrativa.
R03. URLs malformadas com credenciais-sentinela e erros JWT com payload-sentinela
não deixam esses valores na saída de logs, exceptions públicas ou relatório.
R04. Testes rodam duas vezes pelo comando documentado sem preparação manual
prévia, sem fixtures acumuladas no DB permanente nem recurso órfão não identificado.
R05. Falha deliberada no setup/teste/cleanup não afeta DB lab; trigger e permissões
do lab ficam iguais antes/depois. Tratar cancelamento no runner quando suportado.
R06. Testes de auth/RLS existentes continuam passando; controles HTTP positivo,
iss errado e aud errado continuam 200/401/401 no Docker atualizado.
R07. Build/typecheck passam no snapshot final. Não alterar testes para burlar guard.
R08. Script de prova HTTP sanitizado e relatório ficam no repositório, não apenas
em scratch privado do IDE. Indicar base, diff/snapshot, comandos e exit codes reais.
R09. Revisão em contexto independente identificada ou marcada como não executada.
R10. AC15 permanece 'não comprovado/bloqueado externamente' até uma sessão
Supabase legítima em homologação chegar à API. Não criar projeto externo ou
usar produção como atalho sem autorização específica.

ATUALIZAR RELATÓRIO
Substituir aprovações amplas sem evidência por resultado de cada subcenário.
AC10 precisa distinguir indisponibilidade, token inválido, cache e rotação; o teste
de porta inacessível sozinho não comprova toda essa matriz. Acrescentar provas
determinísticas pertinentes com servidor JWKS local controlado, sem rede externa.
AC11 deve demonstrar privilégios da role runtime incluindo TRUNCATE; teste com
owner somente não substitui essa evidência.

Rollback deve preservar trabalho local: a árvore atual tem alterações não
commitadas, e checkout main/commit-base não é por si uma reversão segura.
Preparar rollback revisável de código/configuração, com segredo e contrato corretos,
sem descartar diff ou reintroduzir chave padrão. Não executar rollback nesta missão.

ENTREGA
Resultado por R01-R10, diff e arquivos, testes, provas de logs, Docker,
revisor/snapshot, rollback e limites. Fazer a menor mudança completa que resolve
esses pontos. Não iniciar Iteração 3, commit/push/deploy automaticamente.
```
