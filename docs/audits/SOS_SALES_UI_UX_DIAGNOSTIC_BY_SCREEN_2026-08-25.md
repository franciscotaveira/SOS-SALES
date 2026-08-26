# SOS Sales — Diagnóstico UI/UX por tela

> Data: 25 ago 2026
> Método: código atual + capturas autenticadas do release `e773ec7`
> Escopo desta rodada: diagnóstico completo para PC e notebook
> Regra: diagnóstico read-only; nenhum código ou VPS alterado.

## Convenção de evidência

- **[PRODUÇÃO OBSERVADA]:** comportamento confirmado na sessão autenticada do release `e773ec7`.
- **[CÓDIGO LOCAL]:** comportamento encontrado no checkout atual, ainda sem homologação nesta rodada.
- **[KNOWN]:** produção e código convergem ou o fato independe da versão.

## Critério

Cada elemento recebe uma decisão objetiva:

- **MANTER:** precisa ficar visível no fluxo principal.
- **RECOLHER:** continua disponível, mas sob menu, filtro ou expansão.
- **REALOCAR:** existe, mas está no contexto errado.
- **CORRIGIR:** posição está aceitável, porém o estado induz erro ou perde usabilidade.

## 1. Estrutura global — `AppShell`

### Diagnóstico

[KNOWN] A sidebar possui até oito destinos principais e ainda expande submenus de Inteligência, Grupos, Campanhas e Configurações. As mesmas subcategorias reaparecem como abas dentro das páginas.

[PRODUÇÃO OBSERVADA] A sessão rotulada como operador recebeu acessos administrativos.

[CÓDIGO LOCAL] O checkout atual já possui `hasRoleAccess`, filtra a sidebar e a busca por hierarquia e remove o acesso independente a Anotações. Essa é uma correção local ainda não homologada; não deve ser duplicada nem considerada implantada.

[KNOWN] O rodapé reúne troca de workspace, status WhatsApp, alteração global da IA e perfil. Isso mistura contexto, telemetria, configuração e identidade.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Agora, Conversas, Grupos e Agenda | MANTER | Operação diária permanece no menu. |
| Anotações | REALOCAR | Remover da sidebar; já existe como modo de Conversas. |
| Clientes, Campanhas e Inteligência | CORRIGIR | Exibir somente para admin/owner. |
| Configurações | CORRIGIR | Exibir somente para owner ou permissão administrativa explícita. |
| Submenus inline da sidebar | RECOLHER | Manter subnavegação dentro das páginas e acesso direto pela busca; não duplicar nos dois lugares. |
| Status WhatsApp | MANTER | Tornar clicável para abrir Configurações > Canais e exibir horário da última confirmação. |
| Alternância global da IA | REALOCAR | Sidebar mostra apenas o estado; alteração fica em Inteligência, com permissão e auditoria. |
| Workspace e perfil | MANTER | Continuam no rodapé, sem indicadores adicionais. |

### Prioridade

- `P0`: homologar o filtro por papel já existente no checkout, incluindo acesso por URL e busca; ocultar menu não substitui autorização da API.
- `P1`: homologar a remoção de Anotações duplicada já presente no checkout.
- `P2`: retirar submenus duplicados da sidebar.
- `P2`: transformar autonomia da IA em indicador read-only.

## 2. Agora — cockpit de atendimento

### Diagnóstico

[KNOWN] A tela apresenta simultaneamente meta diária, filtros da fila, lista de contatos, conversa, alerta de reativação, ações de estágio/desfecho/dossiê/limpeza, recomendação da IA, objeções rápidas, atalhos, anexo, áudio, composer e Atlas flutuante.

[KNOWN] O cabeçalho oferece uma ação destrutiva de limpeza no mesmo nível das ações operacionais.

[KNOWN] O composer mantém muitas ferramentas expostas antes de o operador escrever. Atalhos e objeções cumprem funções semelhantes.

[KNOWN] O checkout atual já contém controle do Receptionist no topo do `LiveDossier`; não é necessário criar outra área para o bot.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Fila, conversa e composer | MANTER | São o núcleo da tela. |
| Identidade, telefone, origem e etapa | MANTER | Permanecem no cabeçalho da conversa. |
| Meta do dia e faturamento | REALOCAR | Mover para Gestão de Campanhas/Resultados; no Agora, mostrar apenas se houver meta real e configurada. |
| Filtros Todas/Fila/Ativas | MANTER | São filtros operacionais imediatos. |
| Recorrentes/Novos Leads | RECOLHER | Colocar em `Mais filtros`; não precisam ocupar a primeira dobra. |
| Desfecho | RECOLHER | Manter em ação contextual da etapa ou menu de ações; não precisa estar permanente. |
| Dossiê | MANTER | Um único botão abre/recolhe o painel existente. |
| Limpar conversa | REALOCAR | Menu `… > Ações avançadas`, com permissão e confirmação reforçada. |
| Reativação de lead | MANTER CONDICIONAL | Só aparece quando a condição for real; deve desaparecer nos demais casos. |
| Próximo movimento sugerido | MANTER | Uma recomendação curta e uma ação `Usar resposta`. |
| Objeções rápidas | RECOLHER | Integrar ao popover `Atalhos`; remover a segunda faixa permanente. |
| Anexo, áudio, texto e enviar | MANTER | Permanecem na linha principal do composer. |
| Pix, endereço e outros atalhos comerciais | CORRIGIR | Exibir somente quando houver configuração publicada e válida. |
| Atlas flutuante | REALOCAR | Abrir pelo topbar ou gaveta; nunca cobrir composer ou controles. |
| Receptionist | MANTER | Controle no dossiê; três estados textuais e erro explícito. |

### Regra de primeira dobra

Em PC e notebook, a primeira dobra precisa conter somente:

1. fila e busca;
2. identidade/etapa da conversa;
3. mensagens;
4. próximo movimento;
5. composer e envio.

Todo o restante continua acessível, mas não compete permanentemente pela atenção.

### Prioridade

- `P0`: quando o canal não estiver confirmado, bloquear envio e explicar o motivo no composer.
- `P0`: ocultar atalhos com dados comerciais não publicados.
- `P1`: mover limpeza para ações avançadas.
- `P1`: consolidar objeções dentro de Atalhos.
- `P2`: retirar a meta financeira da operação diária.
- `P2`: mover Atlas para uma gaveta sem sobreposição.

## 3. Conversas & Funil

### Diagnóstico

[KNOWN] Antes da primeira conversa, a tela apresenta título, contador, quatro modos, Novo Lead, atualizar, seis filtros de etapa, busca e múltiplos filtros de serviço.

[KNOWN] Anotações já é um modo interno, confirmando que o acesso independente da sidebar é redundante.

[KNOWN] Em mobile, `Novo Lead` foi cortado; no Kanban, zeros aparecem durante o carregamento; Torre TV usa fallback narrativo como se fosse tempo real.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Lista e Funil Kanban | MANTER | Permanecem como os dois modos principais. |
| Anotações | MANTER SECUNDÁRIO | Fica dentro de Conversas; pode entrar no menu `Mais` em notebook. |
| Torre TV | CORRIGIR / RECOLHER | Visível somente para gestor e somente com feed real; caso contrário, estado indisponível. |
| Novo Lead | MANTER | Única CTA primária do cabeçalho. |
| Atualizar | RECOLHER | Ícone em menu secundário ou atualização automática com estado visível. |
| Busca | MANTER | Sempre visível. |
| Etapas do funil | MANTER | Uma única linha, com rolagem interna apenas quando necessário. |
| Filtros por serviço | RECOLHER | Botão `Filtros` com contador de filtros ativos. |
| Badges `Click WA` e `Atendimento Comercial` repetidos | RECOLHER | Exibir apenas quando diferenciam a conversa; remover repetição sem valor. |
| Abrir Cockpit | MANTER | Ação explícita no item; a linha inteira também pode ser clicável sem remover o botão. |
| Zero durante carregamento | CORRIGIR | Usar skeleton/loading; zero somente após resposta confirmada. |

### Hierarquia recomendada sem redesenho

1. Cabeçalho: Lista/Funil, Novo Lead e busca.
2. Linha secundária: etapas do funil e botão Filtros.
3. Conteúdo: lista ou Kanban.
4. `Mais`: Anotações, Torre TV e atualizar.

### Prioridade

- `P0`: proibir Torre TV fictícia.
- `P1`: corrigir zero transitório do Kanban.
- `P1`: garantir Novo Lead visível em notebook.
- `P2`: recolher filtros de serviço e modos secundários.

## 4. Agenda

### Diagnóstico

[KNOWN] O cabeçalho combina quatro modos de visualização, acesso à agenda externa e criação de agendamento. Logo abaixo, quatro KPIs ocupam a primeira dobra antes dos compromissos.

[KNOWN] As visualizações estão presas a agosto de 2026 e o botão Hoje não usa a data corrente. Isso invalida qualquer refinamento apenas visual.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Lista, Dia, Semana e Mês | MANTER | Permanecem como modos da mesma Agenda. |
| Novo Agendamento | MANTER | Única CTA primária do cabeçalho. |
| Agenda externa | RECOLHER | Ação secundária no menu `Mais` ou dentro do formulário de agendamento. |
| Badge `Grade Ativa` | RECOLHER | Mostrar somente se representar uma sincronização confirmada; caso contrário, remover. |
| KPIs financeiros e operacionais | REALOCAR | Gestão/Resultados; na Agenda, mostrar apenas quantidade e conflito quando forem úteis à operação. |
| Alarmes e follow-ups do dia | MANTER | Devem aparecer antes dos compromissos somente quando existirem. |
| Datas fixas | CORRIGIR | Usar data atual e timezone do workspace em todas as visões. |
| Falha ao salvar | CORRIGIR | Manter modal aberto, preservar dados digitados e oferecer retry; nunca inserir registro local como sucesso. |

### Prioridade

- `P0`: remover relógio/data hardcoded.
- `P0`: eliminar sucesso local quando a API falha.
- `P1`: manter Novo Agendamento como única CTA primária.
- `P2`: retirar KPIs de gestão da primeira dobra.

## 5. Anotações

### Diagnóstico

[KNOWN] O módulo já renderiza dentro de Conversas, mas também possui destino próprio na sidebar. O acesso é duplicado; o componente não precisa ser refeito.

[KNOWN] Na falha de `createNote`, a UI cria `note-${Date.now()}`, fecha o modal e apresenta a anotação como persistida.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Anotações globais e scripts | MANTER | Permanecem como modo secundário de Conversas. |
| Acesso pela sidebar | REALOCAR | Remover; busca global abre Conversas > Anotações. |
| Nova Anotação / Script | MANTER | CTA principal quando o modo estiver ativo. |
| Categorias e busca | MANTER | Uma linha de filtro; em notebook, categorias excedentes entram em `Mais filtros`. |
| Fixar e copiar | MANTER | Ações úteis no cartão. |
| Excluir | RECOLHER | Menu `…` do cartão, com confirmação e resposta real da API. |
| Nota de cliente | REALOCAR | Dossiê do contato; não misturar com scripts e atas globais. |
| Fallback local | CORRIGIR | Em modo API, erro permanece erro; modal não fecha e nenhum cartão é fabricado. |

### Prioridade

- `P0`: remover persistência fictícia.
- `P1`: retirar acesso duplicado da sidebar.
- `P1`: separar nota global de nota vinculada ao cliente.
- `P2`: recolher exclusão e filtros menos usados.

## 6. Grupos

### Diagnóstico

[KNOWN] A tela reúne Conversas, Monitor, Torre TV, resumo de IA, alternância de motor, tarefas, configurações e disparo em lote.

[KNOWN] O Monitor contém valores fabricados: base mínima de 140 mensagens, texto fixo de 12 grupos, SLA de 11 minutos e resolução de 94,8%.

[KNOWN] O Broadcast de grupos altera apenas estado local e apresenta sucesso. Existe outro Broadcast em Gestão de Campanhas.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Conversas de grupos | MANTER | Modo principal do módulo. |
| Monitor | MANTER CONDICIONAL | Somente métricas calculadas de dados reais e com população visível. |
| Torre TV | RECOLHER | Gestor/admin, dentro de `Mais`; ocultar quando não houver feed real. |
| Resumo inteligente | RECOLHER | Iniciar fechado e exibir apenas com grupos/dados reais. |
| Broadcast de grupos | REALOCAR | Remover desta tela; Gestão de Campanhas > Broadcast seleciona audiência de grupos. |
| Alternância WAHA/WABA por grupo | REALOCAR | Configurações > Canais > Avançado; não é ação cotidiana do operador. |
| Tarefas e handoff | MANTER | Permanecem contextuais ao grupo selecionado. |
| Resposta rápida | CORRIGIR | Estado `enviando → confirmado/falhou`; não atualizar conversa antes da confirmação. |
| KPIs fixos | CORRIGIR | Sem dados, mostrar estado vazio; nunca usar números de base. |

### Prioridade

- `P0`: eliminar KPIs e população fictícios.
- `P0`: remover sucesso simulado do Broadcast e de respostas.
- `P1`: centralizar Broadcast em Gestão de Campanhas.
- `P1`: mover alternância de motor para Configurações.
- `P2`: recolher Torre TV e resumo inteligente.

## 7. Gestão de Campanhas

### Diagnóstico

[KNOWN] O módulo reúne sete abas: Analytics, Campanhas/Anúncios, Broadcast, Links/QR Codes, Templates WABA, Tracking/Pixels e Matriz LTV. Ele mistura três naturezas distintas: leitura de desempenho, execução de comunicação e configuração técnica.

[PRODUÇÃO OBSERVADA] Analytics retornou falha de autorização, mas continuou exibindo cartões com linguagem conclusiva. Templates e Tracking também falharam no backend enquanto partes da interface comunicavam estados operacionais. Broadcast recebeu audiência zero e dependência de endpoint indisponível.

[CÓDIGO LOCAL] `ManagerDashboardView` possui estado de erro, mas não o renderiza; continua montando toda a narrativa com um objeto vazio. `TrackingSettings` recorre a dados locais/defaults quando a API falha. `LtvConfigManager` persiste exclusivamente no `localStorage` e carrega regras padrão de vários segmentos como se fossem configuração do workspace.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Analytics & ROI | MANTER CONDICIONAL | Manter como visão de gestão, mas renderizar erro/sem dados antes dos cartões e remover rótulos conclusivos sem amostra. |
| Campanhas & Anúncios (CTWA) | MANTER | É a leitura de atribuição mais coerente; preservar fonte, período e estados `Não importado`/`Não calculável`. |
| Broadcast | MANTER | Central único para audiências 1:1 e grupos; mostrar contagem real antes de habilitar envio. |
| Links & QR Codes | MANTER | Ferramenta de execução de campanha; número e canal precisam vir da conexão confirmada. |
| Templates WABA | MANTER | Biblioteca oficial; presets são apenas exemplos para criação, nunca templates aprovados. |
| Tracking & Pixels | REALOCAR | Mover o componente existente para Configurações > Integrações. Não pertence ao consumo diário de resultados. |
| Matriz LTV & Retenção | REALOCAR | Mover o componente existente para Configurações > Regras Comerciais. Não é resultado; é regra de automação. |
| Navegação de sete abas | RECOLHER | Após as duas realocações, manter cinco abas na página. Na sidebar, somente o destino Gestão de Campanhas. |
| Atualizar/sincronizar | RECOLHER | Uma ação contextual por aba; não repetir controles globais. |
| Exclusões e envios | CORRIGIR | Exigir confirmação real, permissão e resposta do servidor; sem sucesso por atualização local. |

### Prioridade

- `P0`: falha/401/404 deve substituir os dados, não coexistir com narrativa de sucesso.
- `P0`: Broadcast permanece bloqueado quando a audiência não é confirmada.
- `P0`: presets locais não podem aparecer como aprovados pela Meta.
- `P1`: mover Tracking e LTV sem reescrever os componentes.
- `P2`: reduzir a navegação para cinco abas e abreviar rótulos em notebook.

## 8. Inteligência

### Diagnóstico

[KNOWN] O módulo possui Diagnóstico, Base de Conhecimento, Catálogo, Tese Comercial, Aprendizado, Dados da Empresa e Agente. As áreas formam um bom conjunto funcional, mas configuração empresarial, curadoria de IA e operação do agente aparecem no mesmo nível.

[CÓDIGO LOCAL] O bundle de inteligência nasce de fixtures por empresa e é persistido no `localStorage`. Aprovar/rejeitar aprendizado, editar documentos, catálogo, empresa e agente altera apenas esse bundle do navegador.

[CÓDIGO LOCAL] O cabeçalho sempre exibe “Agente IA Dedicado” e “WhatsApp Oficial Conectado”, independentemente de uma verificação de runtime, e oferece troca de workspace dentro do próprio módulo.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Diagnóstico histórico | MANTER | Visão administrativa de leitura, com período, fonte e última atualização. |
| Base de Conhecimento | MANTER | Um único repositório operacional; documento local precisa ser identificado como rascunho. |
| Catálogo de produtos/serviços | MANTER | Fonte de resposta da IA, com estado publicado/rascunho explícito. |
| Tese Comercial | MANTER | Política central do agente; somente admin/owner edita. |
| Aprendizado contínuo | MANTER | Curadoria humana permanece, mas “Aprovado” só após persistência e publicação confirmadas. |
| Dados da Empresa | REALOCAR | Mover o componente existente para Configurações > Empresa. |
| Configuração do Agente | MANTER | Fica em Inteligência; é parte da governança do comportamento. |
| Troca de workspace interna | RECOLHER | Usar o seletor global do AppShell; evitar dois controles de contexto. |
| Badges de agente/canal conectado | CORRIGIR | Derivar de health/config real; em falha, mostrar `Não confirmado`. |
| Simuladores e recursos experimentais | RECOLHER | Apenas admin, fora do fluxo diário e nunca na produção API quando dependerem de fixtures. |

### Prioridade

- `P0`: impedir que fixtures e `localStorage` apareçam como conhecimento publicado ou aprendizado aprovado.
- `P0`: remover badges de conexão não verificados.
- `P1`: mover Dados da Empresa para Configurações.
- `P1`: eliminar o seletor de workspace duplicado.
- `P2`: padronizar estados `Rascunho`, `Publicado`, `Falhou` e `Não confirmado` nos componentes existentes.

## 9. Configurações

### Diagnóstico

[KNOWN] O shell atual possui Equipe, API/Webhooks, Canais, Parâmetros Globais e Modelos/Infra. Tracking, Dados da Empresa e LTV estão espalhados em outros módulos, embora sejam configurações.

[CÓDIGO LOCAL] Equipe, API/Webhooks e Modelos/Infra usam dados locais ou fixtures. `ApiWebhooksManager` contém tokens, segredos, percentuais e entregas de demonstração; criar/revogar/testar apenas altera estado local e o “teste” fabrica HTTP 200 e latência aleatória.

[CÓDIGO LOCAL] Canais posiciona `Limpar Histórico` ao lado de `Sincronizar Mensagens`. A ação destrutiva ocupa o mesmo nível visual da manutenção cotidiana.

[CÓDIGO LOCAL] Tracking faz fallback para defaults/`localStorage`; Modelos/Infra inicia de `mockEngineConfig`. Esses fallbacks impedem o usuário de distinguir “configurado no servidor” de “preenchido neste navegador”.

| Elemento | Decisão | Direção pontual |
|---|---|---|
| Equipe & Usuários | MANTER | Grupo `Conta`; gestão somente com autorização real e persistência de servidor. |
| Dados da Empresa | REALOCAR PARA CÁ | Reusar `CompanyProfileSection` no grupo `Conta`. |
| Regras Comerciais/LTV | REALOCAR PARA CÁ | Reusar `LtvConfigManager` no grupo `Conta`, após persistência real. |
| Canais de WhatsApp | MANTER | Grupo `Integrações`; status por engine com horário da última confirmação. |
| Modelos & Infra | MANTER | Grupo `Integrações`; owner/admin técnico, sem fixtures operacionais. |
| Tracking & Pixels | REALOCAR PARA CÁ | Grupo `Integrações`; reusar `TrackingSettings`. |
| API & Webhooks | MANTER | Grupo `Integrações`; chave completa só uma vez após criação real. |
| Parâmetros Globais | MANTER | Grupo `Governança`; somente owner. |
| Limpar Histórico | RECOLHER | `Ações avançadas > Zona de risco`, com escopo, confirmação digitada e auditoria. |
| Sincronizar Mensagens | MANTER | Ação secundária no contexto de Canais; exibir progresso e resultado real. |
| Abas horizontais | RECOLHER | Não criar oito pills em uma linha. Agrupar os mesmos componentes em `Conta`, `Integrações` e `Governança`. |

### Estrutura proposta sem reconstrução

1. **Conta:** Equipe, Empresa, Regras Comerciais.
2. **Integrações:** Canais, Modelos & Infra, Tracking, API & Webhooks.
3. **Governança:** Parâmetros Globais e Zona de Risco.

Isso é apenas reagrupamento de componentes já existentes. Não exige novo design system nem novas telas funcionais.

### Prioridade

- `P0`: retirar credenciais/segredos/defaults demonstrativos do bundle e invalidar qualquer material que possa ter sido usado como credencial.
- `P0`: proibir criação, revogação e teste fictícios de API/Webhook em modo produção.
- `P0`: estados de canal, tracking e infraestrutura devem ser `Confirmado`, `Não confirmado` ou `Erro`, conforme resposta real.
- `P0`: mover Limpar Histórico para Zona de Risco.
- `P1`: agrupar configurações e realocar Empresa, LTV e Tracking.
- `P1`: aplicar autorização também nas rotas, não apenas na visibilidade da UI.
- `P2`: eliminar corte/rolagem confusa das pills em notebook.

## 10. Consolidação desktop/notebook

### O problema central

A carga cognitiva não vem da quantidade total de recursos. Ela vem de quatro falhas combinadas:

1. a mesma função aparece em mais de um lugar;
2. configuração técnica compete com trabalho diário;
3. ações raras ou destrutivas ficam sempre visíveis;
4. a interface afirma sucesso quando a fonte real falhou ou não foi consultada.

### Ordem correta de correção

| Fase | Objetivo | Critério de aceite em PC/notebook |
|---|---|---|
| `P0 — Verdade` | Remover estados, métricas, credenciais, aprovações e sucessos fictícios. | Em falha de API, nenhuma tela comunica operação saudável; ações sem backend ficam desabilitadas ou marcadas como demonstração. |
| `P1 — Lugar` | Realocar e desduplicar sem refazer componentes. | Cada função tem um único endereço principal; Tracking, Empresa e LTV ficam em Configurações; Broadcast fica em Campanhas. |
| `P2 — Atenção` | Recolher filtros, modos secundários e ações raras. | Em 1366x768, CTA primária e conteúdo principal permanecem visíveis sem corte; ações avançadas ficam a no máximo dois cliques. |

### Gate visual antes de mobile

- **PC 1920×1080:** nenhuma função essencial deve depender de hover ou ficar perdida fora da hierarquia principal.
- **Notebook 1366×768:** primeira dobra contém título curto, uma CTA primária, filtros essenciais e início do conteúdo; sem segunda linha de pills cortada.
- **Ambos:** a navegação pelo papel de operador, admin e owner precisa ser validada separadamente.
- **Ambos:** cada estado `Conectado`, `Aprovado`, `Publicado`, `Enviado` ou `Salvo` exige evidência do servidor.

## Direção final

Não construir uma nova interface. A aplicação recomendada é uma sequência curta de remoções, realocações e correções de estado sobre os componentes existentes. A validação mobile só começa depois que os gates de 1920×1080 e 1366×768 forem aprovados.
