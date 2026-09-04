# SOS SALES — CHECKLIST DE MIGRAÇÃO VISUAL SEM QUEBRA FUNCIONAL

Este checklist garante que toda a reestruturação da interface ocorra mantendo 100% dos contratos de dados, regras de negócio e fluxos existentes.

---

## 1. Documentação Prévia
- [x] Criação de `docs/DESIGN.md` com tokens, fontes e paleta semântica.
- [x] Criação de `docs/INFORMATION_ARCHITECTURE.md` com mapa de rotas e RBAC.
- [x] Criação de `docs/RESPONSIVE_BEHAVIOR.md` com matriz de breakpoints e layouts.
- [x] Criação de `docs/UI_MIGRATION_CHECKLIST.md` com etapas de validação.

---

## 2. Tipografia e Design System
- [x] Inclusão das fontes Google no `index.html`: `Sora`, `Source Sans 3` e `IBM Plex Mono`.
- [x] Atualização do `src/index.css` com classes utilitárias semânticas e tokens de cores (`#F5F7FA`, `#FFFFFF`, `#101828`, `#059669`, `#2563EB`, `#7C3AED`, `#D97706`, `#DC2626`, `#0F172A`).
- [x] Ajuste do título da página e metadados no `index.html`.

---

## 3. Sidebar Persistente (`AppShell.tsx`)
- [x] Criar Sidebar persistente com 232px (expandida) e 72px (recolhida), com estado salvo em `localStorage`.
- [x] Agrupar seções: **OPERAÇÃO** (Agora, Conversas, Funil), **GESTÃO** (Resultados, Grupos), **INTELIGÊNCIA** (IA & Playbook, Simulador), **SISTEMA** (Canais, Configurações).
- [x] Incluir badges dinâmicos (contagem de prioridades, grupos com pendência, status de saúde de canais).
- [x] Implementar rodapé da sidebar: Workspace switcher/indicador, Perfil/Role badge, Ajuda e Sair.
- [x] Implementar Drawer acessível em dispositivos móveis e navegação por teclado (`aria-current="page"`).

---

## 4. Topbar Simplificada
- [x] Manter apenas: Workspace switcher, Campo de busca global, Status de saúde do canal WhatsApp, Notificações com popover e Perfil de usuário.
- [x] Remover abas principais de navegação da topbar (migradas para a sidebar).
- [x] Remover alternâncias artificiais de QA e termos técnicos do header.

---

## 5. Módulo de Canais WhatsApp (`CanaisView.tsx`)
- [x] Criar tela dedicada `CanaisView` ou reestruturar aba Canais.
- [x] Exibir WhatsApp Oficial (Meta Cloud API / WABA) e WhatsApp Conectado (Instância WAHA).
- [x] Indicadores de saúde, latência, reconexão, pausa de canal com modal de confirmação e diagnóstico rápido.
- [x] Seção `Avançado` (Roteamento híbrido, provider switch e logs) restrita para Owner/Admin.

---

## 6. Faixa de Continuidade Comercial (`ContinuityRibbon.tsx`)
- [x] Substituir o bloco alto por uma faixa compacta de até 120px fechada.
- [x] 3 etapas conectadas: **Origem confirmada**, **Desejo atual**, **Próximo passo seguro**.
- [x] Estados visuais claros: `confirmado`, `inferido`, `aguardando`, `bloqueado`.
- [x] Botão de ação rápida "Aplicar ao rascunho" e modal/popover de evidências auditáveis.

---

## 7. Dossiê Vivo Simplificado (`LiveDossier.tsx`)
- [x] Visão inicial compacta com 3 pontos essenciais: Objetivo atual, Fricção ativa e Próximo passo/prazo.
- [x] Drawer / Painel completo expansível com os 5 blocos: Objetivo, Fatos Confirmados, Fricções, Último Combinado, Responsável e Prazo, Memórias IA e Evidências.

---

## 8. Integração da Sugestão IA ao Composer (`SupervisedComposer.tsx`)
- [x] Inserir barra compacta de sugestão do copilot acoplada ao topo do composer.
- [x] Ações rápidas: `Usar sugestão`, `Editar`, `Ver evidências`, `Dispensar`.
- [x] Painel expansível com texto sugerido, nível de confiança %, política comercial aplicada e evidências.
- [x] Manter guardrail comercial, atalhos de barra (`/`) e botão "SOS Destravar Venda".

---

## 9. Redução de Densidade da Fila de Prioridades (`PriorityQueue.tsx` e `PriorityItem.tsx`)
- [x] Exibir cartões de prioridade limpos: Nome + Avatar, Última intenção/mensagem, Badge SLA com temporizador, Motivo da urgência, Responsável e 1 CTA principal.
- [x] Foco inicial de 3 a 5 itens prioritários com link "Ver todas as conversas →".

---

## 10. Responsividade do Cockpit (`CockpitView.tsx`)
- [x] Desktop amplo (≥1280px): 3 colunas simultâneas (Fila 280-320px, Chat flexível, Dossiê 360-400px).
- [x] Notebook (1024-1279px): Chat principal com gavetas recolhíveis para Fila e Dossiê.
- [x] Mobile/Tablet (<1024px): Navegação focada de 1 região por vez (Fila ➔ Chat ➔ Dossiê) com preservação de scroll e contexto.

---

## 11. Validação, Testes e Relatório Final
- [x] Executar typecheck e linting (`npm run lint`).
- [x] Executar build de produção (`npm run build`).
- [x] Gerar screenshots e evidências de renderização nas resoluções 1440, 1280, 1024 e 390 px.
- [x] Produzir `docs/UI_UX_REORGANIZATION_REPORT.md` detalhado.
