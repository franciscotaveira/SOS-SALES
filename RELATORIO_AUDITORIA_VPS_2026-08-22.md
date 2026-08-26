# Relatório de Auditoria do VPS — SOS Sales

**Data da coleta:** 22 de agosto de 2026  
**Ambiente:** VPS `179.197.72.221` / `crm.iaparavendas.tech`  
**Modalidade:** auditoria remota somente leitura  
**Escopo:** disponibilidade, composição do runtime, sinais de tráfego, rastreabilidade de release e limites para homologação.  
**Fora de escopo:** alteração de configuração, restart, deploy, leitura de valores de segredo, testes mutantes e disparo de mensagens.

## Veredito executivo

**OPERACIONAL COM BLOQUEIOS DE HOMOLOGAÇÃO.**

O VPS está acessível, os quatro containers essenciais estão ativos e os endpoints públicos de saúde e prontidão responderam corretamente. Isso prova disponibilidade técnica pontual.

Não prova, porém, que a remediação anunciada esteja em produção nem que o ambiente esteja pronto para escalar com segurança. Há divergência de identidade do serviço, ausência de proveniência verificável do release e tráfego ativo no webhook legado WAHA. Portanto, o status correto não é “produção homologada”; é **serviço em operação, pendente de evidência de release e de validação de segurança multi-tenant**.

## O que foi observado

| Item | Evidência observada | Conclusão |
| --- | --- | --- |
| Acesso ao host | SSH pelo alias `vps` respondeu; hostname `srv1827837` | VPS acessível para auditoria |
| Estado dos containers | `sos-sales-api`, `sos-sales-waha`, `sos-sales-caddy` e `sos-sales-redis` estavam em execução; Redis marcado como saudável | Stack principal ativa |
| API interna | `http://127.0.0.1:4335/health` respondeu `200` | API atendendo dentro do host |
| Saúde pública | `https://crm.iaparavendas.tech/health` respondeu `200` | Caddy e rota pública atendendo |
| Prontidão pública | `/ready` respondeu `200` e informou banco, Redis e worker como `ok` | Dependências declaradas disponíveis naquele instante |
| Processo de API | Container `sos-sales-api` iniciado em 21/08/2026, com `restart=unless-stopped` | Processo supervisionado e recente |
| Tráfego WAHA | Logs da API registraram POSTs recorrentes de `172.18.0.3` para `/api/v1/channels/waha/webhook`, todos `200` | Webhook legado está efetivamente ativo |
| Artefato montado | A API monta `/opt/sos-sales/api/dist` e `production-runtime.mjs` do host | Runtime depende de artefatos externos ao container |

## Evidências positivas

1. **Disponibilidade básica confirmada.** O host tinha baixa carga no momento da coleta e os containers necessários estavam de pé.
2. **Cadeia pública mínima respondendo.** Health e readiness públicos retornaram sucesso; a prontidão declarou banco, Redis e worker saudáveis.
3. **Processo reiniciável.** A política `unless-stopped` reduz risco de indisponibilidade após queda do processo ou reboot do host.
4. **Integração WAHA em uso.** Há chamadas recorrentes do container WAHA para a API. Isso é prova de atividade do caminho legado, não prova de isolamento, assinatura ou correção funcional.

## Achados que bloqueiam homologação

### P0 — identidade do runtime diverge do produto auditado

Os endpoints de health expõem o sistema como **`TX Commercial Core`**, versão `1.0.0`, enquanto o ambiente deveria ser identificado e rastreável como SOS Sales. Essa divergência pode significar artefato reaproveitado, runtime desatualizado ou apenas metadado incorreto. Em qualquer dos casos, impede afirmar com segurança qual release está em execução.

**Risco:** deploy de um código diferente do esperado, diagnóstico confuso e rollback sem referência confiável.

**Evidência necessária para fechar:** versão/commit imutável exposto pelo runtime e uma comparação entre commit, artefato compilado e imagem/manifest em produção.

### P0 — correções de código local não estão comprovadas no runtime

O hash do `apps/api/dist/index.js` local e remoto coincidiu durante a coleta, mas o artefato local não foi recompilado depois das alterações atualmente não commitadas no código-fonte. Logo, a igualdade de hash não prova que as correções recentes estejam no VPS.

**Conclusão:** o estado é **não comprovado**, não “deployado”.

### P0 — receptor legado WAHA segue ativo

O endpoint `/api/v1/channels/waha/webhook` recebe eventos continuamente e responde `200`. A auditoria de fonte anterior apontou este caminho como receptor legado a revisar quanto a autenticação/assinatura e resolução de workspace.

**O que é conhecido:** a rota está ativa em produção.  
**O que não foi provado:** HMAC, autenticação, validação de origem, proteção contra replay e isolamento de tenant no artefato realmente executado.

### P1 — runtime montado por volume reduz rastreabilidade

O container da API executa código e dependências montados de `/opt/sos-sales/api` no host, inclusive `dist`, `node_modules`, `package.json` e `production-runtime.mjs`.

Isso pode funcionar, mas permite que a execução mude fora de uma imagem versionada e dificulta responder “qual build está rodando?”.

**Direção recomendada:** publicar imagem imutável por commit, registrar digest e usar volumes apenas para dados/configuração que não sejam código executável.

### P1 — sem prova de gates de segurança em ambiente integrado

A suíte local atual passou em 41 arquivos / 268 testes e o TypeScript/build foram validados localmente. O Docker Lab, entretanto, não pôde ser reconstruído: o daemon Docker interrompeu a conexão durante o BuildKit. Sem Lab atualizado, não houve teste integrado das correções antes de qualquer deploy.

Isso mantém os seguintes itens como **BLOCKED_EXTERNAL / NÃO HOMOLOGADOS**:

- isolamento multi-tenant no runtime integrado;
- validação negativa de workspace inválido;
- assinatura e anti-replay do webhook WAHA;
- WABA/Meta com credenciais reais e cenários de colisão;
- fluxo de saída, rollback e reconciliação pós-deploy.

## Classificação de evidência

| Classificação | Afirmação |
| --- | --- |
| **[KNOWN]** | VPS, containers, health, readiness e tráfego WAHA foram observados diretamente. |
| **[KNOWN]** | O serviço se identifica como `TX Commercial Core` no health. |
| **[INFERRED]** | O runtime pode estar desatualizado ou com identidade herdada; a divergência não permite determinar qual hipótese é correta. |
| **[NOT PROVEN]** | Que as remediações de multi-tenancy, WABA e UX estejam implantadas no VPS. |
| **[NOT PROVEN]** | Que o webhook WAHA ativo tenha autenticação forte e isolamento de tenant. |

## Decisão operacional

| Decisão | Status | Motivo |
| --- | --- | --- |
| Manter serviço atual atendendo | **GO condicionado** | Saúde e dependências responderam, sem indício de indisponibilidade no instante auditado. |
| Declarar remediação concluída em produção | **NO-GO** | Não há proveniência de release nem homologação integrada das correções. |
| Implantar as alterações locais | **NO-GO temporário** | O Docker Lab atualizado não foi validado; o fluxo obrigatório exige Lab antes do VPS. |
| Executar testes mutantes em produção | **NO-GO sem plano controlado** | Podem criar/alterar dados, acionar integrações e afetar clientes. |

## Plano mínimo para liberar homologação

1. **Restabelecer o Docker Lab** e reconstruir as imagens a partir do checkout atual. Critério: API Lab saudável e identificada como SOS Sales, não TX Commercial Core.
2. **Executar testes negativos integrados**, incluindo workspace inválido, aliases maliciosos, colisão de `phoneNumberId`, chamada sem autenticação e webhook WAHA sem assinatura válida. Critério: rejeição explícita sem fallback de tenant e sem consulta à integração externa.
3. **Gerar artefatos a partir de um commit identificável.** Registrar SHA do commit, hash do `dist`, digest da imagem e timestamp do deploy. Critério: `/health` ou `/version` expõe release compatível.
4. **Revisar e proteger o endpoint WAHA legado.** Exigir mecanismo de autenticação/verificação, registrar origem e cobrir replay/idempotência. Critério: request sem prova válida recebe `401/403` e não produz efeito.
5. **Deploy controlado e reversível.** Backup do artefato atual, rollout, smoke tests não mutantes, monitoramento de logs e rollback documentado. Critério: saúde, isolamento e rotas críticas aprovados após a mudança.

## Limitações desta auditoria

- Não foram exibidos valores de variáveis de ambiente, tokens, senhas ou dados de clientes.
- Não foram feitos POSTs de escrita, disparos WhatsApp, flush de Redis, restart nem deploy.
- Health/readiness são sinais de disponibilidade; não são prova de autorização, segurança ou consistência de dados.
- A conclusão representa o instante da coleta. Alterações posteriores no host exigem nova auditoria.

## Conclusão

O VPS está **funcionando**, mas a operação não possui evidência suficiente para ser chamada de **remediada e homologada em produção**. O próximo movimento inteligente é restaurar o Lab, transformar as correções em um release rastreável e só então executar a homologação de segurança e o deploy controlado.

