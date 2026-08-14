# Prompt para Gemini 3.7 — Construção do Frontend Sales OS

Você é o programador principal do frontend do **Sales OS / TX Commercial Core**. Trabalhe no repositório:

`/Users/franciscotaveira.ads/Projetos/new-sales-os`

Codex é o supervisor técnico. Não faça push, merge, deploy, commit, alteração de migrations, refatoração do backend, alteração de Docker/WAHA/Supabase ou uso de credenciais reais sem autorização explícita.

## 1. Missão

Construir um frontend navegável, responsivo e testável para o primeiro cockpit operacional do Sales OS. O produto ajuda equipes pequenas a não perderem contexto e timing em vendas pelo WhatsApp.

O frontend deve responder três perguntas:

1. **Agora:** o que exige ação humana?
2. **Conversa viva:** o que aconteceu e qual é o próximo passo seguro?
3. **Prova de resultado:** o tráfego e o atendimento produziram resultado?

Não construir um CRM genérico, dashboard enciclopédico ou painel de IA. A conversa é o centro do produto.

## 2. Leitura obrigatória antes de escrever código

Leia integralmente:

- `docs/P0_6_OPERATOR_COCKPIT_UX_BLUEPRINT.md`
- `docs/GEMINI_PROJECT_COMPLETION_HANDOFF.md`
- `docs/P0_4_HANDOFF_SUPERVISED_EXECUTION_PLAN.md`
- `docs/WABA_EXTRACTION_BLUEPRINT.md`
- migrations em `supabase/migrations/`
- portas e DTOs existentes em `src/application/ports/`, `src/application/usecases/` e `src/interfaces/http/`

Depois execute:

```bash
git status --short --branch
git diff --check
npm run check
npm run build
```

Preserve todo trabalho local existente. Não use reset, checkout destrutivo, clean ou stash.

## 3. Fluxo gstack obrigatório

Antes de implementar:

1. Rode `/gstack-autoplan` usando este documento como plano-base.
2. Rode `/gstack-plan-design-review` para revisar linguagem visual, hierarquia e acessibilidade.
3. Rode `/gstack-plan-eng-review` para revisar fronteiras frontend/API, estados e testes.
4. Apresente o plano final e a lista de arquivos que pretende criar.

Durante e depois:

5. Rode `/gstack-review` sobre o diff.
6. Rode `/gstack-qa` no frontend em execução e capture evidências visuais desktop/mobile.
7. Use `/gstack-ship` somente como checklist de prontidão. Não publique nada.

Se alguma skill não estiver disponível, documente isso e faça a revisão equivalente manualmente. Nunca invente uma execução.

## 4. Isolamento de trabalho

Crie uma branch a partir do HEAD atual:

`gemini/p0-6-operator-cockpit`

Crie o frontend em `frontend/` como aplicação independente. Não transforme o repositório inteiro em monorepo nesta fatia e não mova o backend.

Stack recomendada:

- React + Vite + TypeScript estrito;
- React Router;
- TanStack Query para estado remoto;
- Zod para contratos de entrada;
- Vitest + React Testing Library;
- Playwright para o Golden Path visual;
- CSS variables + CSS Modules ou stylesheet organizado;
- primitives acessíveis leves quando indispensáveis; não importar um kit visual inteiro.

Não utilizar Ant Design nem copiar componentes/estilos do CRM-TX. Evite Tailwind se ele resultar em markup ruidoso ou identidade genérica. Não adicionar Redux sem necessidade comprovada.

## 5. Processo de design — duas passagens

### Passagem A: direção visual antes do código

Entregue primeiro um documento curto com:

- objetivo da tela e usuário primário;
- paleta de 4–6 cores com nomes e hex;
- tipografia para títulos, corpo e dados;
- escala de espaçamento e raios;
- dois wireframes comparáveis;
- escolha final justificada;
- crítica explícita do que parecia genérico e foi removido;
- assinatura visual: **Linha de Continuidade**, ligando origem → última mensagem → próximo passo.

O produto deve parecer uma bancada de trabalho comercial calma, precisa e confiável. A ousadia visual deve ficar na Linha de Continuidade; o restante deve ser disciplinado.

### Passagem B: construir e criticar novamente

Implemente a direção aprovada, tire screenshots em 1440px, 1024px e 390px, critique carga cognitiva, hierarquia e legibilidade, corrija e repita os testes.

## 6. Arquitetura de informação

### Navegação primária

- `Agora`
- `Conversas`
- `Resultados`

### Navegação secundária

- `Configurações`

Não colocar canal, usuário, segredo, template ou WABA no cockpit de atendimento.

### Rotas iniciais

- `/` redireciona para `/agora`
- `/agora`
- `/conversas/:journeyId?`
- `/resultados`
- `/configuracoes` apenas como shell informativo, sem gestão real nesta fatia

## 7. Tela principal — Cockpit

Desktop:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Sales OS / Agora                 [Workspace]          [Buscar conversa]    │
├───────────────┬────────────────────────────────────┬───────────────────────┤
│ AGORA (3–5)   │ CONVERSA VIVA                      │ CONTEXTO E DECISÃO    │
│ prioridades   │ linha de continuidade              │ origem                │
│ SLA/motivo    │ mensagens                          │ dossiê vivo           │
│ responsável   │ recomendação com evidências        │ próximo passo         │
│ Ver todas →   │ compositor supervisionado          │ estado do canal       │
└───────────────┴────────────────────────────────────┴───────────────────────┘
```

Proporções desktop: fila 24%, conversa 50%, contexto 26%. Somente a conversa tem rolagem longa. O compositor permanece ancorado.

Tablet: contexto vira drawer acessível. Mobile: fluxo Agora → Conversa → Contexto, com compositor fixo e retorno claro.

## 8. Componentes obrigatórios

- `AppShell`
- `WorkspaceSwitcher` visual, sem mutação real
- `PriorityQueue`
- `PriorityItem`
- `ConversationHeader`
- `ContinuityLine`
- `MessageTimeline`
- `MessageBubble`
- `LiveDossier`
- `KnownFactItem` com proveniência
- `RecommendationCard` com evidências
- `SupervisedComposer`
- `ChannelStatus`
- `HandoffControls`
- `OutcomeSummary`
- `TrafficProofView`
- skeletons, empty states, error boundary e offline banner

Cada componente deve ter tipos explícitos, foco visível, semântica HTML e teste de comportamento relevante.

## 9. Sistema visual obrigatório

Tokens base:

```css
--sales-action: #2563eb;
--sales-success: #10b981;
--sales-ai: #7c3aed;
--sales-attention: #d97706;
--sales-blocked: #dc2626;
--sales-ink: #172033;
--sales-surface: #f8fafc;
```

Regras:

- bounded containers com borda visível de 2px, raio 14–16px, cabeçalho explícito e sombra discreta;
- cor representa estado/decisão, nunca decoração;
- máximo de 3–5 itens prioritários por bloco;
- `Ver todas →` para expansão;
- ícone nunca substitui texto;
- não empilhar bordas coloridas em cada microelemento;
- evitar excesso de chips, tags, gradientes, cards dentro de cards e barras de KPI;
- contraste WCAG AA, teclado completo, `prefers-reduced-motion` e foco visível.

## 10. Conteúdo realista para fixtures

Crie fixtures tipadas para dois negócios, sem dados pessoais reais:

1. escovaria: origem CTWA “Escova R$59”, preferência de horário, disponibilidade e handoff;
2. películas automotivas: modelo do veículo, serviço desejado, orçamento e prazo.

As fixtures devem demonstrar:

- conversa aguardando operador;
- conversa em atendimento;
- SLA crítico;
- origem confirmada e origem desconhecida;
- fato confirmado e inferência pendente;
- recomendação com duas evidências;
- ausência de evidência;
- canal saudável e canal pausado;
- ação que exige aprovação;
- outcome ganho e perdido.

Não usar telefone, nome ou conteúdo copiado de clientes reais.

## 11. Contratos e camada de dados

Nesta primeira fatia, use um `MockSalesOsGateway` atrás de interfaces; componentes não podem importar fixtures diretamente. Estruture um futuro `HttpSalesOsGateway` sem ativá-lo.

Defina contratos frontend para:

- prioridade/handoff;
- resumo da jornada;
- mensagem e ciclo de status;
- contexto de aquisição;
- fato conhecido + proveniência/confiança;
- recomendação + evidências + policy status;
- controle de canal/workspace;
- aprovação e execução;
- outcome.

Não invente endpoints como se existissem. Crie `docs/FRONTEND_API_CONTRACT_GAPS.md` listando cada necessidade do frontend e marcando:

- `EXISTS`
- `PARTIAL`
- `MISSING`
- endpoint/use case sugerido
- autorização exigida
- resposta e erros esperados

## 12. Estados que precisam existir visualmente

- loading inicial e incremental;
- fila vazia;
- conversa não selecionada;
- histórico sem mensagens;
- origem desconhecida;
- sem recomendação por falta de evidência;
- API indisponível;
- offline;
- viewer somente leitura;
- handoff pertencente a outro operador;
- canal pausado;
- aprovação pendente;
- envio em andamento, enviado, falhou e retry seguro;
- rascunho preservado após erro.

Erros devem dizer o que aconteceu e a ação possível. Nunca mostrar payload, token, stack trace ou mensagem genérica “erro interno”.

## 13. Golden Path de interação

Automatize com Playwright:

1. operador abre `/agora`;
2. identifica uma prioridade;
3. assume o handoff;
4. lê a origem e os fatos;
5. abre as evidências da recomendação;
6. usa a sugestão como rascunho;
7. edita o texto;
8. confirma destinatário/canal/policy;
9. envia pelo gateway mock;
10. vê o status persistir na timeline;
11. marca um outcome;
12. visualiza a cadeia origem → conversa → ação → resultado.

Teste negativo obrigatório: canal pausado preserva o rascunho, não executa o gateway e mostra quem pausou/quando, sem botão de bypass.

## 14. Critérios de qualidade

Execute e reporte resultados reais:

```bash
cd frontend
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run e2e
```

Também reexecute na raiz:

```bash
npm run check
npm run build
git diff --check
```

Critérios:

- zero erro TypeScript/lint/build;
- testes de componentes e Golden Path verdes;
- nenhuma quebra na suíte backend;
- navegação utilizável em 1440, 1024 e 390px;
- operador assume uma prioridade em até três interações;
- recomendação nunca aparece sem evidência;
- viewer não vê controles operacionais;
- canal pausado impede envio;
- nenhum segredo ou PII real no bundle;
- Lighthouse/accessibility sem erros críticos.

## 15. Fora de escopo

- integração real com WAHA/Meta;
- login real e gestão de usuários;
- envio real de mensagem;
- configuração WABA/templates;
- IA autônoma;
- kanban editável;
- automações visuais;
- relatórios extensos;
- importação de código/CSS do CRM-TX.

## 16. Entrega esperada

Antes de codificar, apresente direção visual e plano. Depois entregue:

1. lista de arquivos criados/alterados;
2. screenshots desktop/tablet/mobile;
3. matriz de estados implementados;
4. mapa de contratos `EXISTS/PARTIAL/MISSING`;
5. testes e comandos com resultados reais;
6. riscos e itens adiados;
7. status do Git;
8. solicitação de revisão do Codex.

Pare antes de commit, push, merge ou deploy.
