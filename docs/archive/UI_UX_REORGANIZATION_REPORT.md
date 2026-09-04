# SOS Sales — Relatório de Reorganização Visual e de Arquitetura da Informação

## 1. Princípio Norteador: "Poder Invisível, Simplicidade Visível"
A reformulação da interface do SOS Sales transformou um cockpit anteriormente sobrecarregado por painéis simultâneos e termos técnicos em uma experiência operacional enxuta, intuitiva e focada na continuidade da conversa e conversão comercial.

---

## 2. Nova Arquitetura de Navegação (5 Pilares de Domínio)

### 2.1 Sidebar Persistente (232px expandida / 72px recolhida)
A navegação foi agrupada em 4 seções temáticas claras, com estado recolhido/expandido persistido no `localStorage`:

1. **OPERAÇÃO**
   - **Agora (`/agora`)**: O Cockpit de atendimento 1:1, prioridades imediatas, Linha de Continuidade (`ContinuityRibbon`), compositor supervisionado com Copilot e Dossiê Vivo.
   - **Conversas (`/conversas`)**: Lista completa e paginada de todas as conversas ativas e históricas, com busca avançada e filtros por canal, status e operador.
   - **Funil (`/kanban`)**: Kanban comercial visual de estágios de compra, permitindo mover oportunidades entre etapas com contadores e somatórios financeiros.

2. **GESTÃO**
   - **Resultados (`/resultados`)**: Proof of Traffic e atribuição ponta a ponta de anúncios Meta CTWA, cálculo de ROAS, faturamento confirmado e eficiência de mídia paga.
   - **Grupos da agência (`/grupos`)**: Monitoramento de múltiplos grupos de WhatsApp com clientes e agência, alertas de SLA de resposta e saúde de engajamento.

3. **INTELIGÊNCIA**
   - **IA & Playbook (`/playbook`)**: Gestão de tese comercial 24/7, parâmetros de tom de voz, limites de desconto, quebra de objeções e diretrizes de qualificação.
   - **Simulador (`/simulador`)**: Ambiente seguro de QA e estresse para injetar mensagens simuladas, testar quebra de regras e simular quedas de rede antes de produção.

4. **SISTEMA**
   - **Canais (`/canais`)**: Gestão unificada das instâncias WhatsApp (Meta Cloud API WABA e WAHA Core Engine), teste de diagnóstico, QR Code, reconexão e status de latência. Configurações avançadas e logs restritos a Owners/Admins.
   - **Configurações (`/configuracoes`)**: Membros da equipe, papéis e permissões (RBAC), webhooks e integrações de CRM.

---

## 3. Simplificação da TopBar
A TopBar foi totalmente despoluída de rotas de navegação e termos técnicos, mantendo exclusivamente:
- **Workspace Switcher**: Alternância rápida de marcas e clientes da agência.
- **Busca Rápida / Command Palette (`Ctrl + K`)**: Atalho de teclado para localizar qualquer lead ou atalho instantaneamente.
- **Saúde do Canal WhatsApp**: Indicador em tempo real (Online, latência de 42ms ou Pausado).
- **Central de Notificações / Alertas de SLA**: Badges e avisos discretos de conversas que exigem atenção imediata.
- **Seletor de Papel / Perfil**: Alternância suave de contexto de permissão (Operador, Supervisor, Owner) e guia rápido de atalhos.

---

## 4. Reestruturação do Cockpit Operacional

### 4.1 Linha de Continuidade Compacta (`ContinuityRibbon`)
- Substituiu o bloco vertical anterior por uma faixa compacta de até 110px de altura.
- Exibe o fluxo inquebrável em 3 etapas:
  1. **Origem**: Anúncio Meta CTWA ou entrada direta confirmada.
  2. **Desejo Atual**: A última fala preservada do lead.
  3. **Próximo Passo Seguro**: Ação recomendada e validada pelo guardrail de política comercial.
- Acesso instantâneo a evidências detalhadas em modal sem sair do chat.
- Botão direto "Usar rascunho" para preencher o composer com 1 clique.

### 4.2 Compositor Supervisionado com Copilot Integrado
- O card de recomendação da IA foi reposicionado diretamente acima do campo de digitação em uma faixa visual discreta.
- Permite ao operador:
  - Aplicar sugestão com 1 clique (`Usar Sugestão`).
  - Abrir modal de evidências com citação de regras de compliance.
  - Expandir a tese comercial da IA ou dispensar a recomendação.
  - Inserir macros comerciais com o atalho `/`.

### 4.3 Dossiê Vivo de Decisão (`LiveDossier`)
- Estruturado em blocos colapsáveis com destaque prioritário para:
  1. Objetivo Principal do Cliente
  2. Fatos Confirmados (com badges de confiança e origem)
  3. Fricções & Objeções Ativas
  4. Último Combinado Comercial
  5. Responsável & Prazo de SLA
- Suporte a toggle de recolhimento no desktop para maximizar a área da conversa central quando necessário.

---

## 5. Responsividade e Adaptação
- **Desktop Amplo (≥1280px)**: Grid equilibrado (Fila 24%, Conversa Central 50-60%, Dossiê Vivo 26%).
- **Notebook / Telas Médias**: Conversa central fixa com suporte a recolher Fila e Dossiê.
- **Mobile / Tablet (<1024px)**: Abas inferiores compactas para navegar por uma região de cada vez (`Fila` ➔ `Conversa` ➔ `Dossiê Vivo`), garantindo ergonomia em telas de toque.

---

## 6. Acessibilidade e Design System
- **Tipografia**: Sora para títulos e cabeçalhos de impacto, Source Sans 3 para leitura fluida de mensagens, e IBM Plex Mono para identificadores, SLAs e métricas.
- **Paleta de Cores**: Neutros sofisticados (`#F8FAFC`, `#0F172A`, `#1E293B`) com acentos funcionais de alta legibilidade (Verde WhatsApp `#00A884`, Roxo IA `#7C3AED`, Azul Metadados `#2563EB`, Âmbar SLA `#D97706`).
- **Contraste & Foco**: Atende às diretrizes WCAG AA (mínimo 4.5:1), navegação fluida por teclado e suporte a `prefers-reduced-motion`.
