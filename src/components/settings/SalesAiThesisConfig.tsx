import React from 'react';
import {
  Brain,
  Sparkles,
  Bot,
  ShieldCheck,
  Zap,
  Target,
  CheckCircle2,
  Clock,
  MessageSquare,
  Sliders,
  DollarSign,
  AlertTriangle,
  Play,
  Flame,
  UserCheck,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

export const SalesAiThesisConfig: React.FC = () => {
  // Operating Modes
  const [autonomousNight, setAutonomousNight] = React.useState(true);
  const [copilotDaytime, setCopilotDaytime] = React.useState(true);
  const [typingDelaySeconds, setTypingDelaySeconds] = React.useState(22);
  const [maxDiscountPercent, setMaxDiscountPercent] = React.useState(10);
  const [splitBubbles, setSplitBubbles] = React.useState(true);
  const [alwaysAdvanceRule, setAlwaysAdvanceRule] = React.useState(true);
  const [audioVoiceResponse, setAudioVoiceResponse] = React.useState(false);

  // Selected Objection Tab in Playbook
  const [activeObjectionTab, setActiveObjectionTab] = React.useState<
    'price' | 'timing' | 'competition' | 'trust'
  >('price');

  // Interactive Thesis Simulator State
  const [testLeadMessage, setTestLeadMessage] = React.useState(
    'Achei o valor de R$ 280 um pouco alto... O salão vizinho cobra R$ 190. Consegue fazer um desconto?'
  );
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [simulatedResponse, setSimulatedResponse] = React.useState<{
    intentDetected: string;
    guardrailStatus: string;
    bubble1: string;
    bubble2: string;
    thesisExplanation: string;
  } | null>({
    intentDetected: 'Objeção de Preço + Comparação de Concorrência',
    guardrailStatus: 'Aprovado (Mantém política sem desvalorização de tabela)',
    bubble1:
      'Entendo perfeitamente, Camila! Nosso procedimento já inclui o diagnóstico capilar com produtos importados e garantia de durabilidade de 45 dias, o que evita retoques constantes.',
    bubble2:
      'Para você experimentar nosso padrão sem pesar, consigo parcelar em até 3x sem juros ou incluir a hidratação express de cortesia. Você prefere na sexta às 14h ou no sábado às 10h?',
    thesisExplanation:
      'A IA aplicou a Regra de Ouro: acolheu o lead, ancorou o valor real (produtos importados + durabilidade), ofereceu benefício inteligente sem queimar margem e terminou com pergunta binária de fechamento de agenda.',
  });

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      if (testLeadMessage.toLowerCase().includes('caro') || testLeadMessage.toLowerCase().includes('desconto')) {
        setSimulatedResponse({
          intentDetected: 'Objeção de Preço / Negociação de Desconto',
          guardrailStatus: 'Aprovado (Dentro da alçada de benefícios)',
          bubble1:
            'Compreendo super a sua busca pelo melhor custo-benefício! Nossa estrutura conta com produtos premium originais e atendimento exclusivo com hora marcada.',
          bubble2:
            'Para garantirmos a sua vaga nesta semana, consigo manter o valor do anúncio em até 3x sem juros. Qual período fica melhor para você: manhã ou tarde?',
          thesisExplanation:
            'Ancoragem de valor + facilitação de pagamento + pergunta de avanço de agenda imediata.',
        });
      } else if (testLeadMessage.toLowerCase().includes('depois') || testLeadMessage.toLowerCase().includes('pensar')) {
        setSimulatedResponse({
          intentDetected: 'Indecisão / Fricção de Tempo ("Vou pensar")',
          guardrailStatus: 'Aprovado (Retomada estratégica sem pressão excessiva)',
          bubble1:
            'Sem problemas! Para você não perder a condição especial do anúncio enquanto decide, posso deixar um horário pré-reservado sem custo.',
          bubble2:
            'Se você preferir, consigo segurar até amanhã às 12h. Fica melhor para você esse horário?',
          thesisExplanation:
            'Elimina o risco de perda do lead, oferece reserva sem atrito e define um prazo claro de continuidade.',
        });
      } else {
        setSimulatedResponse({
          intentDetected: 'Dúvida Geral / Qualificação de Serviço',
          guardrailStatus: 'Aprovado (Triagem comercial completa)',
          bubble1:
            'Perfeito! Atendemos exatamente com essa especialidade e temos profissionais dedicados para garantir o melhor resultado.',
          bubble2:
            'Temos 2 vagas disponíveis para amanhã: às 14h15 ou 16h30. Qual desses dois horários se encaixa melhor na sua rotina?',
          thesisExplanation:
            'Confirmação objetiva da dúvida + condução direta para a escolha de agenda.',
        });
      }
    }, 600);
  };

  return (
    <div id="sales-ai-thesis-config" className="space-y-6">
      {/* Header: Thesis Mission */}
      <div className="bg-gradient-to-r from-[#111b21] via-slate-900 to-indigo-950 p-4 sm:p-5 rounded-2xl text-white space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00a884] text-white flex items-center justify-center font-bold shadow-xs">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  IA Vendedora 24/7 & Tese SOS Sales
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00a884]/30 text-emerald-300 border border-[#00a884]/40">
                  Full Commercial Operating System
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Configurações avançadas para transformar conversas travadas no WhatsApp em vendas concluídas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/10 rounded-xl text-xs font-mono text-emerald-400 border border-white/10">
              ⚡ Status: 24/7 Ativa
            </span>
          </div>
        </div>

        {/* 4 Pillars of the Thesis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-700/60 text-xs">
          <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
              <Target className="w-3.5 h-3.5" />
              <span>1. Nunca Deixar Morrer</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Toda mensagem termina com pergunta de avanço ou agendamento claro.
            </p>
          </div>

          <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-blue-400">
              <Zap className="w-3.5 h-3.5" />
              <span>2. Resposta em &lt;60s</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Atendimento instantâneo para anúncios Meta CTWA sem esfriar o lead.
            </p>
          </div>

          <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-purple-400">
              <Brain className="w-3.5 h-3.5" />
              <span>3. Dossiê de Memória</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Preserva preferências e dores para nunca pedir repetição de dados.
            </p>
          </div>

          <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>4. Guardrails Rígidos</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Handoff automático se o lead pedir desconto fora da alçada de {maxDiscountPercent}%.
            </p>
          </div>
        </div>
      </div>

      {/* Operating Modes & Humanization Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Operating Windows */}
        <div className="cockpit-panel p-4 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <Sliders className="w-4 h-4 text-[#00a884]" />
            <span>Modos de Operação Comercial</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* 24/7 Night / Weekend Mode */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl flex items-center justify-between border border-[#e2e8f0]">
              <div className="space-y-0.5">
                <div className="font-bold text-[#111b21] flex items-center gap-1.5">
                  <span>🌙 Noturno & Fins de Semana (100% Autônoma)</span>
                </div>
                <p className="text-[11px] text-[#54656f]">
                  A IA atende, quebra objeções e conclui o agendamento mesmo fora do horário de expediente.
                </p>
              </div>
              <button
                onClick={() => setAutonomousNight(!autonomousNight)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  autonomousNight ? 'bg-[#00a884]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    autonomousNight ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Daytime Copilot */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl flex items-center justify-between border border-[#e2e8f0]">
              <div className="space-y-0.5">
                <div className="font-bold text-[#111b21] flex items-center gap-1.5">
                  <span>☀️ Horário Comercial (Copilot Supervisionado)</span>
                </div>
                <p className="text-[11px] text-[#54656f]">
                  A IA gera a melhor resposta no composer para o operador aprovar ou ajustar em 1 clique.
                </p>
              </div>
              <button
                onClick={() => setCopilotDaytime(!copilotDaytime)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  copilotDaytime ? 'bg-[#00a884]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    copilotDaytime ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Alçada de Desconto Máximo */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl space-y-2 border border-[#e2e8f0]">
              <div className="flex items-center justify-between font-bold text-[#111b21]">
                <span>Alçada Máxima de Desconto da IA:</span>
                <span className="text-[#00a884] font-mono">{maxDiscountPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                value={maxDiscountPercent}
                onChange={(e) => setMaxDiscountPercent(Number(e.target.value))}
                className="w-full accent-[#00a884]"
              />
              <span className="text-[10.5px] text-[#667781] block">
                Acima de {maxDiscountPercent}%, a IA realiza transição obrigatória para o supervisor comercial.
              </span>
            </div>
          </div>
        </div>

        {/* Humanization & WhatsApp Behavioral Settings */}
        <div className="cockpit-panel p-4 space-y-4">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Humanização & Estilo Conversacional</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Split Bubbles */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl flex items-center justify-between border border-[#e2e8f0]">
              <div className="space-y-0.5">
                <div className="font-bold text-[#111b21]">
                  <span>Fracionamento em Balões Naturais</span>
                </div>
                <p className="text-[11px] text-[#54656f]">
                  Envia 2 mensagens curtas em vez de blocos longos de texto ("textão").
                </p>
              </div>
              <button
                onClick={() => setSplitBubbles(!splitBubbles)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  splitBubbles ? 'bg-[#00a884]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    splitBubbles ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Always Advance Rule */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl flex items-center justify-between border border-[#e2e8f0]">
              <div className="space-y-0.5">
                <div className="font-bold text-[#111b21]">
                  <span>Regra de Ouro: Pergunta de Fechamento</span>
                </div>
                <p className="text-[11px] text-[#54656f]">
                  Força toda interação a terminar com uma pergunta de escolha ou próximo passo.
                </p>
              </div>
              <button
                onClick={() => setAlwaysAdvanceRule(!alwaysAdvanceRule)}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  alwaysAdvanceRule ? 'bg-[#00a884]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    alwaysAdvanceRule ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Typing Delay */}
            <div className="p-3 bg-[#f0f2f5] rounded-xl space-y-2 border border-[#e2e8f0]">
              <div className="flex items-center justify-between font-bold text-[#111b21]">
                <span>Atraso Humanizado de Digitação:</span>
                <span className="text-purple-700 font-mono">{typingDelaySeconds} segundos</span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                value={typingDelaySeconds}
                onChange={(e) => setTypingDelaySeconds(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
              <span className="text-[10.5px] text-[#667781] block">
                Simula tempo de leitura e digitação humana com status "digitando..." no WhatsApp.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Objections Playbook Matrix */}
      <div className="cockpit-panel p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <ShieldCheck className="w-4 h-4 text-[#00a884]" />
            <span>Matriz de Quebra de Objeções (SOS Sales Playbook)</span>
          </div>
          <span className="text-xs text-[#54656f]">
            Argumentação e ancoragem estratégica por categoria
          </span>
        </div>

        {/* Objection Tabs */}
        <div className="flex items-center gap-1.5 bg-[#f0f2f5] p-1 rounded-xl border border-[#e2e8f0] overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveObjectionTab('price')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeObjectionTab === 'price'
                ? 'bg-white text-emerald-800 shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            💰 Preço / "Achei Caro"
          </button>
          <button
            onClick={() => setActiveObjectionTab('timing')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeObjectionTab === 'timing'
                ? 'bg-white text-amber-800 shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            ⏳ Tempo / "Vou Pensar"
          </button>
          <button
            onClick={() => setActiveObjectionTab('competition')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeObjectionTab === 'competition'
                ? 'bg-white text-blue-800 shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            🏢 Concorrência / "O Outro é Mais Barato"
          </button>
          <button
            onClick={() => setActiveObjectionTab('trust')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeObjectionTab === 'trust'
                ? 'bg-white text-purple-800 shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            🛡️ Confiança & Garantia
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-3.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] text-xs space-y-2">
          {activeObjectionTab === 'price' && (
            <div className="space-y-2">
              <div className="font-bold text-[#111b21]">Estratégia de Quebra: Ancoragem de Valor + Parcelamento Sem Juros</div>
              <p className="text-[#54656f] leading-relaxed">
                A IA não entra em guerra de preços. Ela reforça a durabilidade, os insumos premium utilizados e oferece facilitação em parcelas ou benefício agregado (ex: hidratação ou cortesia de retorno), finalizando com opções de data.
              </p>
            </div>
          )}
          {activeObjectionTab === 'timing' && (
            <div className="space-y-2">
              <div className="font-bold text-[#111b21]">Estratégia de Quebra: Pré-Reserva de Agenda Sem Compromisso</div>
              <p className="text-[#54656f] leading-relaxed">
                Quando o lead diz que vai pensar, a IA oferece segurar a vaga e a condição promocional até o dia seguinte, estipulando um compromisso de follow-up que mantém a conversa aberta.
              </p>
            </div>
          )}
          {activeObjectionTab === 'competition' && (
            <div className="space-y-2">
              <div className="font-bold text-[#111b21]">Estratégia de Quebra: Diferenciação Técnica e Garantia Real</div>
              <p className="text-[#54656f] leading-relaxed">
                A IA destaca o que o concorrente normalmente não cobre (garantia estendida, suporte pós-serviço, produtos homologados) sem falar mal do outro, valorizando o investimento do cliente.
              </p>
            </div>
          )}
          {activeObjectionTab === 'trust' && (
            <div className="space-y-2">
              <div className="font-bold text-[#111b21]">Estratégia de Quebra: Prova Social & Casos Semelhantes</div>
              <p className="text-[#54656f] leading-relaxed">
                A IA cita avaliações 5 estrelas no Google, tempo de mercado e envia fotos de antes/depois ou certificações técnicas para eliminar a insegurança do lead.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Thesis Simulator (Live Playground) */}
      <div className="cockpit-panel p-4 space-y-3.5 border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/30 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <Brain className="w-4 h-4 text-indigo-600" />
            <span>Simulador Interativo da Tese SOS Sales (Teste de Reação da IA)</span>
          </div>
          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
            Live AI Sandbox
          </span>
        </div>

        <p className="text-xs text-[#54656f]">
          Digite qualquer mensagem ou objeção real de um lead e veja a IA responder aplicando a tese completa:
        </p>

        {/* Input Message & Test Trigger */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={testLeadMessage}
              onChange={(e) => setTestLeadMessage(e.target.value)}
              placeholder="Digite a mensagem do lead para testar..."
              className="flex-1 text-xs px-3 py-2 bg-white rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              <span>{isSimulating ? 'Processando Tese...' : 'Testar Resposta da IA'}</span>
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="text-[#667781] font-semibold">Exemplos rápidos:</span>
            <button
              onClick={() => {
                setTestLeadMessage('Achei muito caro, no concorrente está mais barato.');
              }}
              className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-md text-slate-700"
            >
              "Achei caro..."
            </button>
            <button
              onClick={() => {
                setTestLeadMessage('Vou ver com meu esposo e qualquer coisa te chamo semana que vem.');
              }}
              className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-md text-slate-700"
            >
              "Vou ver com meu esposo..."
            </button>
            <button
              onClick={() => {
                setTestLeadMessage('Tem horário para hoje à tarde? Preciso com urgência.');
              }}
              className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 rounded-md text-slate-700"
            >
              "Tem horário hoje?"
            </button>
          </div>
        </div>

        {/* Simulated Response Preview (WhatsApp Bubbles) */}
        {simulatedResponse && (
          <div className="p-3.5 bg-white rounded-xl border border-indigo-200 space-y-3 shadow-2xs animate-in fade-in">
            {/* Meta info tags */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-100 text-purple-800">
                🎯 {simulatedResponse.intentDetected}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {simulatedResponse.guardrailStatus}
              </span>
            </div>

            {/* WhatsApp Chat Bubbles Simulation */}
            <div className="p-3 bg-[#efeae2] rounded-xl space-y-2">
              {/* Bubble 1 */}
              <div className="bg-white p-2.5 rounded-lg rounded-tl-none max-w-[85%] shadow-2xs text-xs text-[#111b21] leading-relaxed">
                {simulatedResponse.bubble1}
                <span className="text-[9px] text-slate-400 block text-right font-mono mt-1">
                  11:42
                </span>
              </div>

              {/* Bubble 2 (Closing question) */}
              <div className="bg-white p-2.5 rounded-lg rounded-tl-none max-w-[85%] shadow-2xs text-xs text-[#111b21] leading-relaxed border-l-2 border-l-[#00a884]">
                {simulatedResponse.bubble2}
                <span className="text-[9px] text-slate-400 block text-right font-mono mt-1">
                  11:42
                </span>
              </div>
            </div>

            {/* Why this works (Thesis Analysis) */}
            <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-indigo-950 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Por que essa resposta destrava a venda:</span>
              </div>
              <p className="text-[11.5px] text-indigo-900 leading-relaxed">
                {simulatedResponse.thesisExplanation}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
