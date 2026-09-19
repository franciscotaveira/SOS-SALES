# Risk Register

| ID | Causa → evento → impacto | Prob. | Sev. | Gatilho | Mitigação | Contingência | Owner | Revisão | Evidência | Estado |
|---|---|---:|---:|---|---|---|---|---|---|---|
| R-001 | Mudanças sem checkpoint → 2.7/3/4 se misturam → perda de rastreabilidade | Alta | P0 | diff não atribuível | G-00..G-05 | restaurar snapshot e reconstruir | Tech Lead | diária | EV-G00/G01 | OPEN |
| R-002 | Testes autorreferentes → falso aceite → falha chega ao piloto | Média | P0 | relatório sem prova independente | reviewer separado e matriz | reabrir pacote | QA Lead | por gate | manifest do pacote | OPEN |
| R-003 | Contexto tenant ausente → worker acessa outro tenant → violação de dados | Média | P0 | teste negativo ou log de claim | claim mínimo + transação tenant | bloquear worker | Data/Security | por pacote CH | AC-SEC-001 | OPEN |
| R-004 | Crash/lease/5xx ambíguo → envio duplica ou se perde → dano ao cliente | Alta | P0 | item sem terminal ou provider ambíguo | inbox/outbox, fencing e reconciliação | desligar outbound | Messaging | diária em piloto | AC-CH-001/002/003 | OPEN |
| R-005 | Logger/parser expõe token → segredo vaza → comprometimento | Média | P0 | detector/redaction falha | serializer e testes de stream | rotação e purge | Security | por release | AC-SEC-002 | OPEN |
| R-006 | URL/DNS/redirect malicioso → SSRF → acesso interno | Média | P0 | fixture SSRF alcança adapter | allowlist e proxy seguro | bloquear mídia externa | Channel | por release | teste CH-07 | OPEN |
| R-007 | API externa muda → contrato diverge → canal falha | Alta | P1 | schema/versão nova | fixtures versionadas e contrato oficial | feature flag/provider off | Integrations | semanal | contract suite | OPEN |
| R-008 | Cutover incorreto → V2 e V3 escrevem → duplicidade/corrupção | Baixa | P0 | dois writers detectados | writer único e shadow passivo | rollback de tráfego | SRE | cada cutover | MIG-04/06 | OPEN |
| R-009 | Mapeamento incorreto → migração diverge → histórico inconsistente | Média | P0 | contagem/checksum difere | dry-run e relatório | voltar V2 read/write | Migration | cada dry-run | MIG-03/05 | OPEN |
| R-010 | Rollback não ensaiado → incidente sem reversão rápida → indisponibilidade | Média | P0 | rehearsal falha | rehearsal antes do piloto | abortar cutover | SRE | pré-piloto | OPS-R03/04 | OPEN |
| R-011 | App review/eligibilidade pendente → Meta bloqueia fluxo → onboarding incompleto | Alta | P1 | EXT-02/03 sem aprovação | board externo e homologação | bloqueio honesto do WABA | Meta Lead | semanal | prova oficial externa | OPEN |
| R-012 | Métricas ausentes → degradação não alerta → backlog e perda de SLA | Média | P1 | fila degrada sem alerta | métricas, traces e SLO | operação manual/runbook | SRE | por gate | OPS-F01/04 | OPEN |
| R-013 | Escopo sem gate → MVP cresce → atraso e baixa qualidade | Média | P1 | item fora do charter | CEO gate e non-goals | deferir pós-MVP | Product | semanal | decisão no board | OPEN |
| R-014 | Defaults de lab → credencial chega à release → incidente de segurança | Baixa | P0 | preflight encontra segredo/default | preflight fail-closed | bloquear imagem | DevOps | cada release | G7/SBOM/scan | OPEN |
| R-015 | Tool não autorizada → IA executa ação indevida → dano comercial | Média | P0 | eval viola política | allowlist, approval e evals | desligar IA por flag | AI/Safety | por pacote AI | AI-08/10 | PLANNED |

## Regra de manutenção

Todo risco precisa de causa, evento, impacto, probabilidade, owner, mitigação, trigger, contingência, estado, data de revisão e evidência. Risco P0 aberto impede avanço ao próximo gate de release.
