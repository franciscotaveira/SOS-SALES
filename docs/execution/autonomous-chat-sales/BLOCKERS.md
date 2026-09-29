# BLOCKERS.md — Registro de Bloqueadores e Riscos

> **Regra do Contrato:** Registro de bloqueios internos, externos e itens delimitados fora do escopo.

---

## 1. Bloqueadores Internos Ativos (Prioridade de Execução)

| ID | Descrição | Gravidade | Milestone Associado | Ação Resolutiva |
| :--- | :--- | :---: | :---: | :--- |
| **B-01** | `scripts/verify-e1-trust-browser.mjs` continha `gerarimport` e falhava no syntax check | `P2` | `M0` | **RESOLVIDO:** Syntax check validado com exit code 0. |
| **B-02** | `decideSuggestion` permite sobrescrever estado terminal (`accepted`, `dismissed`, `expired`, `invalidated`) | `P0` | `M1` | **EM ANDAMENTO:** Verificar estado terminal e versão imediatamente após lock; proteger `persistSuggestionRejection` com `WHERE status = 'pending' AND state_version = $expected`. |
| **B-03** | Replay idempotente na criação falha com `CANDIDATE_STALE` se mensagem nova chegar pós-criação | `P0` | `M1` | **EM ANDAMENTO:** Consultar idempotência antes das validações de governança e revalidação de fatos da thread. |
| **B-04** | Ausência da tabela e repositório de Próxima Ação Comercial (E2) | `P1` | `M5` | Implementar `commercial_actions`, migration 020 e vínculo atômico no aceite de sugestões. |

---

## 2. Bloqueios Externos Legítimos (`BLOCKED_EXTERNAL`)

Os seguintes itens dependem de fatores do mundo físico ou ambientes de produção e permanecem documentados sem impedir o avanço no Docker Lab local:

1. **Aparelho Físico e Leitura de QR Code Real:** Pareamento WAHA/Evolution com chip GSM real requer operador humano com aparelho em mãos. Validado localmente com mock/adapter local.
2. **Envio de Mensagens Reais via Meta WABA:** Disparo para telefones externos reais consome saldo e depende de aprovação prévia de templates na Meta Business Manager.
3. **Deploy VPS / Produção:** Acesso e promoção para o VPS de produção requerem janelas operacionais controladas e autorização humana explícita.
4. **Desativação Permanente da V2:** Cutover final da Haven depende de homologação humana durante o piloto.
