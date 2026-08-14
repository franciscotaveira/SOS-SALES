# SOS Sales — Contratos de API v1

## 1. Sessão & Workspaces

### `GET /api/v1/me`
Retorna o perfil do operador autenticado e permissões.
- **Headers**: `Authorization: Bearer <token>`
- **Response 200**:
```json
{
  "id": "usr_01H...",
  "email": "operador@empresa.com",
  "name": "Carlos Operador",
  "role": "operator",
  "workspaces": [
    { "id": "ws-escovaria", "name": "Haven Escovaria", "role": "operator" },
    { "id": "ws-peliculas", "name": "Titanium Películas", "role": "owner" }
  ]
}
```

---

## 2. Fila de Prioridades & Conversas

### `GET /api/v1/workspaces/:workspaceId/priorities`
Lista atendimentos urgentes classificados pelo motor de SLA comercial.
- **Query Params**: `limit=10`, `cursor=...`
- **Response 200**:
```json
{
  "items": [
    {
      "journeyId": "j-esc-01",
      "leadName": "Camila Ferreira",
      "leadPhone": "+55 11 99345-8812",
      "urgencyReason": "Lead pediu encaixe urgente para sábado antes do evento",
      "slaDeadline": "2026-08-14T15:32:00Z",
      "slaStatus": "critical",
      "slaMinutesRemaining": 2,
      "acquisitionSource": "ctwa",
      "campaignName": "CTWA_SABADO_ESCOVA_59",
      "unreadCount": 2,
      "assignedOperatorId": null
    }
  ],
  "nextCursor": null
}
```

---

## 3. Dossiê & Mensagens da Jornada

### `GET /api/v1/journeys/:journeyId`
Dossiê completo com dados de anúncio, fatos confirmados e histórico.
- **Response 200**:
```json
{
  "id": "j-esc-01",
  "workspaceId": "ws-escovaria",
  "leadName": "Camila Ferreira",
  "leadPhone": "+55 11 99345-8812",
  "leadCity": "São Paulo - Jardins",
  "stage": "new",
  "estimatedDealValueBrl": 118.0,
  "handoffStatus": "pending_operator",
  "acquisition": {
    "source": "ctwa",
    "campaignName": "CTWA_SABADO_ESCOVA_59",
    "adCreative": "Vídeo Escova Express 25min",
    "referralOffer": "Escova + Hidratação R$ 118",
    "entryTimestamp": "2026-08-14T11:45:00Z",
    "attributedCostBrl": 8.5
  },
  "knownFacts": [
    {
      "id": "f-1",
      "namespace": "horario",
      "label": "Horário Desejado",
      "value": "Sábado às 14h00",
      "confidence": "CONFIRMED",
      "evidence": ["Queria ver se tem horário nesse sábado por volta das 14h"]
    }
  ]
}
```

---

## 4. Handoff Operacional

### `POST /api/v1/handoffs/:handoffId/claim`
Assunção atômica de lead pelo operador. Retorna 409 se outro operador já assumiu.
- **Body**: `{}`
- **Response 200**: Objeto `Journey` atualizado com `assignedOperatorId`.
- **Response 409**:
```json
{
  "error": {
    "code": "HANDOFF_ALREADY_CLAIMED",
    "message": "Este atendimento acabou de ser assumido por outro operador.",
    "requestId": "req_882a1"
  }
}
```

---

## 5. Envio Supervisionado de Mensagens

### `POST /api/v1/journeys/:journeyId/messages`
Envia mensagem de texto via WhatsApp após validação de políticas e canal.
- **Body**:
```json
{
  "text": "Olá Camila! Temos uma vaga sábado às 14h30 para sua Escova Express. Podemos confirmar?",
  "idempotencyKey": "idem_msg_982348",
  "usedRecommendationId": "rec_01"
}
```
- **Response 200**:
```json
{
  "id": "msg_out_01",
  "journeyId": "j-esc-01",
  "sender": "operator",
  "text": "Olá Camila!...",
  "status": "sent",
  "createdAt": "2026-08-14T15:31:00Z"
}
```

---

## 6. Registro de Outcome Comercial

### `POST /api/v1/journeys/:journeyId/outcome`
Registra desfecho comercial (venda ganha, perdida ou agendada).
- **Body**:
```json
{
  "status": "won",
  "dealValueBrl": 149.0,
  "serviceOrProduct": "Escova Modelada + Tratamento Kérastase",
  "reason": "Cliente fechou pacote completo no WhatsApp"
}
```
