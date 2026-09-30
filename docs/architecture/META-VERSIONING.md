# Política e Governança de Versionamento Meta Graph API & Conversions API

> SOS Sales V3 — Conversions API (CAPI) for WhatsApp Business Messaging  
> Data da Verificação: 2026-09-29  
> Ciclo de Revisão: A cada 60 dias (Próxima revisão obrigatória: até 2026-11-28)

---

## 1. Diretrizes de Versionamento Ativas

| Parâmetro | Configuração Governada | Justificativa |
|---|---|---|
| **Versão Graph API Padrão** | `v26.0` | Versão ativa da família Graph API e Meta Business SDK. |
| **Versões Permitidas (Allowlist)** | `["v25.0", "v26.0"]` | Versões estáveis e suportadas sem risco imediato de depreciação. |
| **Versão Anterior Encontrada** | `v21.0` (hardcoded) | Depreciada/em janela de encerramento iminente (previsto para janeiro de 2027). |
| **Motivo da Atualização** | Proximidade da depreciação da Graph API v21.0 e evolução de contratos nos SDKs oficiais da Meta. |
| **Código de Erro Canônico** | `CAPI_GRAPH_VERSION_INVALID` | Qualquer versão fora da allowlist falha fechada com status `FAILED`, zero chamadas HTTP e sanitização de logs. |

---

## 2. Fontes Oficiais Meta Consultadas

1. **Meta for Developers — Graph API Changelog & Versioning:**
   - URL: `https://developers.facebook.com/docs/graph-api/changelog/`
   - Data da Consulta: 2026-09-29
2. **Meta for Developers — Conversions API for Business Messaging (WhatsApp):**
   - URL: `https://developers.facebook.com/docs/marketing-api/conversions-api/guides/business-messaging/`
   - Data da Consulta: 2026-09-29
3. **Meta Business SDK Releases:**
   - Repositório Oficial: `facebook/facebook-nodejs-business-sdk` e releases Graph API v25/v26
   - Data da Consulta: 2026-09-29

---

## 3. Arquitetura de Resolução da Versão no SOS Sales V3

A versão da Graph API nunca é interpolada diretamente a partir de entradas não confiáveis e não reside em constantes fixas sem política de governança.

A resolução ocorre através da função pura:

```ts
resolveGraphApiVersion(configuredVersion?: string): GraphApiVersionResult
```

### Regras de Precedência:
1. `options.graphApiVersion` (injetado via runtime/dispatcher options).
2. `process.env.META_GRAPH_API_VERSION` (variável de ambiente de infraestrutura).
3. Padrão imutável: `"v26.0"`.

### Comportamento em Caso de Violação:
Se a versão resolvida não constar exatamente em `["v25.0", "v26.0"]`:
- Retorna `{ error: "CAPI_GRAPH_VERSION_INVALID" }`.
- O dispatcher marca o evento como `FAILED` com `error_message = 'CAPI_GRAPH_VERSION_INVALID'`.
- Nenhuma chamada HTTP é realizada (zero rede).
- A URL final nunca é construída com o valor malicioso/inválido.
- O valor inválido nunca é impresso em logs, garantindo proteção contra log injection e SSRF.
