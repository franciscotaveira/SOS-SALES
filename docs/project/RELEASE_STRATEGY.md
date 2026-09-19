# Release, Piloto e Migração

## Princípios

- Build once, promote the same digest.
- V2 e V3 coexistem; cutover é por workspace.
- Migration usa expand → backfill → cutover → contract.
- Efeitos externos possuem flags independentes: inbound, outbound, IA e CAPI.
- Shadow ingestion nunca dispara outbound, IA ou CAPI.
- Existe somente um writer ativo para cada efeito.
- Rollback acontece por tráfego e flags, não por down migration destrutiva.

## Ambientes

```text
testes isolados
→ Docker Lab
→ homologação V3
→ shadow
→ Haven canary
→ private beta
→ produção gradual
```

## Haven

| Estágio | Comportamento | Gate |
|---|---|---|
| H0 | synthetic E2E no Lab | CH-12 aceito |
| H1 | shadow 24–72h, sem efeitos | zero divergência crítica |
| H2 | inbound real, outbound desligado | persistência e Cockpit íntegros |
| H3 | equipe interna/allowlist | operação e suporte aprovados |
| H4 | outbound real limitado | zero duplicidade/perda |
| H5 | CAPI Test Events | recibos e diagnósticos |
| H6 | operação 72h | SLO, suporte e rollback |
| H7 | go/no-go | aprovação humana |

## Critérios go

- zero perda conhecida de webhook aceito;
- zero side effect duplicado conhecido;
- zero violação cross-tenant;
- reconciliação de ambíguos dentro do SLA;
- rollback ensaiado e executável em até 15 minutos;
- runbooks e suporte prontos;
- campanha → conversa → outcome → recibo comprovado quando elegível.

## Verificação

- 24h: saúde, filas, erros e reconciliação;
- 72h: estabilidade e rollback disponível;
- 7d: comportamento comercial e custos;
- 14d: decisão de expansão do piloto.

## SLOs técnicos iniciais para validação

- cross-tenant: zero;
- perda de evento aceito: zero;
- duplicidade externa: zero;
- reconciliação `reconciliation_required`: 100% detectada e triada em até 15 min; resolução pode depender do provider externo;
- webhook persistido p95: alvo 200 ms;
- mensagem no Cockpit p95: alvo 5 s;
- outbound ao provider p95: alvo 10 s, excluindo falha externa;
- conversão elegível despachada p95: alvo 5 min;
- rollback: até 15 min.

Metas comerciais serão definidas depois do baseline do piloto. Conversa ou lead não é receita.
