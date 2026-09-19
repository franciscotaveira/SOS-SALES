# Definition of Done

Um pacote só recebe `ACCEPTED` quando todos os itens aplicáveis estão satisfeitos.

## Produto

- problema e resultado definidos;
- fluxo normal, erro, offline, vazio e restrito;
- sem dados fictícios em produção;
- comportamento observável pelo usuário.

## Código

- TypeScript strict;
- contratos explícitos;
- domínio separado de infraestrutura;
- diff restrito ao ownership;
- sem dependências circulares relevantes;
- sem fallback silencioso.

## Dados e tenancy

- migration em banco vazio e upgrade;
- RLS negativa com roles reais;
- ausência de workspace implica zero acesso;
- FKs compostas tenant-safe;
- índices para queries críticas;
- retenção definida.

## Segurança

- autenticação e autorização server-side;
- segredos e PII redigidos;
- replay, SSRF e rate limit quando aplicável;
- threat model atualizado;
- key rotation e revogação quando houver credencial.

## Testes

- teste que reproduz a falha anterior;
- unitário e contrato;
- integração real proporcional ao risco;
- concorrência para filas;
- browser para UI;
- negative paths e defect injection;
- suíte encerra naturalmente.

## Operação

- liveness e readiness distintas;
- métricas e correlation IDs;
- alertas;
- runbook e rollback;
- feature flag para efeito externo;
- configuração documentada.

## Evidência e aceite

- comandos e resultados vinculados ao SHA;
- limitações declaradas;
- revisão read-only independente;
- zero P0/P1;
- board, matriz e índice atualizados;
- commit legível e árvore limpa.

## Regras especiais

- Caminhos de mensagem, dinheiro, tenancy e CAPI exigem teste negativo e de falha.
- Dependência externa permanece `BLOCKED_EXTERNAL`; não pode ser simulada como aceita.
- Executor não aprova o próprio trabalho.
- Quantidade de testes não substitui cobertura do comportamento.
