# Agentes comerciais: implementação de 11/09/2026

Esta entrega aplica a base de segurança e prepara a vendedora assistida/piloto do plano. Não representa conclusão das etapas de expansão nem certificação de venda autônoma. A avaliação comportamental com o NVIDIA terminou inconclusiva após três timeouts; a lista de contatos do novo piloto permanece vazia por padrão.

## Implementado

- Parser monetário único para API e editor: preserva centavos e milhares brasileiros; rejeita intervalos e parcelas ambíguas. Catálogo explicitamente vazio retira ofertas antigas. Documentos independentes do banco não desaparecem após os primeiros doze documentos do bundle.
- Quatro procedimentos comerciais versionados: descoberta, oferta, objeção comum e encaminhamento. Simulador usa as mesmas políticas comerciais. Ampliação de autonomia no WhatsApp exige ativação da habilidade e seleção explícita do contato do piloto.
- Validador de resposta rejeita valores monetários fora do catálogo, links fora da lista aprovada e formas conhecidas de afirmação de pagamento/reserva/ativação sem execução. É uma barreira determinística parcial, não detector semântico infalível; números escritos por extenso, alegações sutis e ataques novos ainda exigem avaliação.
- Checkout determinístico apenas do SOS, lendo um plano Cakto ativo, em BRL, inequivocamente mensal/anual e com URL oficial. Não cria produto, não confirma pagamento e não libera conta. Confirmação financeira e vínculo ao proprietário continuam no fluxo de billing existente.
- Recusa persistida na ingestão, mesmo com IA desativada. Reserva de outbound e aprovação/claim do dispatcher consultam consentimento no banco. Palavra SOS não apaga recusa nem pausa humana. A proteção não cancela mensagem que o provedor já aceitou antes da recusa.
- Limite atômico de inferências: 60 por contato e 1.000 por workspace em janela móvel de 24 horas, contando tentativas. Ao atingir o limite, encaminha para revisão humana. Não é limite financeiro em reais; o simulador conserva o rate limit HTTP existente.
- Playbook exige trecho literal de mensagem do operador e registra candidato com origem, confiança 0,5 e sem confirmação do cliente. Candidatos não são injetados automaticamente no Receptionist. Registros legados não foram reclassificados em massa.
- Leitura de até 12 fatos `customer.*` da jornada, identificados como memória declarada. Não foi adicionado extrator automático que transforme fala do cliente em prova de pagamento ou autoridade.
- Recuperação exclui jornadas encerradas, pausadas, com outro responsável ou contato recusado. Retenção deixa de apresentar ciclos biológicos presumidos: data representa compra, janela fica não verificada.
- Histórico das publicações do bundle e restauração pelo proprietário, inclusive alterações feitas por calibração. Operador comum não pode publicar regras ou Pix pelo simulador.
- Painel com resultados das execuções das últimas 24 horas, escolha de contatos do piloto e restauração de publicação. Métricas contam tentativas e não comprovam leitura, compra ou ativação.

## Limites preservados para as próximas etapas

A publicação ainda é imediata ao salvar: esta entrega traz histórico/rollback, mas não todo o fluxo rascunho → comparação → testes → publicação. Conhecimento continua limitado por tamanho; recuperação por relevância/validade e políticas obrigatórias separadas permanecem pendentes. O playbook tem candidatos rastreáveis, ainda sem fluxo completo de aprovação editorial.

Não foram implementadas confirmações autônomas de agenda, ciclos setoriais, estorno, áudio ou expansão para hotel/clínica. Não foram executados pagamento real, mensagens a destinatários externos nem o conjunto de 100 cenários com três repetições. Esses são critérios de saída das próximas etapas e dependem de integração/dados e inferência disponíveis.

Meta Business Agent continua desativado. WAHA e Meta Cloud API permanecem como transportes do SOS.

## Evidências

- Suíte completa inicial: 626 testes da API passaram; 24 do frontend passaram.
- Após os últimos ajustes de saída/RBAC: 64 testes direcionados passaram; recompilação final e Lab registrados no fechamento da entrega.
- Três testes reais de PostgreSQL comprovam recusa na ingestão e bloqueio de reserva, limite de 60 turnos/isolamento e histórico de publicações sob papel runtime.
- `agent-evolution-assessment-2026-09-11.json` conserva a avaliação original; `agent-evolution-validation-2026-09-11.json` conserva a nova execução inconclusiva do NVIDIA e regressões determinísticas corrigidas.
- Saúde de containers/API não substitui teste comportamental, entrega WhatsApp ou contratação real.

## Estado da validação final

A primeira construção integrada do Docker Lab concluiu. A reconstrução após os últimos ajustes foi interrompida por pressão de recursos no Docker. O daemon falhou ao encerrar o WAHA local (`did not receive an exit event`) e a repetição da suíte apresentou timeouts de conexão com o PostgreSQL. Essa rodada não é considerada aprovada e deve ser repetida após recuperar o Lab. Não houve publicação desta entrega no VPS enquanto esse gate permanece pendente.

Frontend final: 25/25 testes passaram. A suíte completa anterior da API passou 626/626; duas novas variações de segurança passaram na execução direcionada (64/64). Isso não substitui a repetição integrada final.

## Revalidação após recuperar o Docker

O reinício do Docker Desktop foi autorizado pelo usuário. As imagens finais da API e do frontend foram construídas a partir do commit limpo `d55baceab9c71acebe88eb79938b3e5dab07937b`. Com os workers do Lab parados durante a suíte, **628/628 testes da API passaram**, e a limpeza dos dados sintéticos concluiu. **25/25 testes do frontend passaram**, assim como TypeScript, os dois builds de produção e o preflight. O alerta de chunk web acima de 500 kB permanece; não impediu a compilação.

A release foi preparada em pasta isolada no VPS. O dry-run identificou somente `20260911120000_agent_sales_safety.sql` como migração pendente. A promoção será registrada após health/ready do Lab e de produção.

Lab final: `/health` retornou `ok` e `/ready` retornou `ready`, com database, Redis, waha-inbound-worker, outbound-worker, receptionist-worker e capi-worker em `ok`. API e WAHA locais foram retomados.

A aplicação da migração em produção foi bloqueada pela revisão automática de aprovação antes de executar. Foi solicitada autorização explícita para a migração `20260911120000_agent_sales_safety.sql` e a promoção da release `d55bace`. Até essa aprovação, o VPS continua no commit `acb2d931b651e122bb93550c4cb1e263b1cb54a8`.
