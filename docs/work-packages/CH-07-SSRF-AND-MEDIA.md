# CH-07 — SSRF Guard e Download Seguro de Mídia

> Nome do arquivo: `CH-07-SSRF-AND-MEDIA.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Motor de Comunicação (Fase CH)
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente SRE & Security Independente
- **Dependências:** `CH-00` (Modelos Mínimos), `CH-01` (RLS Fail-Closed), `CH-02` (Fencing Concorrente), `CH-03` (Reconciliação e Resiliência), `CH-04` (Ingress Seguro), `CH-05` (Rate Limiting Distribuído), `CH-06` (Keyring E2E)
- **ADRs Vinculadas:** ADR-002 (Auth Strategy & Tenancy), ADR-005 (Channel Gateway & Inbox/Outbox)
- **Roadmap Gate:** `| CH-07 | SSRF e mídia segura | CH-04 | DNS, redirect, IP, mídia e allowlist |`
- **Risco Mitigado:** `R-006` (URL/DNS/redirect malicioso → SSRF → acesso interno)

---

## Objetivo único

Implementar a governança perimetral contra **Server-Side Request Forgery (SSRF)** e o mecanismo de **Download Seguro de Mídia em Streaming** com teto de tamanho estrito, validação de MIME type e verificação de *magic bytes* (assinatura de arquivos), mitigando riscos de acesso indevido à rede interna/metadata, exaustão de recursos de memória (zip/decompression bombs) e ataques de poliglota / MIME-confusion no ecossistema SOS Sales V3:

1. **Defesa em Profundidade contra SSRF (`ssrf-guard.ts`):**
   - Bloqueio irrestrito de faixas de IP IPv4 e IPv6 privadas, de loopback, link-local, multicast, documentação e experimentais:
     - IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (Carrier-Grade NAT RFC 6598), `127.0.0.0/8`, `169.254.0.0/16` (Metadata / Link-local), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15` (Benchmarking RFC 2544), `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4` e broadcast `255.255.255.255`.
     - IPv6: `::1`, `::`, `fc00::/7` (Unique Local), `fe80::/10` (Link-Local), `ff00::/8` (Multicast), `::ffff:0:0/96` (IPv4-mapped), `64:ff9b::/96` (IPv4/IPv6 translation), `2001:db8::/32` (Documentation) e `2001:20::/28` (ORCHIDv2).
   - Detecção de notações alternativas de IP: decimais puros (`2130706433`), hexadecimais (`0x7f000001`), octais com zeros à esquerda (`0177.0.0.1`), codificações URL mistas (`%30%78...`) e notações de menos de 4 octetos (`127.1`).
   - Bloqueio explícito a serviços de metadata de nuvem (`169.254.169.254`, `metadata.google.internal`, `instance-data`).
   - Resolução DNS obrigatória (`dns.promises.lookup` com `{ all: true }`) validando cada endereço A/AAAA retornado antes de autorizar a conexão externa.
   - Re-validação de cada salto de redirecionamento HTTP 3xx (até `maxRedirects = 3`), impedindo ataques de open redirect em direção a serviços locais ou cloud metadata.
   - Enforçamento de protocolo estrito: `https:` obrigatório em produção, autorizando `http:` somente sob `allowLocalTest: true` explícito ou inclusão em `allowedInternalHosts`.
   - Remoção de checagens implícitas de ambiente (`NODE_ENV === "test"`) nos adaptadores (`WahaAdapter`).

2. **Downloader Seguro de Mídia em Streaming (`safe-media-downloader.ts`):**
   - `downloadMediaStream(url, options)` e `downloadMediaToStream(url, destinationStream, options)`.
   - **Pre-check de Cabeçalho:** Rejeição imediata antes do download do corpo se o cabeçalho `Content-Length` exceder `maxSizeBytes` (default 16 MB).
   - **Consumo em Streaming com Cancelamento Atômico:** Leitura incremental com contador de bytes lidos; caso exceda `maxSizeBytes`, aciona `reader.cancel()` destruindo o socket imediatamente e lança exceção tipada `MEDIA_SIZE_LIMIT_EXCEEDED` sem onerar a memória do nó.
   - **Allowlist de Tipos MIME:** Restrito aos tipos canônicos de WhatsApp (JPEG, PNG, WebP, GIF, MP3, OGG, MP4, 3GPP, PDF, DOCX, XLSX, TXT, CSV).
   - **Inspeção de Assinatura de Arquivo (Magic Bytes):** Avaliação dos primeiros bytes para bloquear binários executáveis (`MZ` do Windows PE, `\x7fELF` do Linux) e scripts/HTML (`<!DOCTYPE html>`, `<script`, `<svg` malicioso), além de validar a consistência com o MIME type declarado.
   - **Digest SHA-256 Incremental:** Cálculo em tempo real do hash criptográfico SHA-256 via streaming com `crypto.createHash("sha256")`.

---

## Fora do escopo

- Transcodificação de codecs de áudio/vídeo (FFmpeg / GStreamer);
- Upload direto para buckets S3/Cloud Storage (escopo da integração de storage do CRM);
- Reconhecimento óptico de caracteres (OCR) ou moderação de conteúdo visual via IA.

---

## Arquivos sob ownership

1. `packages/application/src/channels/security/ssrf-guard.ts` (expansão de faixas RFC 6598/2544, IPv6 translation, notações alternativas e suporte a fetchFn/timeoutMs)
2. `packages/application/src/channels/security/safe-media-downloader.ts` (implementação do downloader em streaming com size cap, MIME allowlist, magic bytes e SHA-256)
3. `packages/application/src/channels/adapters/waha.adapter.ts` (remoção de fallback de NODE_ENV em favor de allowLocalTest explícito)
4. `packages/application/src/index.ts` (exportação canônica de interfaces e utilitários de mídia segura)
5. `packages/application/src/__tests__/http-operational-security.test.ts` (26 testes herméticos cobrindo servidor HTTP real, SSRF, streaming abort e magic bytes)
6. `docs/work-packages/CH-07-SSRF-AND-MEDIA.md` (especificação canônica deste pacote)
7. `docs/work-packages/CH-07-EVIDENCE.json` (manifesto canônico de evidência `EV-CH07-001`)

---

## Fatos confirmados

- `[KNOWN]` Redes Carrier-Grade NAT (`100.64.0.0/10`) são comumente utilizadas por provedores de nuvem e VPNs internas (Tailscale, AWS VPC peering); bloqueá-las previne pivotamento de ataques para redes de gestão do cluster.
- `[KNOWN]` Ataques de exaustão de memória via download de mídia podem ser deflagrados por streams lentos ou descompactação infinita; abortar a conexão no primeiro byte além do limite de cota protege os workers contra quedas de OOM (Out-Of-Memory).
- `[KNOWN]` Servidores web vulneráveis a MIME-confusion podem servir scripts executáveis disfarçados com extensão `.jpg` ou `.png`; inspecionar assinaturas de cabeçalho binário (magic bytes) invalida payloads maliciosos antes do processamento.

---

## Invariantes

1. **Fail-Closed on Blocked IP:** Qualquer requisição cujos endereços resolvidos em DNS contenham ao menos um IP restrito ou de metadados deve ser abortada antes do envio do handshake HTTP.
2. **Deterministic Stream Cancellation:** Ao ultrapassar `maxSizeBytes`, o stream de recepção é destruído com `reader.cancel()` imediatamente.
3. **No Ambient Test Mode Bypass:** O acesso a hosts locais de teste exige `allowLocalTest: true` explícito, sendo terminantemente vedado o uso de `process.env.NODE_ENV === "test"` como bypass implícito.
4. **Binary Signature Authenticity:** Mídias cujo cabeçalho binário viole o MIME type declarado ou contenham assinaturas de executáveis/scripts devem ser rejeitadas com erro explícito.

---

## Critérios de aceitação

- [x] **AC-CH07-001:** `isBlockedIpv4` e `isBlockedIpv6` contemplam todas as faixas reservadas (CGNAT, Benchmarking, IPv6 translation, documentation) e `hasAlternativeIpFormat` detecta variações sem falsos positivos.
- [x] **AC-CH07-002:** `safeFetchWithSsrfGuard` valida re-redirecionamentos HTTP 3xx e bloqueia qualquer salto para loopback ou cloud metadata.
- [x] **AC-CH07-003:** `downloadMediaStream` e `downloadMediaToStream` executam download seguro com teto de tamanho rígido (`maxSizeBytes`), cancelamento atômico de stream e cálculo SHA-256.
- [x] **AC-CH07-004:** `verifyMediaMagicBytes` valida formatos legítimos (JPEG, PNG, GIF, WebP, PDF, OGG, MP4, MP3) e bloqueia scripts HTML e binários executáveis (`MZ`, `\x7fELF`).
- [x] **AC-CH07-005:** `WahaAdapter` não possui checagens implícitas de `NODE_ENV === "test"`.
- [x] **AC-CH07-006:** Suíte hermética `http-operational-security.test.ts` (26 testes) e o pipeline completo `pnpm ci:gate` (6 gates) aprovados com 100% de sucesso.
