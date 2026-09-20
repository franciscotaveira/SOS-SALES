# V3 — Fechamento delimitado do runner de testes

## Revisão do retorno

Em 18/09/2026, foram executados nesta revisão os testes `auth-logging.test.ts` e `supabase-jwks.test.ts`: sete testes passaram em duas suites. Logs observados contêm categorias sanitizadas, sem os payloads JWT antes expostos. Os 79 testes e o build completo constam no relatório do executor; não foram repetidos nesta revisão. O runner administrativo não foi executado porque a inspeção encontrou os pontos abaixo.

| Ponto confirmado | Fonte na V3 | Consequência |
|---|---|---|
| `disposeTestDatabase` cria pool sem validar host/porta antes | `packages/database/src/test-support.ts:408` | Configuração remota pode chegar ao caminho de descarte, apesar da guarda da criação |
| `run` encerra o processo no evento `close` sem chamar descarte | `scripts/test-db-runner.ts:39` | O banco e fixtures continuam após sucesso/falha; reset na execução seguinte não é descarte final |
| Banco padrão compartilhado; bootstrap termina conexões e apaga antes de testar | `test-support.ts:344` | Dois runners concorrentes podem interromper/apagar o banco um do outro |
| Marcador criado, porém não conferido antes de apagar | `test-support.ts:364` e `:431` | Nome autorizado sozinho não prova propriedade do recurso pelo runner |
| Helper DDL seguro não usado no teste antigo | `packages/database/src/__tests__/tenant-isolation.test.ts:156` | `CREATE TABLE`/`DROP TABLE` ainda são chamados diretamente sem rollback |
| CREATEDB foi concedido manualmente à role | Log do executor; migration 002 sem provisionamento equivalente | Reprodução em volume novo não comprovada |

Não foi observado dano a banco externo. O achado de destino remoto é por leitura do caminho de código, não por execução destrutiva.

## Prompt de execução

```text
Gemini 3.8: aplique o protocolo do Prompt A do pacote anterior e feche apenas
o runner de testes da Iteração 2.7 no CHAT-SALES. Preserve as correções já
implementadas de auth, logs, RBAC, RLS e auditoria. Não iniciar Iteração 3.

Coordenador: scripts/test-db-runner.ts, scripts de provisionamento lab-only,
manifests/lockfile/configuração de testes e evidências.
Especialista A: lifecycle/guards em packages/database/src/test-support.ts.
Especialista B: tests/test-support e testes DDL existentes, depois dos contratos de A.
Revisor C: contexto novo, somente leitura, diff congelado e provas reais.
A pode preparar código em paralelo à matriz de testes de B; B integra depois.
Só coordenador executa comandos administrativos. Preserve alterações dos demais.
Sem ferramentas de agentes, declarar papéis sequenciais e revisão independente pendente.

CORRIGIR
1. Criação, recriação e descarte usam a mesma validação estática antes de pool/I/O.
   Em dispose, validar host/porta/protocolo/destino e contexto test-only, não apenas nome.
   Não forçar opt-in administrativo true dentro do código para contornar sua ausência.
2. Usar banco único por execução com RUN_ID, ou lock exclusivo comprovado.
   Não terminar conexões nem apagar banco usado por outro runner.
3. Antes de apagar recurso existente, conferir marcador e propriedade da execução.
   Não atribuir marcador a banco pré-existente desconhecido para legitimá-lo.
   Resolver recriação e recuperação de órfãos com identificação segura e limitada.
4. Runner aguarda child process como Promise e limpa seu recurso em finally antes
   de encerrar. Tratar spawn error, exit code não zero, SIGINT/SIGTERM e falha de
   cleanup com diagnóstico sanitizado. Não declarar limpeza executada em SIGKILL;
   documentar recuperação de órfãos para encerramento não interceptável.
5. Integrar runSafeNegativeDdlTest aos testes CREATE/DROP existentes.
   Garantir rollback no sucesso inesperado e no erro, sem limpar tabela por DROP
   fora de uma transação. Comprovar que a estrutura permanece intacta em regressão.
6. Versionar provisionamento mínimo lab-only necessário ao bootstrap. Uma alteração
   manual de CREATEDB feita antes não pode ser pré-requisito escondido. Não conceder
   esse privilégio à role runtime nem alterar produção/V2. Isolar credencial de teste
   administrativa quando isso evitar ampliar o papel de migrations da aplicação.

ACEITE FINAL
- Teste de dispose com destino remoto/inválido/sem autorização não instancia pool,
  conecta, termina sessão nem executa DROP. Usar spies/mocks, nunca banco externo.
- Teste de recurso sem marcador/identificador esperado recusa exclusão antes de DROP.
- Runner sucesso, teste falho e spawn falho removem somente seu próprio DB;
  após cleanup nenhum DB dessa execução permanece. Erro de cleanup é visível.
- Duas execuções concorrentes não afetam recursos uma da outra.
- Testes negativos DDL usam helper; sucesso inesperado não altera estrutura final.
- Prova em ambiente NOVO isolado, com volumes e project-name próprios, demonstra
  bootstrap -> migrations -> testes -> descarte sem concessão manual prévia.
  Não apagar nem recriar volumes do laboratório atual para produzir essa prova.
- Rodar suite apropriada, build/typecheck e provas HTTP no snapshot final.
- Inspecionar trigger/permissões do DB lab antes/depois sem alterá-los.
- Revisor independente verifica cada critério e registra snapshot; se indisponível,
  marcar explicitamente a pendência e fornecer diff/artefatos para revisão externa.

Atualizar EVIDENCE.md: distinguir reset antes da suíte de descarte após a suíte;
registrar comandos/exit codes/ambiente real e limitações, sem declarar tudo aprovado
por existência de helper ou um teste isolado. AC15 continua externo não comprovado.
Não fazer commit/push/deploy, operação em VPS/Meta ou migração de cliente.
Entregar menor diff completo para fechar estes pontos, sem reescrever o produto.
```
