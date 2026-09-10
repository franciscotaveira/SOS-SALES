# SOS Sales — nova auditoria de regressão

Data: 10/09/2026, 16:57 BRT. Comparação com SOS_SALES_AUDITORIA_2026-09-10.md.

## Conclusão

Sistema disponível nos endpoints consultados. Os cinco defeitos operacionais/UX anteriormente identificados permanecem no código atual. Homologação autenticada continua pendente. Esta rodada é uma nova execução de verificações locais e de saúde remota, não uma certificação integral do produto.

## Versões e disponibilidade verificadas novamente

- Git HEAD: f388c5a73064a556fbcb87fe6451bb0eef224085.
- API de produção às 19:57:03 UTC: status ok, production, commit f388c5a73064a556fbcb87fe6451bb0eef224085.
- Lab: status ok, lab, commit dev-local. Não há identidade de commit suficiente para equiparar Lab e checkout.
- VPS: API e Caddy ativos há 19 horas; WAHA há 7 dias; Redis saudável.
- Checkout contém 23 arquivos rastreados modificados, além de arquivos novos, incluindo migrações e testes de CAPI. Não atribuir essas alterações à produção apenas porque HEAD coincide com o health.
- O primeiro acesso de rede foi impedido pelo sandbox; a repetição autorizada com acesso de rede retornou os resultados acima. Não foi constatada indisponibilidade do aplicativo nessa primeira tentativa.

## Revalidação dos achados

| ID | Prioridade | Resultado atual | Evidência no código |
|---|---|---|---|
| A01 | P1 | Permanece: Todas e busca limitadas ao primeiro lote de 20 jornadas | LiveCockpitView.tsx:549 solicita limit 20 e descarta nextCursor |
| A02 | P1 | Permanece: inserção de agenda chama envio direto, sem a revisão prevista no roteiro | LiveCockpitView.tsx:1618 liga onInsertSlotToDraft a handleCreateOutboundDraft |
| A03 | P2 | Permanece: grid usa largura útil e visibilidade usa breakpoint da janela | LiveCockpitView.tsx:368 e :1190 versus hidden md:flex em :1202 e :1339 |
| A04 | P2 | Permanece: lista Ativas inclui OPEN; badge não | LiveCockpitView.tsx:984 e :1246 |
| A05 | P2 | Permanece: Enter não verifica actionInProgress | LiveCockpitView.tsx:2705; duplicação efetiva no canal não demonstrada |
| A06 | P3 | Permanece: CSS inválido e aviso de bundle grande | Novo build: [file:line]{file:line}; principal 1.047,39 kB, gzip 265,66 kB |

Os resultados A01–A05 são análise estática reexecutada. Não se apresentam como interação autenticada reproduzida nesta rodada.

## Mudanças desde a primeira rodada

- Receptionist agora possui alteração local para impedir atuação em jornadas ABANDONED, WON e LOST. O novo teste passou, usando consulta simulada; isso não demonstra o comportamento do worker publicado.
- Pausar bot passa a atribuir responder_owner=human; retomar passa a ativar bot_enabled e atribuir sos_sales. Alterações locais inspecionadas, sem validação integrada com banco nesta rodada.
- Compose do Lab passa a habilitar o worker CAPI por padrão. O resolvedor de configuração ainda exige metaCapiEnabled=true por configuração. Nenhum evento externo foi enviado pela auditoria.

## Testes desta rodada

| Checagem | Resultado |
|---|---|
| npm run lint | Passou |
| npm test | 22 testes, 8 arquivos passaram |
| TypeScript da API | Passou |
| npm --prefix apps/api run test:unit | 309 testes, 46 arquivos passaram |
| APP_ENV=lab npm run build | Passou em 4,03s, com os avisos descritos |

Total: 331 testes nesta execução, contra 330 na anterior. Logs: /tmp/sos-reaudit-unit.log e /tmp/sos-reaudit-build.log. Runner da API continua informando Vitest 1.6.1.

## Limites e decisão

Não houve sessão autenticada, envio de mensagens, consulta de dados de clientes, teste de integração com banco, validação no Events Manager ou alteração de produção. Não foram repetidas capturas de navegador; a disponibilidade remota nesta rodada foi verificada por health e estado dos containers.

Prioridade recomendada: corrigir A01 e A02; depois A03–A05. Executar validação autenticada no Lab com mais de 20 jornadas, falha/lentidão de envio e larguras próximas aos breakpoints. Manter separados: código preparado, teste local aprovado, release publicada e integração externa demonstrada.

Nenhuma correção de produto, commit ou deploy foi realizado nesta auditoria.
