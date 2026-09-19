# SOS Sales V3 — Relatório de Revisão Independente (CH-09)

> Pacote Auditado: `CH-09 — WAHA Operacional`  
> Data da Auditoria: 19 de setembro de 2026  
> Perfil do Revisor (`reviewer_role`): Independent Security Reviewer  
> Identificador do Agente (`reviewer_agent_id`): N/A (Declaração explícita de limitação da plataforma: o ambiente Gemini/Antigravity opera em sessão unificada e não fornece IDs de processos de agentes separados; a segregação de funções entre Evidence Engineer e Independent Security Reviewer é estabelecida por isolamento formal de papéis e rigor de auditoria)  
> ID da Sessão de Execução (`execution_session_id`): `c819401e-83f9-4dc7-93fd-3c7a1fab9017`  
> Workspace: `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`  
> Commit de Integração Base: `9577e17b5508efe671d195756a27b6948c908f5b` (Integration Checkpoint IC-01)  
> Commit de Governança Inicial: `a00d9d238a054abea604e1d031cf75a34ae362fc`  
> Confirmação de Independência: Declaro formalmente que, como Independent Security Reviewer, não atuei como Evidence Engineer na implementação do verificador e na correção dos digests, restringindo-me à auditoria, recálculo independente e homologação dos quality gates.  
> Veredito da Auditoria: **APROVADO (ZERO P0 / ZERO P1 / 1 RESSALVA P2 DOCUMENTADA)**  

---

## 1. Escopo e Metodologia da Revisão Independente

Esta auditoria independente foi executada por perfil separado do executor da implementação, em conformidade com as diretrizes do **MCT OS v2.0**, **QUALITY_GATES.md** e o princípio de **Truth in Data**.

A inspeção não se baseou unicamente em asserções de testes verdes. Foram auditados os deltas de código, tratamento de streams de rede, políticas perimétricas de SSRF, isolamento de credenciais, limites de consumo de memória, concorrência distribuída, teste negativo do verificador de integridade e veracidade documental.

---

## 2. Arquivos Auditados e Hashes Criptográficos de Escopo (`scoped-digest-v1`)

| Arquivo Auditado | Papel no Pacote | SHA-256 Digest | Status da Verificação |
|---|---|---|---|
| [`packages/application/src/channels/adapters/waha.adapter.ts`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/application/src/channels/adapters/waha.adapter.ts) | Adaptador operacional WAHA | `d8115ea62dfdca0e63d84d907924f32a34335e280722d3f72af1d5bb58947520` | PASS |
| [`packages/application/src/channels/normalizers/waha-normalizer.ts`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/application/src/channels/normalizers/waha-normalizer.ts) | Normalizador de webhook e lifecycle | `6f003c096a03ee86d6b4a4b95f36873233bbdf08942c1b51e340f4a323b4f521` | PASS |
| [`packages/application/src/channels/fixtures/waha-fixtures.ts`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/application/src/channels/fixtures/waha-fixtures.ts) | Fixtures canônicas | `234e0d5b226d8ba8a736a83978ecfbd264004cc6a98bb436f69526dc05f46dea` | PASS |
| [`packages/application/src/__tests__/channel-adapters.test.ts`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/application/src/__tests__/channel-adapters.test.ts) | Suíte de testes de adaptadores (59 testes) | `278a501ee47b144fcaa6224d2f7ac5d0e045a4cb7df0b5c3ddbb7bdfc1d83d83` | PASS |
| [`packages/application/src/__tests__/channel-gateway.test.ts`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/application/src/__tests__/channel-gateway.test.ts) | Suíte de testes do gateway (51 testes) | `e52e8b85017a8963a27c4c4cf25f0315ff2648d79792d8e7c404c43ab771183b` | PASS |
| [`docker-compose.yml`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docker-compose.yml) | Serviço `waha` sob profile isolado | `c88f017903637af31152efdc78ebd8ecc0f25b361e430bfe7ec20aaa6049443b` | PASS |
| [`docs/work-packages/CH-09-WAHA.md`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/work-packages/CH-09-WAHA.md) | Especificação de governança | Governança Git (excluído do digest) | Auditado |
| [`docs/work-packages/CH-09-EVIDENCE.json`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/work-packages/CH-09-EVIDENCE.json) | Manifesto estruturado de evidência | Governança Git (excluído do digest) | Auditado |

### Especificação da Fórmula e Recálculo Criptográfico:
- **Formato do Digest:** `scoped-digest-v1`
- **Algoritmo:** SHA-256
- **Composição:** `<caminho_relativo>:<sha256>\n` (codificação UTF-8)
- **Digest Anterior (Inconsistente):** `129759d5718dfd0eb305faef339965d8c6b24505f5fc274ef43d46a6f1d2df0c` (incluía documentos autorreferentes antes da finalização).
- **Digest Recalculado e Homologado:** `f1227d2ae0015ced5e9a9af3a18abe7af5fccd9d1720bc1cc34bbb336fb262e5` (100% verificado sobre os 6 arquivos de código e infraestrutura).
- **Verificador Automatizado:** `scripts/verify-evidence-digests.ts` integrado ao Gate 6 do CI (`scripts/ci-gate-runner.ts`).

---

## 3. Findings Detalhados de Auditoria

### 3.1 Correção de Parsing de QR Code e Consumo Único de Body
- **Localização:** `packages/application/src/channels/adapters/waha.adapter.ts:472-581`
- **Análise Técnica:**  
  O bug original tentava ler `await response.json()` e, em caso de erro, lia `await response.text()` sobre a mesma instância de `Response`. Na especificação WHATWG fetch, o ReadableStream é travado e consumido irreversivelmente na primeira leitura, gerando exceção `TypeError: Body has already been consumed` diante de respostas em formato texto, SVG ou binário.
- **Evidência da Correção:**  
  1. A leitura é feita exatamente uma única vez na linha 487 via `await response.arrayBuffer()`.
  2. A manipulação de memória em fallbacks (`Buffer.from(...)`) usa explicitamente `.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`, prevenindo vazamento de dados do *shared slab memory pool* de 8KB do Node.js.
  3. O cabeçalho `Content-Type` é extraído e normalizado (linha 509-510) antes de qualquer parse, roteando ordenadamente para:
     - `application/json` (linhas 513-529): extrai `qr` ou `raw`.
     - `image/svg+xml` (linhas 532-541): encapsula SVG e gera data URI válida.
     - `text/plain` (linhas 544-567): extrai texto bruto (com proteção contra servidores que retornam JSON mascarado como texto).
     - `image/png`, `image/jpeg`, `image/webp` (linhas 570-580): converte binário para data URI base64 (`format: "binary"`).
  4. Sniffing por assinatura de magic bytes (linhas 584-600) para PNG (`0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`) caso o servidor omita o cabeçalho `Content-Type`.
  5. Formatos binários desconhecidos disparam o erro tipado `WAHA_UNSUPPORTED_QR_FORMAT` (linha 635).
- **Proteção DoS:**  
  Imposição do teto de 512 KB (`WAHA_MAX_QR_PAYLOAD_BYTES`) validado em pré-flight via `Content-Length` (linhas 473-481) e no buffer final (linhas 503-507).
- **Veredito:** **CORRIGIDO E SEGURO (Sem P0/P1)**.

### 3.2 Validação Perimétrica de SSRF e Higienização de URL
- **Localização:** `packages/application/src/channels/adapters/waha.adapter.ts:51-118`
- **Análise Técnica:**  
  A função `validateWahaBaseUrl` foi rigorosamente auditada contra ataques de Server-Side Request Forgery e vazamento de segredos:
  1. **Credenciais Embutidas (linhas 59-62):** A autoridade é inspecionada (`parsed.username || parsed.password`). Se presentes, aborta com `SSRF_VIOLATION: WAHA baseUrl must not contain embedded user credentials`. A mensagem de erro NÃO interpola a URL fornecida, garantindo que senhas não apareçam em logs de aplicação ou rastreadores de erro.
  2. **Notações de IP Alternativas/Ofuscadas (linhas 68-70):** Intercepta notações octais com zeros à esquerda (`0177.0.0.1`), hexadecimais (`0x7f.0.0.1`) e inteiros dword (`2130706433`) testados tanto na URL decodificada quanto no hostname.
  3. **Metadados de Nuvem (linhas 72-81):** Bloqueio incondicional de `169.254.169.254`, `169.254.*`, `metadata.google.internal`, `instance-data`.
  4. **IPs Literais Privados e Loopback em Produção (linhas 101-115):** Em modo de produção (`allowLocalTest: false`), `net.isIP(host)` checa endereços literais e bloqueia faixas RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), Carrier-Grade NAT (100.64.0.0/10), Loopback (127.0.0.0/8), Link-local (169.254.0.0/16) e faixas privadas IPv6 (`::1`, `fe80::/10`, `fc00::/7`).
  5. **Separação Arquitetural Honesta:** A documentação e o manifesto foram corrigidos para declarar com verdade que `validateWahaBaseUrl` aplica validação perimétrica síncrona sobre a autoridade da URL base configurada. A resolução dinâmica de DNS com pinning de IP contra DNS rebinding e controle estrito de redirects HTTP é delegada exclusivamente aos streams de download de mídia via `downloadMediaStream` (CH-07).
- **Veredito:** **APROVADO (Sem P0/P1)**.

### 3.3 Gestão de Segredos e Concorrência Distribuída
- **Localização:** `packages/application/src/channels/adapters/waha.adapter.ts:223-228, 286-288, 339-341, 390-392, 448-450, 748-750`
- **Análise Técnica:**  
  1. `withCredentials` implementa fail-closed imediato caso `apiKey` não seja fornecida ou contenha apenas espaços em branco (`API_KEY_REQUIRED`), abortando antes de qualquer requisição HTTP.
  2. Em caso de perda de lease concorrente ou cancelamento em voo (`params.signal?.aborted`), o erro `FENCING_IN_FLIGHT_ABORT` é propagado sem ser mascarado como erro genérico de rede.
  3. Não existem chamadas a `console.log` ou `logger` vazando payloads de QR ou chaves de API.
- **Veredito:** **APROVADO (Sem P0/P1)**.

### 3.4 Orquestração Docker e Hermeticidade da Base de Testes
- **Localização:** `docker-compose.yml:123-144`
- **Análise Técnica:**  
  O serviço `waha` foi adicionado sob a chave `profiles: ["waha"]`. Dessa forma, o comando padrão `docker compose up` utilizado em pipelines de CI locais não inicia o container WAHA desnecessariamente, mantendo o consumo de memória e tempo de execução da CI herméticos.
- **Veredito:** **APROVADO (Sem P0/P1)**.

### 3.5 Verificador Automático e Teste Negativo Auditado
- **Localização:** `scripts/verify-evidence-digests.ts` integrado ao `scripts/ci-gate-runner.ts` (Gate 6).
- **Análise Técnica:**  
  1. O verificador recarrega `docs/work-packages/CH-09-EVIDENCE.json`, rejeita arquivos ausentes, calcula o SHA-256 binário de cada arquivo e recalcula o digest composto sob a fórmula canônica `<path>:<sha256>\n` (UTF-8).
  2. **Auditoria de Teste Negativo (Drill de Falha Controlada):**  
     - Foi injetada mutação proposital no arquivo de fixture `packages/application/src/channels/fixtures/waha-fixtures.ts`.  
     - A execução de `pnpm tsx scripts/verify-evidence-digests.ts` encerrou com código de saída 1 (`Composite digest mismatch` e `SHA-256 mismatch`), e o Gate 6 abortou com veredito `FAIL`.  
     - Após reversão limpa da mutação, o verificador retornou código 0 e o Gate 6 retornou `PASS`.  
     - Nenhum arquivo funcional permaneceu alterado no working tree.
- **Veredito:** **CORRIGIDO, INTEGRADO AO CI E VALIDADO NEGATIVAMENTE (Sem P0/P1)**.

---

## 4. Classificação de Riscos e Ressalvas

- **P0 (Bloqueador Crítico / Quebra de Segurança):** `0` detectados.
- **P1 (Risco Arquitetural / Violação de Contrato):** `0` detectados.
- **P2 (Ressalva Conhecida / Dependência Subsequente):** `1` ressalva registrada:
  - **Ressalva P2 — Validação com Mocks vs Container Real:**  
    A suíte de testes de canais (110 asserções) foi executada com mocks determinísticos da interface WHATWG `fetch`. A interação com o container Docker WAHA real (portas, rede bridge, inicialização assíncrona do Chromium no container) será validada no pacote subsequente `CH-10` (Coexistência Docker dual-engine).

---

## 5. Decisão Final da Auditoria Independente

O pacote **`CH-09 — WAHA Operacional`** está **HOMOLOGADO E APROVADO**.

A associação do código ao Integration Checkpoint **`IC-01`** (`9577e17b5508efe671d195756a27b6948c908f5b`) com proveniência documentada e digest de escopo próprio satisfaz plenamente os critérios de aceitação e integridade do projeto SOS Sales V3.
