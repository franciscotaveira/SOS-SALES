# Especificação Funcional e UX

## 1. Mapa de navegação

```text
Autenticação
└── Workspace ativo
    ├── Cockpit / Inbox
    ├── Contatos
    ├── Oportunidades
    ├── Produtos e Catálogo
    ├── Modelos WABA e Flows
    ├── Conversões
    └── Configurações
        ├── Empresa e equipe
        ├── Canais WhatsApp
        ├── Cobrança Pix
        ├── Integrações: API, webhooks e n8n
        └── Segurança / Zona de perigo
```

## 2. Cockpit

### Lista de conversas

- mostrar nome, telefone, prévia, horário, canal e estado;
- filtros: abertas, atenção, todas e fechadas;
- busca imediata;
- estados vazios explicativos;
- atualização com indicador e erro visível.

### Timeline

- texto, imagem, áudio, documento e eventos comerciais;
- status de envio e falha;
- composer com rascunho isolado por thread;
- anexos com validação de tamanho e tipo;
- ações rápidas: catálogo, proposta, Pix, próxima ação e Radar.

### Contexto do lead

O comando deve usar texto claro, como **“Contexto do lead”**, e abrir:

- contato e origem;
- etapa e valor;
- propostas;
- cobranças;
- jornada e histórico;
- próxima ação;
- observações e tags.

## 3. Contatos

Cada linha abre uma ficha editável. A ficha deve permitir:

- alterar dados básicos;
- adicionar empresa, e-mail, tags e observações;
- abrir conversa associada;
- ver oportunidades e histórico;
- desativar automações sem excluir o contato;
- reativar posteriormente;
- manter exclusão física restrita e auditada.

## 4. Funil

- card clicável com detalhes e ações;
- drag-and-drop com alternativa acessível por botão;
- mudança otimista somente com rollback em falha;
- confirmação para ganho/perda;
- valores e contagens recalculados após mutação;
- paginação/virtualização acima do limite operacional.

## 5. Catálogo

- lista com imagem, título, SKU, categoria, preço e status;
- criar, editar, ativar e inativar;
- prevenir duplicidade por SKU no workspace;
- produtos fictícios nunca entram no ambiente do cliente;
- importação futura por CSV/API;
- uso direto em proposta e conversa.

## 6. Templates WABA

Fluxo orientado:

1. selecionar objetivo;
2. explicar `utility`, `marketing` e `authentication`;
3. gerar rascunho por IA opcional;
4. editar cabeçalho, corpo, rodapé, variáveis e botões;
5. pré-visualizar;
6. validar regras conhecidas;
7. submeter à Meta;
8. acompanhar pendente, aprovado ou rejeitado.

A IA deve explicar o motivo das sugestões e não ocultar que a aprovação é da Meta.

## 7. Conversões

- distinguir `capturado`, `elegível`, `enfileirado`, `aceito`, `falhou` e `não aplicável`;
- apresentar recibo e causa da falha;
- estado vazio deve ensinar como uma conversão nasce;
- atualização deve buscar dados novamente e informar o horário.

## 8. Regras de UX

1. Ícone sem texto somente quando universal e acompanhado de tooltip.
2. Ação crítica possui nome, confirmação e consequência explícita.
3. Loading, vazio, erro, parcial e sucesso são estados diferentes.
4. Nunca mostrar dado mock como dado do cliente.
5. Termos técnicos (`RLS`, tenant, CAPI) ficam na área administrativa ou com tradução.
6. Mobile deve preservar atendimento, contexto e próxima ação.
