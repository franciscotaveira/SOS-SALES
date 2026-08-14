# SOS SALES — ARQUITETURA DA INFORMAÇÃO & HIERARQUIA DE NAVEGAÇÃO

## 1. Organização Estrutural por Pilares de Domínio

A navegação foi reorganizada em 4 pilares funcionais inequívocos, eliminando o atrito entre operação diária e infraestrutura técnica:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                               SOS SALES                                  │
├─────────────────┬─────────────────┬───────────────────┬───────────────────┤
│   1. OPERAÇÃO   │   2. GESTÃO     │  3. INTELIGÊNCIA  │    4. SISTEMA     │
│   (Atendimento) │  (Resultados)   │  (Playbook & IA)  │ (Conexão & Infra) │
├─────────────────┼─────────────────┼───────────────────┼───────────────────┤
│ • Agora         │ • Resultados    │ • IA & Playbook   │ • Canais          │
│ • Conversas     │ • Grupos        │ • Simulador       │ • Configurações   │
│ • Funil         │                 │                   │                   │
└─────────────────┴─────────────────┴───────────────────┴───────────────────┘
```

---

## 2. Mapa de Rotas e Telas

### Grupo 1: OPERAÇÃO (Uso Contínuo pelo Operador)
- **`agora` (Agora / Cockpit de Prioridades)**:
  - Fila de 3 a 5 atendimentos mais urgentes ordenados por SLA e calor de conversação.
  - Conversa 1:1 supervisionada com `ContinuityRibbon` característico.
  - Composer integrado com sugestão de copilot inline (`SupervisedComposer`).
  - Dossiê Vivo de Decisão (`LiveDossier`) com drawer expansível.
- **`conversas` (Todas as Conversas)**:
  - Lista completa de contatos e leads com busca por texto, telefone, canal e etiqueta.
  - Filtros por etapa do funil e status de atendimento.
- **`kanban` (Funil Comercial)**:
  - Visualização em colunas: Qualificação, Oferta/Orçamento, Agendamento, Fechamento e Pós-Venda.
  - Arrastar e soltar para atualização instantânea de estágio.
  - Protegido por feature flag `commercial_kanban`.

### Grupo 2: GESTÃO (Controle Gerencial & Agência)
- **`resultados` (Prova de Tráfego & ROAS)**:
  - Painel de atribuição ponta a ponta: Anúncio Meta CTWA ➔ WhatsApp ➔ Vendas Ganhas.
  - Métricas financeiras (Receita, Gasto CTWA, CPL, ROAS Comercial).
  - Trilha de auditoria e governança.
  - Protegido por feature flag `traffic_proof` e perfil Owner para dados financeiros.
- **`grupos` (Grupos da Agência)**:
  - Hub de acompanhamento de grupos WhatsApp compartilhados com clientes.
  - Monitor de mensagens não lidas e solicitações de atendimento pendentes.
  - Protegido por feature flag `agency_groups`.

### Grupo 3: INTELIGÊNCIA (Automação & Supervisão IA)
- **`ia_playbook` (IA & Playbook Comercial)**:
  - Tese de atendimento 24/7 (ancoragem de valor, perguntas de avanço, quebra de objeções).
  - Configuração de guardrails de desconto e alçadas comerciais.
  - Simulador interativo da tese de vendas.
- **`simulador` (Simulador de QA & Resiliência)**:
  - Injeção de mensagens de lead em tempo real.
  - Teste de failover e simulação de falhas de rede.
  - Validação de políticas de conformidade.

### Grupo 4: SISTEMA (Infraestrutura & Configuração)
- **`canais` (Canais WhatsApp)**:
  - Visão unificada: WhatsApp Oficial (Meta Cloud API / WABA) e WhatsApp Conectado (Instância WAHA).
  - Status de saúde, latência de ping e reconexão.
  - Pausa de canal com guarda de segurança.
  - Seção `Avançado` (Roteamento híbrido, provider switch e logs de transição) restrita para Owner/Admin.
- **`configuracoes` (Configurações do Workspace)**:
  - Gestão de assentos de operadores e permissões de acesso.
  - Políticas de governança, SLA e privacidade LGPD.
  - Gerenciador de Feature Flags & Módulos.

---

## 3. Matriz de Acesso por Papel (RBAC)

| Rota / Recurso | Owner | Supervisor / Admin | Operador | Viewer (Somente Leitura) |
| :--- | :---: | :---: | :---: | :---: |
| **Agora (Cockpit)** | Total | Total | Total | Leitura apenas |
| **Conversas** | Total | Total | Total | Leitura apenas |
| **Funil Kanban** | Total | Total | Total | Leitura apenas |
| **Resultados (ROAS & Finanças)** | Total (visível) | Métricas operacionais | Oculto / Restrito | Oculto |
| **Grupos da Agência** | Total | Total | Atendimento | Leitura apenas |
| **IA & Playbook** | Edição de Tese | Edição de Guardrails | Leitura | Leitura |
| **Canais (Básico / Status)** | Total | Total | Leitura | Leitura |
| **Canais (Avançado / Roteamento)** | Total | Total | Oculto | Oculto |
| **Feature Flags** | Total | Total | Oculto | Oculto |
