# Gates de Prontidão — Piloto Privado

O piloto não é liberado por quantidade de telas, commits ou testes unitários. Cada gate abaixo precisa de evidência datada e de responsável humano.

## G0 — Base local confiável

- [x] Repositório isolado do CRM TX legado.
- [x] Supabase local e Redis usam portas próprias.
- [x] Contrato de fatos imutáveis, RLS e outbox existe no schema.
- [x] Ingestão WAHA simulada possui testes de assinatura, deduplicação e worker.
- [ ] Backup e restore do banco são executados do zero e comparados contra um checksum esperado.

## G1 — Runtime seguro

**Depende de:** P0.3B.

- [ ] Runtime de produção não usa `SET ROLE` nem pool administrativo como identidade de serviço.
- [ ] Segredo é resolvido por provider configurado, falha fechada e não aparece em logs.
- [ ] Health, readiness, logs estruturados e shutdown são validados sob falha de dependência.
- [ ] Configuração de proxy e rate-limit tem contrato testado.

## G2 — Canal real em staging

**Depende de:** P0.3C e uma conta WAHA não produtiva.

- [ ] Um webhook real entra, é assinado e cria exatamente um evento/mensagem por `provider_message_id`.
- [ ] Reenvio do provedor, evento fora de ordem e indisponibilidade temporária são observáveis e recuperáveis.
- [ ] Nenhuma mensagem é enviada pelo sistema sem ação humana explícita.
- [ ] Runbook de desligamento do canal e rotação do segredo foi executado uma vez.

## G3 — Operação humana supervisionada

**Depende de:** P0.4 e P0.5.

- [ ] Operador recebe contexto, origem, fatos e próximo passo sem ler o histórico inteiro.
- [ ] Ação recomendada contém evidência e política aplicada.
- [ ] Preço, agenda, pagamento e resposta fora de política permanecem bloqueados ou exigem aprovação.
- [ ] Timeout de IA ou de worker não bloqueia o handoff humano.
- [ ] Kill switch por workspace e canal foi testado.

## G4 — Prova comercial e experiência mínima

**Depende de:** P0.6 e P0.7.

- [ ] Interface mostra conversa, contexto, responsável, handoff e outcome com estados de loading, vazio e erro.
- [ ] Atribuição mostra fonte, método e grau de confiança; hipótese não aparece como prova.
- [ ] Outcome é idempotente e Meta CAPI, quando habilitada, opera exclusivamente por outbox.
- [ ] Métricas de tempo até resposta, aceite do handoff e aprovação de recomendação são consultáveis.

## G5 — Go / No-Go humano

**Depende de:** G0–G4 completos.

| Decisão | Evidência mínima | Responsável |
|---|---|---|
| Segurança | rotação de segredo, isolamento de workspace e negativo de autorização | owner técnico |
| Dados | backup/restore, retenção e redação de PII | owner técnico |
| Operação | runbook, escalonamento e kill switch exercitados | gestor da operação |
| Comercial | jornada de teste do anúncio ao outcome e relatório auditável | agência/cliente piloto |
| IA | taxa de aprovação, incidentes e limite de autonomia definidos | owner + operador |

**Regra:** qualquer item pendente em G1–G5 resulta em **No-Go**. A exceção precisa estar documentada, ter prazo, owner e mecanismo de contenção.
