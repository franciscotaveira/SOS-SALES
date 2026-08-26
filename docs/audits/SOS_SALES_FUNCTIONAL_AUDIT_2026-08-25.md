# SOS Sales — Auditoria funcional por tela

> Data: 25 ago 2026
> Ambiente-alvo: `https://crm.iaparavendas.tech`
> Checkout local: `release/v2.0.0-soberana` / `e773ec7a40a69fb50ea53facf1ce82c98bb2e55b`
> Produção declarada por `/version`: `a9342199885e0f9bb9a3597ca77b636045305610`, `cleanTree: false`, build `2026-08-25T07:59:27.284Z`
> Estado: diagnóstico estrutural e navegação autenticada read-only consolidados; mutações externas permanecem bloqueadas.
> Segurança: nenhum envio, broadcast, template, CAPI ou limpeza foi executado.

## 1. Decisão executiva provisória

`NO-GO PARA DECLARAR PRODUÇÃO FUNCIONAL COMPLETA`.

A URL, o login e parte das leituras carregam, mas há divergência material entre o que a interface promete e o que o sistema comprova. A auditoria autenticada reproduziu falhas críticas de consistência, telemetria fictícia e fallback enganoso no release servido pelo VPS.

Este resultado não significa que todo o SOS Sales esteja inoperante. Significa que o escopo completo ainda não pode receber `PRODUCTION_READY_IN_AUDITED_SCOPE`.

## 2. Método e limites

- Código, composição runtime, contratos, logs históricos e browser público foram tratados como fontes independentes.
- `HTTP 200`, `/health`, containers ativos e renderização do login não foram usados como prova de usabilidade autenticada.
- Achados históricos de VPS foram separados de evidência corrente.
- Funções com efeito externo foram somente inspecionadas; teste real exige autorização e ator/dataset controlado.
- O navegador autenticado foi congelado no workspace Haven, com rótulo `OPERADOR` e banner simultâneo de `Modo Suporte Master Admin`.
- Toda mutação não executada recebe `BLOCKED_BY_SAFETY` ou `UNVERIFIED`, nunca `PASS`.

## 3. Inventário de superfícies

| Superfície | Funções principais | Visibilidade | Evidência atual | Estado |
|---|---|---|---|---|
| Login | autenticar; recuperar senha | pública | renderiza; validação negativa reproduzida | DEGRADED |
| Agora | fila; chat; dossiê; estágio; handoff; follow-up; outcome; WABA; mídia; limpeza | menu | leitura autenticada carregou; mutações bloqueadas por segurança | DEGRADED / HIGH RISK |
| Conversas & Funil | busca; filtros; lista; abrir contato; nova conversa | menu | Lista e Funil carregaram 50 jornadas; Torre TV usa fallback falso | DEGRADED |
| Kanban | pipelines; mover estágio; abrir lead; nova conversa | oculto no menu, presente na busca | rota é redirecionada para Conversas | FAIL IA |
| Agenda | lista; mês; semana; dia; criar; concluir alarme; agenda externa | menu | datas hardcoded e fallback local confirmados | FAIL |
| Anotações | criar; filtrar; fixar; copiar; excluir | menu | API existe, mas criação pode cair para registro local falso | FAIL |
| Grupos | conversas; monitor; wallboard; engine; resolver; responder; broadcast | flag | sucessos/estado local e fetch direto confirmados | FAIL |
| Campanhas / Analytics | ROI; SLA; CTWA; refresh | flag | Traffic Proof carregou; SLA exibiu KPIs após HTTP 500 | FAIL |
| Broadcast | audiência; canal; conteúdo; execução | flag | autenticação e endpoint de audiência inconsistentes | FAIL |
| Links & QR | links; QR; channel info | flag | correção parcial implantada; reteste pendente | READY_FOR_RETEST |
| Modelos WABA | listar; criar; sincronizar; excluir | flag | HTTP 500 com presets locais marcados como aprovados | FAIL |
| Tracking & Pixels | Meta/Google/UTM/CAPI | flag | API + fallback local; histórico 500 | FAIL |
| Matriz LTV | regras e oportunidades | oculta na subnav | localStorage | FAIL |
| Inteligência | tese; diagnóstico; catálogo; conhecimento; aprendizado; empresa; agentes | menu | fixtures/localStorage | FAIL |
| Simulador | cenários QA | oculto em produção | bloqueio estrutural confirmado | PASS restrito |
| Configurações — Equipe | usuários; papéis; filas; descontos; revogação | menu | localStorage/defaults | FAIL |
| Configurações — API/Webhooks | criar/revogar chave; segredo; testar entrega | menu | `Math.random()` e teste simulado | FAIL |
| Configurações — Canais | status; QR; conexão; sincronização; limpeza | menu | chamadas diretas e histórico 403/500 | FAIL |
| Configurações — Flags | recursos por papel/plano | menu | override local pode revelar UI restrita | FAIL |
| Configurações — Infra | WAHA/WABA; roteamento; health | menu | config mock e ping aleatório | FAIL |
| Global | busca; workspace; autonomia IA; Atlas | shell | troca de workspace reproduzida e revertida; autoridade ambígua | DEGRADED |

## 4. Findings confirmados

### ASR-UI-001 — Bearer não é aplicado uniformemente — CRITICAL

`HttpSalesOsGateway` autentica, mas Canais, Grupos, Campanhas, Tracking, Dashboard, Messenger, Atlas e ações WABA contêm `fetch()` direto. O resultado esperado inclui 401/403 fragmentado e telas parcialmente quebradas.

### ASR-UI-002 — Administração local disfarçada de configuração real — CRITICAL

Equipe, API/webhooks, flags, modelos/infra, LTV, tese e especialistas persistem em localStorage ou defaults. Alterações não são multiusuário, auditáveis nem necessariamente consumidas pelo backend.

### ASR-UI-003 — Inteligência produtiva baseada em fixtures — CRITICAL

Catálogo, documentos, regras, aprendizado, empresa e especialistas derivam de `clientIntelligenceFixtures` e bundle local. A interface não prova grounding do agente real.

### ASR-UI-004 — Rotas escapam do pool pertencente ao runtime — CRITICAL

Oito módulos HTTP importam `dbPool` diretamente. Isso explica a possibilidade de `/ready` verde enquanto rotas reais falham por configuração SSL/pool divergente. A correção de `channel-info` é apenas parcial.

### ASR-UI-005 — Navegação divergente — HIGH

Kanban existe e é pesquisável, mas não aparece no menu; `/kanban` resolve para Conversas. LTV não aparece na subnav. Tracking está em Resultados apesar de ser configuração. Broadcast e conhecimento têm implementações duplicadas.

### ASR-UI-006 — Flags locais não constituem autorização — CRITICAL

Overrides de localStorage podem liberar UI owner-only. O vazamento backend permanece não verificado, mas a proteção visual já está provadamente inadequada.

### ASR-UI-007 — Controles sem endpoint correspondente — HIGH

Foram localizadas chamadas para `/cockpit/overview` e cinco ações WABA sem implementação backend correspondente identificada: carousel, location request, multi-product, order details e product.

### ASR-UI-008 — Sucesso fabricado ou prematuro — CRITICAL

Grupos, broadcast de grupos, testes WAHA/WABA, teste de webhook, diagnóstico histórico e fallback do Atlas apresentam sucesso sem confirmação real. A UI não diferencia `confirmed`, `failed` e `uncertain`.

### ASR-UI-009 — Tokens e segredos simulados — CRITICAL

API keys e webhook secrets usam `Math.random()`, localStorage e testes aleatórios. Não possuem validade, revogação ou segurança server-side comprovada.

### ASR-UI-010 — Login com validação em inglês — LOW

Formulário em português exibe mensagens nativas “Please fill out this field” e “Please include an '@'...”. Evidência visual está em `.gstack/qa-reports/screenshots/`.

### ASR-UI-011 — Agenda presa a agosto de 2026 — CRITICAL

Visões diária, semanal e mensal e partes dos filtros fixam 10–16/08/2026. O botão “Hoje” retorna para 15/08/2026. Isso pode ocultar compromissos reais e apresentar dados antigos como atuais.

### ASR-UI-012 — Dados comerciais fictícios podem ser enviados — CRITICAL

Atalhos do cockpit carregam CNPJ/Pix `12.345.678/0001-90`, “SOS Sales LTDA” e endereço de exemplo. O composer chama `sendDirectMessage`, portanto o risco alcança um cliente real após ação do operador.

### ASR-UI-013 — Agenda e notas fabricam persistência — CRITICAL

Quando a API falha, a UI cria registros `apt-${Date.now()}` ou `note-${Date.now()}`, fecha o modal e parece concluir a operação. O conteúdo desaparece no reload.

### ASR-UI-014 — Limpeza destrutiva fora do cliente autenticado — CRITICAL

Limpar histórico e limpar conversa usam `fetch()` direto. As rotas backend existem; a limpeza total é owner-only, mas o fluxo precisa de autenticação uniforme, step-up, confirmação reforçada, auditoria e recuperação.

### ASR-UI-015 — Kanban renderiza zero como estado transitório sem sinalizar carregamento — MEDIUM

Logo após a troca Lista → Kanban, a tela mostrou 0 leads, R$ 0 e 0% em todas as colunas. A captura posterior confirmou que o funil carregou 50 leads e R$ 5.000. Portanto, não há evidência de desconexão permanente; há um estado transitório enganoso que usa “zero real” no lugar de skeleton/loading e pode induzir leitura incorreta em redes lentas.

### ASR-UI-016 — Torre TV fabrica conversas “ao vivo” — CRITICAL

A Torre TV apresentou mensagens genéricas repetidas, rótulos “Cliente · Hoje”, “IA Copilot · Agora” e “IA Ativa 15m”. O componente contém textos fallback hardcoded por serviço. A tela promete “dados reais”, portanto fallback narrativo deve ser proibido.

### ASR-UI-017 — Monitor de Grupos exibe KPIs sem grupos — CRITICAL

O hub mostrou 0 grupos ativos e lista 0 de 0, mas o Monitor afirmou 12 grupos conectados, 140 mensagens, SLA médio de 11 minutos e resolução de 94,8%. Os números não possuem população observável correspondente.

### ASR-UI-018 — Analytics exibe números após falha HTTP 500 — CRITICAL

`/reports/performance-sla?period=30d` retornou 500. Mesmo assim a UI exibiu 3,8 s, 34 min, ganho 537x, 88,5%, 84 leads, risco de R$ 1.602,00 e outras métricas determinísticas. A tela converte indisponibilidade em diagnóstico comercial falso.

### ASR-UI-019 — Templates parecem aprovados apesar de falha Meta — CRITICAL

`/channels/waba/templates` retornou 500. A tela afirmou “Canal WABA Conectado”, “sincronizados em tempo real” e marcou cinco presets como “Aprovado”, embora também mostrasse 0 modelos sincronizados. Preset local não pode usar status regulado pelo provedor.

### ASR-UI-020 — Tracking cai para configuração aparentemente real após HTTP 500 — CRITICAL

`/tracking` retornou 500, mas a UI exibiu toggles ativos, IDs de Google Ads, campanhas, volume de leads, número de WhatsApp e links prontos. O usuário não recebe estado de erro nem distinção entre fallback local e configuração publicada.

### ASR-UI-021 — Papel e autoridade efetiva são ambíguos — HIGH

A sessão é rotulada `OPERADOR`, mas também recebe banner de Suporte Master Admin, troca de cliente no módulo Inteligência, configurações owner-only, exclusão de documentos, gestão de usuários, chaves e controles destrutivos. A troca Haven → Hotel foi reproduzida e revertida. O teste não prova vazamento porque a sessão pode possuir privilégio de suporte; prova que a UI não comunica nem limita claramente a autoridade efetiva.

### ASR-UI-022 — Segredo com aparência de produção é exposto no DOM — CRITICAL

API & Webhooks oferece “copiar token completo” e inclui um Bearer completo em exemplo `curl`, além de afirmar uso recente. Mesmo sendo um objeto local/simulado, segredo nunca deve residir em localStorage, HTML, screenshot ou exemplo persistente. O valor foi deliberadamente omitido deste relatório.

### ASR-UI-023 — Telemetria de infraestrutura é internamente contraditória — CRITICAL

Na mesma sessão, WAHA apareceu desconectado/aguardando QR e também “Sessão Ativa”, bateria 94%, 342h de uptime e 12 grupos. WABA alternou entre conectado e não configurado, enquanto Infra afirmou 18 templates aprovados e o endpoint de templates falhou. Há múltiplas fontes de verdade e mocks concorrentes.

### ASR-UI-024 — Polling gera carga contínua e potencial sobreposição — HIGH

Enquanto a tela Agora permaneceu aberta, priorities, journeys, cockpit e status foram consultados repetidamente. Foram observadas latências entre ~1 s e 7,6 s; o status continuou sendo consultado nas demais telas. Sem cancelamento/deduplicação, polls podem se sobrepor, aumentar carga e produzir flapping de estado.

### ASR-REL-001 — Produção não possui proveniência reprodutível — CRITICAL

`/version` declarou commit `a934219`, enquanto o checkout local está em `e773ec7`, e declarou `cleanTree: false`. `channel-info` retornou 200 embora a correção local esteja em commit posterior, indicando possível deploy de árvore suja ou manifest desatualizado. Não é possível reconstruir com confiança o artefato exato apenas pelo SHA informado.

### ASR-UI-025 — Cockpit mobile sofre clipping, sobreposição e densidade impeditiva — HIGH

Em `390 × 844`, a tela Agora empilha fila e detalhe em uma única coluna, trunca controles do dossiê e objeções rápidas e deixa o Atlas flutuante sobre a região do composer. A tela renderiza, mas a composição reduz visibilidade e aumenta o risco de toque incorreto em ações comerciais. A amostra autenticada de Agora foi concluída; as demais superfícies mobile perderam a sessão durante a coleta e permanecem explicitamente `UNVERIFIED`, não `PASS`.

### ASR-UI-026 — Meta diária e faturamento possuem piso e fórmula fabricados — CRITICAL

O cockpit força no mínimo três vendas (`Math.max(closedCount, 3)`), calcula faturamento como `vendas × 180 + 350` e fixa a meta em R$ 2.000. Assim, mesmo sem três vendas confirmadas ou receita persistida, a interface apresenta faturamento e progresso como fatos. Esses valores precisam vir de pedidos/pagamentos confirmados e carregar fonte, janela e atualização.

## 5. Funções ocultas, redundantes e realocáveis

- Consolidar Conversas e Kanban como modos Lista/Quadro da mesma jornada.
- Centralizar Broadcast numa superfície única de Mensageria; Grupos fornece somente audiência/contexto.
- Mover Tracking para Configurações > Integrações e LTV para Configurações Comerciais.
- Manter Resultados como leitura, sem configuração de credenciais ou regras.
- Mover Dados da Empresa para Configurações; Inteligência apenas referencia a versão publicada.
- Unificar as duas bases de conhecimento.
- Separar “canal conectado” de “roteamento/infra avançada”.
- Sidebar pode exibir estado da IA, mas alteração de política deve ocorrer em Inteligência com permissão e auditoria.

## 6. Pendências obrigatórias da auditoria dinâmica

1. Completar a variante mobile/responsiva de Conversas, Resultados, Inteligência e Configurações; Agora foi auditada em `390 × 844` e falhou por clipping/sobreposição.
2. Testar sessão expirada, papel realmente restrito e isolamento com duas contas dedicadas, sem depender do modo de suporte.
3. Executar estados de erro controlados no Lab para formulários de Agenda e Anotações.
4. Homologar mensagens, broadcast, template, OAuth, CAPI e limpezas somente com autorização separada e dataset descartável.
5. Reproduzir após correções os 404/500 atuais e correlacionar com logs VPS.
6. Substituir mutações `UNVERIFIED` por `PASS`, `FAIL`, `BLOCKED` ou `NOT_APPLICABLE`.

## 7. Artefatos relacionados

- Plano: `docs/audits/SOS_SALES_FUNCTIONAL_EXECUTION_PLAN_2026-08-25.md`
- Evidência incremental: `.gstack/qa-reports/qa-report-crm-iaparavendas-tech-2026-08-25.md`
- Screenshots: `.gstack/qa-reports/screenshots/`

## 8. Continuação sobre o release `e773ec7`

Produção foi recongelada em `e773ec7a40a69fb50ea53facf1ce82c98bb2e55b`, ainda com `cleanTree: false`. A superfície pública de login renderizou corretamente em desktop e mobile, mas `ASR-UI-010` permanece reproduzível: o envio vazio mostra validação nativa em inglês. A cobertura das funções autenticadas neste release está `BLOCKED` até a reautenticação manual no browser de auditoria. Nenhuma mutação de produção foi realizada nesta continuação.

Após três verificações consecutivas, o browser permaneceu sem sessão. Este `BLOCKED` descreve o gate operacional da auditoria, não uma indisponibilidade comprovada do SOS Sales. Para retomar, é necessário autenticar manualmente a sessão já aberta e confirmar com `logado`.

## 9. Retomada autenticada e decisão do release `e773ec7`

A sessão foi reautenticada no workspace Haven com papel visual `OPERADOR`. Foram completadas as variantes pendentes de Conversas, Resultados, Inteligência e Configurações em desktop e mobile, além da inspeção read-only do Receptionist.

### Evidência decisiva

- Workspaces, journeys, priorities, cockpit e traffic-proof responderam `200`.
- Status WhatsApp, channel-info, relatório SLA, templates e tracking responderam `401` dentro da mesma sessão válida.
- Broadcast depende de `/cockpit/overview`, que respondeu `404`.
- Mesmo com essas falhas, UI apresentou Analytics completo, presets WABA aprovados, Tracking ativo, Meta Cloud conectada, WAHA ativo, 18 templates, 12 grupos e 342h de uptime.
- O endpoint do Receptionist respondeu `200` e confirmou engine NVIDIA, serviço global habilitado e bot da jornada desligado. Nenhum controle correspondente apareceu no Dossiê.
- O runtime possui chaves localStorage específicas para bundles de Inteligência, equipe, webhooks e API keys do workspace.

### Estado final desta fase

`NO-GO` para confiabilidade funcional integral. Há um núcleo operacional read-only utilizável, especialmente jornadas/cockpit e Traffic Proof, mas as superfícies de integração, telemetria, administração e IA não podem ser tratadas como fonte de verdade. A evidência detalhada, matriz atualizada e 30 capturas do release estão em `.gstack/qa-reports/qa-report-crm-iaparavendas-tech-2026-08-25.md` e `.gstack/qa-reports/screenshots/continuation-e773ec7-auth/`.
