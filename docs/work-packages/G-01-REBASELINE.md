# G-01 — Rebaseline do Projeto

## Estado

`READY` — G-00 aceito; inventário pode continuar sem reorganizar ou corrigir conteúdo.

## Objetivo

Após G-00 preservar o estado bruto, transformar o working tree atual em um inventário rastreável, sem alterar lógica do produto.

## Escopo

- registrar baseline Git;
- classificar cada arquivo como Iteração 2.7, 3, 4 ou incidental;
- identificar alterações sobrepostas;
- propor checkpoints sem executar reset ou descarte;
- atualizar drift README/ADRs;
- definir gates reproduzíveis para 2.7 e 3.

## Fora do escopo

- corrigir Iteração 4;
- criar feature;
- editar migration por conveniência;
- deploy;
- VPS/V2/Supabase real;
- descartar arquivos.

## Saídas

1. `G-01-INVENTORY.md` com arquivo, domínio, iteração, dependência e ação `KEEP/REWORK/DISCARD_CANDIDATE`.
2. estratégia de snapshot recuperável;
3. plano de separação de commits;
4. lista de gates por checkpoint;
5. riscos ou conflitos que exigem decisão.

## Critérios de aceite

- 100% dos arquivos modificados/untracked classificados;
- nenhuma ação destrutiva executada;
- nenhuma atribuição baseada apenas no nome do arquivo;
- mudanças compartilhadas explicitamente marcadas;
- plano revisado por engenharia e QA;
- working tree preservado integralmente.

## Próximo pacote

`G-02` consolida e revisa a governança; `G-03` planeja a reconstrução e a separação dos checkpoints após aceite do inventário.
