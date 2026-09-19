# G-00 — Snapshot Bruto Recuperável

## Estado

`ACCEPTED`

Aceito em 19 de setembro de 2026 com `EV-G00-001-v3.json`, após validação independente do bundle, dos checksums, da restauração e do status normalizado.

## Objetivo

Preservar integralmente o estado atual do repositório antes de inventariar, mover, separar ou reconstruir qualquer alteração.

## Ownership

- Executor: Gemini 3.8, limitado aos comandos deste pacote.
- Reviewer: Sol/QA em sessão read-only diferente da execução.
- Aprovação: Francisco somente se o procedimento precisar sair do escopo local e reversível.

## Local dos artefatos

Usar um diretório fora do checkout, com permissão `0700`:

```text
/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/<UTC_TIMESTAMP>/
```

O diretório não deve ser criado dentro do repositório nem sincronizado com serviços externos. Saídas exibidas em chat não podem conter conteúdo de secrets, patches ou arquivos; somente caminhos, contagens e hashes.

## Escopo

- registrar branch, HEAD, status, diff tracked e lista de untracked;
- criar referência recuperável sem alterar o conteúdo de trabalho;
- gerar checksums e instruções de restauração;
- registrar local, timestamp e responsável pelo artefato;
- comprovar restauração em diretório descartável.

## Proibições

- não limpar, resetar, descartar ou reorganizar arquivos;
- não misturar correção funcional;
- não publicar nem tocar V2/VPS;
- não considerar `git stash` isolado como única cópia.

## Artefatos obrigatórios

| Arquivo | Conteúdo |
|---|---|
| `baseline.json` | repositório, branch, HEAD, timestamp, versões de Git e SO |
| `status-v2.txt` | `git status --porcelain=v2 --branch` |
| `staged.patch` | diff binário das mudanças no index |
| `unstaged.patch` | diff binário das mudanças tracked fora do index |
| `repository.bundle` | refs Git necessárias para reconstruir a base |
| `untracked.tar` | todos os untracked do status, preservando paths e modos |
| `ignored-paths.txt` | lista de ignorados; caches/dependências não entram no archive |
| `sha256sum.txt` | SHA-256 de todos os artefatos anteriores |
| `restore.md` | procedimento exato e diretório descartável usado no ensaio |
| `EV-G00-001.json` | evidence manifest com comandos, exit codes, hashes e reviewer |

Se um untracked contiver credencial ou PII, ele continua sendo preservado localmente, mas o artefato deve permanecer `0700`, nunca ser commitado e ser marcado como sensível no manifest sem expor seu conteúdo.

## Procedimento de restauração

1. criar `/private/tmp/chat-sales-g00-restore-<UTC_TIMESTAMP>` vazio;
2. clonar a base a partir de `repository.bundle` no HEAD registrado;
3. aplicar `staged.patch` ao index e `unstaged.patch` ao worktree conforme descrito em `restore.md`;
4. extrair `untracked.tar` no checkout descartável;
5. comparar lista de paths, modos e hashes com o manifest;
6. executar `git status --porcelain=v2` e comparar com `status-v2.txt`, normalizando somente paths absolutos e timestamp;
7. apagar apenas o diretório descartável depois de o reviewer registrar o resultado. O pacote não autoriza apagar o snapshot.

## Critérios de aceite

| AC-ID | Requisito | Evidência |
|---|---|---|
| AC-G00-001 | branch, HEAD e refs podem ser reconstruídos | bundle verificado e clone descartável |
| AC-G00-002 | todas as mudanças tracked são restauradas byte a byte | patch aplicado e hashes comparados |
| AC-G00-003 | todos os untracked do status são restaurados | archive, lista e hashes comparados |
| AC-G00-004 | o checkout de origem não muda durante o processo | status antes/depois equivalente |
| AC-G00-005 | artefatos possuem checksum e acesso local restrito | `sha256sum.txt` e permissões registradas |
| AC-G00-006 | terceiro reproduz a restauração | revisão independente em `EV-G00-001.json` |

## Gate de saída

- tracked e untracked preservados;
- referência imutável identificada;
- restauração ensaiada em diretório descartável;
- evidência revisada por pessoa/agente diferente do executor.

## Condição de parada

Parar sem modificar o checkout se houver erro de leitura, falta de espaço, path não arquivável, checksum divergente, suspeita de segredo sendo impresso ou qualquer comando que exija limpeza/reset. Registrar o bloqueio; não improvisar.

## Próximo passo

G-01 foi liberado para inventário e rebaseline. G-02 permanece em revisão paralela.
