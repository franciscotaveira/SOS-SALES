# SOS Sales — Plano de execução após auditoria funcional

> Status: DIAGNÓSTICO CONSOLIDADO. Inventário estrutural e navegação autenticada desktop concluídos; mutações externas e quatro superfícies mobile permanecem gates controlados, não evidência de aprovação.
> Regra: nenhuma função é considerada pronta apenas porque renderiza, altera estado React ou retorna health 200.

## 1. Objetivo

Transformar cada promessa visível do SOS Sales em uma capacidade real, multi-tenant, autenticada, persistida, observável e verificável. Remover ou rotular qualquer controle que hoje simule efeito operacional.

## 2. Gates de execução

1. Docker Lab antes de qualquer deploy.
2. Nenhum envio WhatsApp, broadcast, template ou CAPI sem ator/dataset de teste e aprovação explícita.
3. Cada correção deve possuir reprodução anterior, teste de regressão e reteste no runtime corrigido.
4. Toda mutação deve usar autenticação Bearer, autorização de workspace e papel mínimo no backend.
5. A UI só pode mostrar sucesso após confirmação do servidor/provedor e persistência.
6. Produção deve possuir backup, rollback, versão identificável e janela limpa de erros após deploy.

## 3. Fase P0 — Restaurar verdade operacional e segurança

### P0.0 Contenção comercial imediata

- Ocultar/desabilitar em produção os atalhos que preenchem Pix/CNPJ/endereço hardcoded.
- Remover imediatamente a fórmula de meta/faturamento que força três vendas e receita mínima; até existir fonte financeira confirmada, exibir `Não calculado`.
- Ocultar dashboards, Torre TV, Monitor de Grupos, Tracking e status WABA/WAHA quando a fonte real falhar; exibir `Dados indisponíveis`.
- Remover o rótulo “Aprovado” de qualquer template que não possua ID/status confirmado pela Meta.
- Remover tokens completos do DOM, localStorage, exemplos `curl` e screenshots; rotacionar qualquer segredo que possa ter sido real.
- Desabilitar criação de agenda e nota quando a API estiver indisponível; nunca inserir fallback local em modo API.
- Corrigir as visões diária/semanal/mensal para usar data corrente e timezone do workspace.
- Restringir limpeza de histórico/conversa a owner autenticado, com confirmação reforçada e trilha de auditoria.
- Adicionar gate de build que rejeite CNPJ, Pix, endereço, telefone ou credencial de exemplo em código produtivo permitido pelo bundle.
- Aceite: nenhum dado comercial de exemplo é oferecido ao operador; falha de persistência permanece visível; agenda exibe a data real; mutação destrutiva gera evento auditável.
- Rollback: manter as quatro funções desabilitadas. Não reativar defaults simulados para preservar aparência de completude.

### P0.1 Unificar cliente HTTP autenticado

- Problema: componentes usam `fetch()` direto; somente `HttpSalesOsGateway` injeta Bearer.
- Implementação:
  - criar `AuthenticatedHttpClient` único, obtendo token da sessão Supabase;
  - padronizar `requestId`, timeout, abort, JSON, 401/403/409/422/429/5xx;
  - migrar Canais, Grupos, Campanhas, Tracking, Dashboard, Messenger, Atlas e ações WABA;
  - proibir `fetch('/api/v1/...')` direto via lint/test estático.
- Arquivos principais:
  - `src/services/supabaseAuth.tsx`
  - `src/services/salesOsGateway.ts`
  - componentes listados na matriz de auditoria.
- Aceite:
  - zero chamadas diretas produtivas sem Bearer;
  - sessão expirada redireciona para login sem loop;
  - usuário sem workspace recebe 403, sem vazamento;
  - logs correlacionam request, rota, workspace e status sem registrar token.
- Rollback: manter gateway anterior selecionável por feature flag server-side durante um release.

### P0.2 Remover falsos sucessos e optimistic updates irreconciliados

- Problema: grupos, webhooks, health-checks, diagnóstico e Atlas apresentam sucesso fabricado.
- Implementação:
  - estado padrão `idle → pending → confirmed | failed | uncertain`;
  - só alterar UI definitiva após resposta confirmada;
  - em timeout, consultar estado/reconciliar antes de permitir retry;
  - remover latência/status aleatórios e mensagens fallback que afirmam execução;
  - remover fallback local de criação em Agenda e Anotações no modo API;
  - registrar falha de provedor de forma acionável.
- Aceite:
  - falha injetada nunca produz banner verde;
  - timeout não duplica mensagem ou broadcast;
  - reload preserva somente efeitos confirmados.

### P0.3 Confinar PostgreSQL ao runtime de produção

- Problema: oito módulos HTTP importam `dbPool` diretamente, divergindo de `/ready`.
- Implementação:
  - criar ports/gateways específicos para agent, Atlas, outcomes, Meta Partner, supplier, Messenger e WABA;
  - injetar o pool deployment-owned em `production-runtime.mjs`;
  - remover imports de `dbPool` das interfaces HTTP e serviços de produção;
  - teste arquitetural falha se uma rota importar `infrastructure/database/pool`.
- Aceite:
  - `rg` retorna zero imports diretos em `interfaces/http/routes`;
  - todos os endpoints históricos deixam de produzir erro SSL;
  - `/ready` degrada se o mesmo pool usado pelas rotas falhar.

### P0.4 Fechar autorização real de recursos financeiros e administrativos

- Problema: feature flags locais podem revelar UI owner-only e a hierarquia declara `admin` acima de `owner`.
- Implementação:
  - autorização sempre server-side, baseada em membership persistida;
  - flags server-side por workspace/plano/papel;
  - localStorage limitado a preferências visuais não sensíveis;
  - matriz explícita viewer/operator/supervisor/admin/owner por endpoint.
- Aceite:
  - testes cross-tenant e restricted-role em todos os endpoints sensíveis;
  - alterar localStorage manualmente não libera dados nem mutações;
  - respostas 403 são consistentes e auditáveis.

### P0.5 Desabilitar ações sem contrato backend

- Problema: audiência de broadcast usa `/cockpit/overview` inexistente; cinco ações WABA apontam para endpoints ausentes.
- Implementação:
  - decidir por função: implementar, ocultar ou rotular “em homologação”;
  - nunca deixar botão ativo apontando para 404;
  - contrato OpenAPI e teste de paridade UI ↔ API.
- Aceite: verificador automatizado mapeia todos os endpoints literais do frontend para uma rota OpenAPI válida.

### P0.6 Tornar o OpenAPI uma fonte confiável

- Problema: o `openapi.json` congelado contém apenas 26 paths e está abaixo da superfície Fastify efetivamente registrada.
- Implementação:
  - gerar o documento a partir do mesmo composition root e plugins usados pelo runtime;
  - incluir método, parâmetros, autenticação, papéis, schemas e códigos de erro;
  - comparar em CI as rotas registradas pelo Fastify com os paths/métodos publicados;
  - versionar o artefato gerado e impedir merge quando estiver desatualizado;
  - somente após essa convergência, ligar a checagem UI ↔ OpenAPI como gate obrigatório.
- Aceite:
  - 100% das rotas produtivas registradas aparecem no contrato;
  - nenhuma rota documentada é inexistente no runtime;
  - o build falha ao adicionar endpoint ou chamada frontend sem atualizar o contrato.
- Rollback: manter o contrato anterior apenas como artefato histórico; ele não pode continuar sendo apresentado como cobertura integral.

### P0.7 Restaurar proveniência do release

- Problema: produção declara `cleanTree: false`, SHA `a934219`, enquanto comportamentos podem incluir correção posterior ao commit declarado.
- Implementação:
  - bloquear build/deploy com worktree suja;
  - gerar frontend e API no mesmo SHA e pipeline;
  - publicar SHA, digest de imagem, hashes dos bundles frontend/API e migration set;
  - assinar o release manifest e validá-lo no startup;
  - remover qualquer rsync manual de arquivo fora do manifesto;
  - realizar deploy canário do artefato imutável e validar `/version` contra o digest esperado.
- Aceite: checkout limpo do SHA declarado reproduz byte a byte os artefatos informados; `/version` retorna `cleanTree: true`; rollback referencia um digest imutável conhecido.

### P0.8 Unificar read models e telemetria

- Problema: Lista 50 vs Kanban 0; Grupos 0 vs Monitor 12; WAHA/WABA flapping; dashboards exibem fixtures após 500.
- Implementação:
  - definir uma fonte de verdade por domínio e um schema comum de freshness/provenance;
  - toda métrica carrega `source`, `calculatedAt`, `sampleSize` e `status`;
  - remover fallbacks narrativos em modo API;
  - invalidar cache ao trocar workspace;
  - cancelar polls anteriores e impedir concorrência por chave;
  - usar SSE/WebSocket ou polling adaptativo apenas onde houver necessidade real.
- Aceite: contagens reconciliam entre modos; falha de fonte nunca produz KPI; troca de workspace não mostra dado anterior; não há mais de uma request em voo por recurso.

## 4. Fase P1 — Tornar configurações persistentes e multiusuário

### P1.1 Equipe e usuários

- Backend: convites, memberships, papéis, filas, desconto máximo, status e revogação.
- Segurança: owner/admin conforme política aprovada; proibir autoelevação.
- UI: substituir defaults e localStorage por API; mostrar convite pendente/ativo/revogado.
- Aceite: mudança aparece em outro navegador e revogação impede nova requisição.

### P1.2 Chaves de API e webhooks

- Backend: geração criptográfica, hash do token, prefixo, scopes, expiração, último uso, rotação e revogação.
- Webhooks: segredo server-side, assinatura, tentativas, backoff, dead-letter e replay manual auditado.
- UI: segredo exibido uma única vez; teste usa entrega real controlada.
- Aceite: chave revogada retorna 401; assinatura inválida é rejeitada; nenhum segredo em localStorage/logs.

### P1.3 Feature flags e planos

- Backend: fonte de verdade por plano/workspace; alteração auditada e restrita.
- Frontend: apenas leitura e comandos autorizados; overrides locais somente em Lab.
- Aceite: dois usuários do mesmo workspace veem estado consistente após reload.

### P1.4 Configuração de IA, catálogo, documentos e aprendizado

- Modelo de dados versionado: perfil da empresa, políticas, catálogo, documentos, fatos, feedback e especialistas.
- Pipeline: upload → processamento → indexação → versão ativa → rollback.
- Agent runtime: registrar quais fontes/versões fundamentaram cada resposta.
- Aceite:
  - alteração server-side aparece em outro navegador;
  - pergunta conhecida usa fonte publicada;
  - pergunta desconhecida não inventa preço;
  - versão anterior pode ser restaurada.

### P1.5 LTV, tracking e roteamento

- LTV: regras server-side versionadas e motor que produz oportunidades reais.
- Tracking: remover fallback local em produção; segredos em cofre; CAPI com idempotência.
- Roteamento WAHA/WABA: substituir `mockEngineConfig` e health-check aleatório por estado real.
- Aceite: configuração, execução e relatório concordam após reload.

## 5. Fase P2 — Reorganizar arquitetura de informação

### P2.1 Operação

- `Agora`: somente prioridades, conversa ativa, dossiê e próximo passo.
- `Conversas & Funil`: alternância Lista/Kanban dentro da mesma tela.
- `Agenda`: compromissos e follow-ups.
- `Anotações`: separar notas do workspace de fatos/notas do lead.
- `Grupos`: conversas, saúde e avisos, sem duplicar broadcast global.

### P2.2 Crescimento

- `Campanhas`: analytics, CTWA, links e leitura de performance.
- `Mensageria`: templates e broadcast centralizados por canal/audiência.
- `Tracking & Pixels`: mover para Configurações > Integrações.
- `LTV`: mover para Configurações Comerciais; Resultados exibe apenas outcomes.

### P2.3 Inteligência

- Manter: personalidade, conhecimento, catálogo, aprendizado e especialistas.
- Mover dados cadastrais da empresa para Configurações.
- Sidebar mostra estado da IA; mudança de política exige tela de Inteligência e permissão.
- Remover segunda base de conhecimento ou consolidar em um único componente.

### P2.4 Sistema

- Canais: conexão, QR, WABA e status.
- Infra avançada: roteamento/failover somente para papel autorizado.
- Equipe, API/Webhooks, flags e auditoria como superfícies server-backed.

## 6. Fase P3 — Homologação funcional por tela

Para cada tela/subtela:

1. screenshot inicial desktop e mobile;
2. inventário de controles visíveis, ocultos por flag e inacessíveis;
3. happy path não destrutivo;
4. entrada inválida e permissão insuficiente;
5. indisponibilidade de API/provedor;
6. reload/back/forward e troca de workspace;
7. correlação UI → HTTP → banco/job/provedor → UI;
8. console e acessibilidade;
9. classificação PASS/FAIL/BLOCKED/UNVERIFIED;
10. regressão automatizada para todo bug corrigido.

Mutações externas exigem cartão de autorização separado para inbound, outbound, broadcast, template, OAuth e CAPI.

## 7. Fase P4 — Observabilidade e release

- healthchecks Docker para API, Caddy e WAHA;
- dashboards por rota/status/latência e provider outcome;
- release manifest consistente entre frontend, API e VPS;
- imagem WAHA fixada por digest/versão, nunca `latest`;
- backup com restore drill;
- canário por workspace e rollback automatizado;
- monitoramento de 24 horas sem 401/500 sistêmicos antes de ampliar uso.

## 8. Sequência recomendada

1. P0.0 contenção comercial imediata.
2. P0.7 proveniência do release.
3. P0.1 autenticação HTTP.
4. P0.2 verdade da UI.
5. P0.3 composição PostgreSQL.
6. P0.4 autorização/flags.
7. P0.8 read models e telemetria.
8. P0.6 contrato OpenAPI confiável.
9. P0.5 paridade UI/API.
10. P1.1 e P1.2 administração real.
11. P1.4 inteligência real.
12. P1.3 e P1.5 governança/configurações.
13. P2 reorganização de telas.
14. P3 homologação exaustiva.
15. P4 observabilidade, canário e reavaliação final.

## 9. Critério de conclusão

O SOS Sales só poderá receber `PRODUCTION_READY_IN_AUDITED_SCOPE` quando:

- nenhuma função crítica visível depender de fixture/localStorage;
- nenhum botão produzir sucesso sem efeito confirmado;
- todas as rotas produtivas usarem runtime/gateways injetados;
- autenticação e tenant isolation forem verificadas por endpoint;
- jornadas críticas tiverem E2E real autorizado;
- inventário de telas estiver 100% classificado com evidência atual;
- não houver finding CRITICAL/HIGH aberto sem restrição formal aceita.
