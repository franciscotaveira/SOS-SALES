# STATE.md — Diário de Estado e Retomada

> **Missão Autônoma de Remediação Pós-Auditoria — CHAT-SALES**
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*
> **Objetivo:** Executar continuamente a remediação pós-auditoria até produzir uma candidatura honesta e auditável a `VERIFIED_DOCKER_LAB`, sem n8n, sem efeitos externos reais e sem encerrar em diagnóstico parcial.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T09:40:00-03:00
- **SHA Base da Auditoria:** `e55f15e0e327eb1dc0baf6603b82e26d63d329e9`
- **HEAD Auditado:** `5a56c593b07f25abbb29a9f19a579441c4e9653d`
- **Status Canônico da Declaração M10:** `REJECTED_BY_INDEPENDENT_REVIEW`
- **Estado Honesto Atual:**
  `R1_COMPLETED / R2_COMPLETED / R3_COMPLETED / R4_COMPLETED / R5_IN_PROGRESS / R6_NOT_STARTED`
- **Fase Ativa do Ciclo de Remediação:** `Fase R5 — True Docker E2E (P1–P8)`

---

## 2. Diagnóstico da Auditoria Independente (Motivos da Rejeição M10)

1. **Matriz de Aceite:** A matriz canônica mantinha P1, P2, P3 e P5 como `TODO`, e P7 como `IN_PROGRESS`.
2. **Suíte M9:** Usava Fastify em memória (`app.inject`) e SQL direto, não percorrendo Web → API Docker → Worker → Provedor Sintético.
3. **Gate de Lint:** Turbo executava zero tarefas (`0 total, 0 successful`), mas o CI registrava `PASS`.
4. **Evidência Visual:** Scripts e PNGs estavam desvinculados do commit e não eram estritamente fail-closed.
5. **Incidente de Credencial (B-01):** Material literal de credencial Meta em `scripts/seed-haven-waba.ts` (sanitizado localmente; rotação externa pendente).
6. **Segurança e Isolamento (S-01 a S-07):** SSRF em rotas de conexão, estado de canal fictício, auditoria de credenciais, RLS/least privilege do worker, CAPI tenant-safe e concorrência comercial.

---

## 3. Mapa de Fases de Remediação

| Fase | Escopo | Estado |
| :--- | :--- | :---: |
| **Fase 4** | Incidente de credencial: Sanitização fail-closed de `seed-haven-waba.ts` e `.env.example` | `COMPLETED` |
| **Fase R0** | Retratação documental M10, atualização de matrizes, blockers e novo diretório de evidência | `COMPLETED` |
| **Fase R1** | Tornar gates verdadeiros e fail-closed: Lint real (ESLint), Gate 6 multi-manifest e scripts de QA | `COMPLETED` |
| **Fase R2** | Segurança e isolamento: SSRF guard, estado honesto de canal, keyring v1/v2, RLS restrito e CAPI tenant-safe | `COMPLETED` |
| **Fase R3** | Integridade comercial e concorrência: Proposta, outcome, próxima ação e Radar sem race conditions | `COMPLETED` |
| **Fase R4** | Migração e recuperação: Motor sintético V2→V3 com fixture versionada e restore hermético real | `COMPLETED` |
| **Fase R5** | E2E Docker P1–P8 verdadeiro: Web + API + Worker + DB + Redis + Provedor Sintético HTTP | `IN_PROGRESS` |
| **Fase R6** | Reconciliação documental, gates finais seriais e auditoria independente | `TODO` |

---

## 4. Bloqueios Externos Registrados (`BLOCKED_EXTERNAL`)

- `BLOCKED_EXTERNAL: Rotação/revogação de credenciais Meta pelo proprietário` (tokens/secrets expostos no script original antes da sanitização).
- `BLOCKED_EXTERNAL: Pareamento físico de chip GSM / leitura de QR code real com aparelho em mãos`.
- `BLOCKED_EXTERNAL: Envio de mensagens reais pagas e aprovação de templates em produção na Meta`.
- `BLOCKED_EXTERNAL: Migração e cutover físico da base SOS-SALES V2 de produção`.
