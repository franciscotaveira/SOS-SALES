export type EkoBonusSubscription = {
  status: string;
  accessUntil?: string | Date | null;
  currentPeriodEnd?: string | Date | null;
};

export type EkoBonusModule = {
  id: string;
  title: string;
  purpose: string;
  template: string;
  checklist: string[];
};

export const EKO_BONUS_VERSION = '2026-09-05';

/**
 * The subscription gate is deliberately server-side. A workspace can read
 * the kit only while its Cakto entitlement is active (or inside the configured
 * past-due grace period); the client never decides whether the bonus exists.
 */
export function hasEkoBonusEntitlement(
  subscription: EkoBonusSubscription | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active' || subscription.status === 'trialing') return true;
  if (subscription.status !== 'past_due') return false;

  const candidate = subscription.accessUntil || subscription.currentPeriodEnd;
  if (!candidate) return false;
  const timestamp = candidate instanceof Date ? candidate.getTime() : Date.parse(candidate);
  return Number.isFinite(timestamp) && timestamp > nowMs;
}

export const EKO_BONUS_MODULES: readonly EkoBonusModule[] = [
  {
    id: 'mapa-mestre',
    title: 'Mapa Mestre do Negócio',
    purpose: 'Concentre em uma página a oferta, o público e as provas que a IA precisa confirmar antes de responder.',
    template: `# Mapa Mestre do Negócio

## Oferta principal
- O que vendemos:
- Para quem:
- Problema que resolvemos:
- Resultado esperado (sem promessa absoluta):

## Diferenciais e provas
- Por que escolher esta empresa:
- Prova verificável (depoimento, prazo, certificação ou caso):
- O que nunca devemos afirmar sem confirmação:

## Condições comerciais
- Faixa de preço:
- Formas de pagamento:
- Política de desconto:
- Próximo passo preferencial (agendar, orçamento ou sinal):
`,
    checklist: [
      'A oferta principal pode ser entendida em uma frase.',
      'Preço, pagamento e desconto têm fonte definida.',
      'Toda promessa tem uma prova ou está marcada como não confirmada.',
    ],
  },
  {
    id: 'guia-conversa',
    title: 'Guia da Conversa Comercial',
    purpose: 'Dê ao agente uma sequência curta para diagnosticar, orientar e pedir o próximo passo sem pressionar o lead.',
    template: `# Guia da Conversa Comercial

## Abertura
"Olá, [nome]. Para te orientar sem te fazer perder tempo, posso entender rapidamente o que você precisa?"

## Diagnóstico mínimo
1. Qual serviço ou produto você procura?
2. Para quando precisa resolver?
3. Existe alguma restrição, preferência ou faixa de investimento?

## Resposta com contexto
- Confirmar o que foi entendido.
- Mostrar apenas opções disponíveis e suas condições reais.
- Fazer uma pergunta por vez quando faltar uma informação crítica.

## Fechamento
"Pelo que você me contou, o próximo passo mais simples é [ação]. Posso [agendar/enviar orçamento/gerar sinal]?"

## Follow-up
- Combinar data ou condição de retorno.
- Registrar o compromisso no CRM.
- Não criar urgência, escassez ou desconto que não estejam aprovados.
`,
    checklist: [
      'O roteiro começa pelo problema do lead, não pelo catálogo inteiro.',
      'Cada pergunta altera uma decisão comercial concreta.',
      'O próximo passo é explícito e pode ser registrado.',
    ],
  },
  {
    id: 'contexto-aquisicao',
    title: 'Contexto de Aquisição',
    purpose: 'Preserve a origem e o gancho que trouxeram o lead para a conversa.',
    template: `# Contexto de Aquisição

- Canal de entrada:
- Campanha:
- Conjunto ou público:
- Criativo/anúncio:
- Gancho ou promessa apresentada:
- Oferta relacionada:
- Evento que deve ser medido (lead, proposta, compra):

## Regra operacional
Antes de repetir uma pergunta, consulte o contexto capturado. A conversa deve continuar a decisão iniciada no anúncio.
`,
    checklist: [
      'A origem do lead é preservada no CRM.',
      'O agente não inventa campanha, anúncio ou promessa.',
      'O evento de negócio que importa está definido.',
    ],
  },
  {
    id: 'limites-handoff',
    title: 'Limites e Transferência Humana',
    purpose: 'Defina o que a IA pode fazer sozinha e quando um humano precisa assumir.',
    template: `# Limites e Transferência Humana

## A IA pode
- Explicar informações publicadas e confirmadas.
- Apresentar opções disponíveis.
- Fazer perguntas de qualificação.
- Sugerir o próximo passo aprovado.

## A IA não pode
- Inventar preço, prazo, estoque, agenda ou política.
- Prometer resultado garantido.
- Aplicar desconto acima do limite publicado.
- Discutir reclamação sensível sem um responsável.

## Transferir para humano quando
- O lead pedir uma pessoa.
- Houver reclamação, risco, tema sensível ou exceção de política.
- Faltar uma informação que muda a proposta.
- A conversa ficar ambígua após uma tentativa de esclarecimento.
`,
    checklist: [
      'Os gatilhos de handoff estão escritos em linguagem observável.',
      'O limite de desconto está publicado no playbook.',
      'Existe um responsável e um SLA para receber a transferência.',
    ],
  },
  {
    id: 'base-conhecimento',
    title: 'Base de Conhecimento Estruturada',
    purpose: 'Organize as fontes antes de pedir que a IA responda por elas.',
    template: `# Base de Conhecimento Estruturada

## Fontes prioritárias
- Catálogo e preços atuais:
- Horários e disponibilidade:
- Políticas de pagamento, troca e cancelamento:
- Perguntas frequentes:
- Provas, certificações e restrições:

## Cada documento precisa informar
- Nome e responsável:
- Data da última revisão:
- O que a fonte confirma:
- O que a fonte não confirma:
- Quando revisar novamente:

## Regra de conflito
Se duas fontes divergirem, a IA deve parar, sinalizar a divergência e encaminhar para o responsável.
`,
    checklist: [
      'Cada fonte tem um responsável nomeado.',
      'Existe data de revisão e uma versão atual.',
      'Conflitos entre documentos geram sinalização, não uma escolha inventada.',
    ],
  },
  {
    id: 'checklist-testes',
    title: 'Checklist de Testes de Configuração',
    purpose: 'Teste cenários reais antes de liberar o agente para responder clientes.',
    template: `# Checklist de Testes de Configuração

- [ ] Pergunta sobre preço usa o catálogo atual.
- [ ] Pergunta sobre prazo usa uma fonte confirmada.
- [ ] Pedido de desconto respeita o limite.
- [ ] Informação ausente gera pergunta objetiva ou handoff.
- [ ] Pedido para falar com humano transfere a conversa.
- [ ] Reclamação não recebe resposta defensiva ou promessa.
- [ ] Lead vindo de anúncio mantém o gancho da campanha.
- [ ] A conversa encerrada registra próximo passo e responsável.

## Evidência mínima
Para cada teste, salve: entrada, resposta, fonte consultada, resultado esperado e decisão do revisor.
`,
    checklist: [
      'Os testes usam mensagens que clientes realmente enviam.',
      'Cada caso tem um resultado esperado observável.',
      'Um operador revisa e aprova a liberação final.',
    ],
  },
];

