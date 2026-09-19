# Integration Checkpoint IC-01 — Consolidação da V3 até CH-09

> Nome do arquivo: `INTEGRATION_CHECKPOINT_IC-01.md`  
> Tipo: Artefato Canônico de Proveniência e Auditoria de Histórico  
> Data de Registro: 19 de setembro de 2026  

---

## 1. Identidade e Metadados do Checkpoint

| Atributo | Valor Registrado |
|---|---|
| **Identificador** | `IC-01` (Integration Checkpoint 01) |
| **Commit SHA** | `9577e17b5508efe671d195756a27b6948c908f5b` |
| **Parent Commit SHA** | `a4d9cf13ad8885f2948bf51e1048947845ec38b7` (Iteration 2.6 Hardening) |
| **Governance Commit SHA** | `d086d081b51cfc106ca9a81dbc82e952d2326543` |
| **Tree Hash** | `50059683554e344494ff0d32e45f65a9c5bc471c` |
| **Branch** | `codex/iteration-2.7` |
| **Total de Arquivos** | `194` arquivos |
| **Volume de Linhas** | `+33.270` inserções, `-628` deleções |
| **Timestamp do Commit** | `2026-09-19 11:19:49 -0300` |
| **Autor/Committer** | Francisco Taveira `<119872625+franciscotaveira@users.noreply.github.com>` |

---

## 2. Diagnóstico e Causa Raiz da Consolidação

Durante a esteira de desenvolvimento acelerada das fases de reconstrução e canais, o código das **Iterações 2.7 e 3** e dos pacotes **CH-00 a CH-09** foi acumulado progressivamente no *working tree* da branch `codex/iteration-2.7`.

No momento do encerramento técnico do pacote **CH-09**, a execução de `git add -A` capturou indistintamente toda a árvore de trabalho pendente. Consequentemente:
- O commit `9577e17` consolidou 194 arquivos em um único delta massivo.
- **Fato Verificado:** O commit `9577e17` **não é um commit atômico exclusivo do CH-09**. Ele representa uma consolidação abrangente de múltiplos subsistemas.
- Declarar o commit `9577e17` como "commit atômico do CH-09" constituía uma falha de governança e imprecisão documental.

---

## 3. Princípio de Não-Revisionismo (Truth in Data)

Em conformidade rigorosa com a filosofia soberana do MCT OS v2.0 (*Truth in Data*):
- **O histórico do Git NÃO será reescrito:** Fica expressamente vedado o uso de `git reset --hard`, `git rebase`, `git filter-branch` ou *force-push* para fracionar artificialmente o commit `9577e17`.
- **Integridade Preservada:** Os dados, testes e implementação estão íntegros e protegidos em commits canônicos com hashes criptográficos fixos.
- **Transparência Auditável:** Em vez de falsificar a linearidade com commits retroativos forjados, registra-se a proveniência exata através deste artefato e do manifesto de máquina `docs/project/IC-01-MANIFEST.json`.

---

## 4. Escopo e Módulos Consolidados no IC-01

O Integration Checkpoint `IC-01` agrega os seguintes subsistemas funcionais:

### A. Iteração 2.7 — Runner Hermético e Infraestrutura de Teste
- `scripts/test-db-runner.ts`: orquestrador de bancos Postgres isolados e efêmeros por execução de teste.
- `packages/database/src/test-support.ts`: sanitização e helpers de migração hermética.

### B. Iteração 3 — Design System e Aplicação Web Vite
- `packages/ui/*`: Biblioteca canônica de componentes acessíveis (WCAG 2.2 AA), tokens de design (cores, tipografia, espaçamento), `AppShell`, `Dialog`, `Drawer`, `Badge`, `Button`, `Input`, `Alert`, `EmptyState` e `LoadingState`.
- `apps/web/*`: Aplicação Web Vite com roteamento de páginas (Cockpit, Contatos, Campanhas, Catálogo, Configurações), integração de sessão e dev lab.

### C. Fase CH — Motor de Mensageria e Conectividade de Canais
- **CH-00:** Modelos mínimos de `Contact`, `CommercialThread` e `Message` sob schemas Zod e TypeScript (`packages/contracts`, `packages/database/src/messaging.ts`).
- **CH-01:** RLS fail-closed na role `sos_worker_user`, isolamento de fila e saneamento do teto de retry na Migration 005.
- **CH-02:** Concorrência distribuída multi-worker com `SKIP LOCKED`, validação pre-send fencing e cancelamento em voo por `AbortController`.
- **CH-03:** Reconciliação resiliente, auto-reconciliação de late webhooks e poller `reconcileBatch`.
- **CH-04:** Perímetro de ingresso público seguro (Fastify raw body 512KB, HMAC Meta WABA, tokens WAHA e criptografia AES-256-GCM sob `sos_ingress_user`).
- **CH-05:** Rate limiting distribuído com script Lua sliding window no Redis, fallback in-memory e proteção anti-spoofing via CIDRs confiáveis.
- **CH-06:** Keyring E2E versionado com rotação zero-downtime e processamento de lotes mistos v1/v2 no worker.
- **CH-07:** SSRF guard perimétrico estrito (bloqueio de CGNAT, Benchmarking, IPv6 translation, metadados de nuvem e IP formats ofuscados) e streaming de download seguro de mídia com validação de magic bytes.
- **CH-08:** Adaptador `MetaWabaAdapter` operacional com validação de janela 24h, templates multilíngues, getMediaUrl seguro e normalização de mensagens interativas.
- **CH-09:** Adaptador `WahaAdapter` operacional com gestão de ciclo de vida de sessão, parsing robusto de QR Code em leitura única de body (`ArrayBuffer`), teto de 512KB, roteamento para endpoints dedicados e SSRF guard perimétrico.

### D. Governança e Quality Gates
- `scripts/ci-gate-runner.ts` / `pnpm ci:gate`: Executor unificado dos 6 quality gates locais com validação contínua e fail-closed.
- `docs/project/*` e `docs/work-packages/*`: Governança canônica completa e 16 manifestos de evidência.

---

## 5. Estratégia Adotada para Rastreabilidade do CH-09

Para suprir a ausência de atomicidade pura no commit `9577e17`, o pacote CH-09 passa a ser rastreado através de uma tripla âncora:
1. **Âncora de Integração:** O commit `9577e17` (IC-01) serve como âncora de integridade estrutural e execução de testes.
2. **Digest de Conteúdo Escopado (`scoped-digest-v1`):** O manifesto `docs/work-packages/CH-09-EVIDENCE.json` registra os hashes SHA-256 individuais e o digest composto determinístico (`f1227d2ae0015ced5e9a9af3a18abe7af5fccd9d1720bc1cc34bbb336fb262e5`) dos 6 arquivos funcionais de código, testes e infraestrutura sob ownership estrito do CH-09, mantendo os documentos de governança (`CH-09-WAHA.md` e `CH-09-EVIDENCE.json`) versionados e auditáveis no Git sem dependência autorreferente circular.
3. **Auditoria Independente Materializada:** O artefato `docs/audits/ch-09/INDEPENDENT_REVIEW.md` documenta a revisão cirúrgica do código do CH-09 realizada por um agente independente.

---

## 6. Regra Operacional Mandatória para os Próximos Pacotes

A partir do pacote **CH-10**:
1. **PROIBIÇÃO DE `git add -A`:** É terminantemente proibido o uso de `git add -A`, `git add .` ou equivalentes cegos para a criação de commits de pacote.
2. **STAGING CIRÚRGICO:** Todo commit de pacote deve ser realizado especificando nominalmente cada arquivo sob ownership (`git add path/to/file1 path/to/file2`).
3. **CHECKPOINT ATÔMICO:** O commit de entrega do pacote deve conter exclusivamente os arquivos de implementação, testes específicos e o manifesto do pacote. Documentos de governança global podem ser atualizados em commit separado ou no mesmo commit delimitado.
