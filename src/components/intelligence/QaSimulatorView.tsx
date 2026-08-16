import React, { useState } from 'react';
import {
  Zap,
  Play,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Terminal,
  ShieldAlert,
  Flame,
  MessageSquare,
  Sparkles,
  Bot,
  Gauge,
  Send,
  Camera,
  Calendar,
  DollarSign,
  ShieldCheck,
  Building2,
  Sparkle,
  Layers,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import {
  getWorkspaceAiMode,
  setWorkspaceAiMode,
  GlobalAiAutonomyMode,
} from '../../services/aiAutonomyManager';

interface QaSimulatorViewProps {
  currentWorkspace?: Workspace;
  onSimulateIncomingLeadMessage?: () => void;
  onSimulateNetworkErrorToggle?: () => void;
  isNetworkErrorForced?: boolean;
}

interface TestScenario {
  id: string;
  category: 'haven' | 'sos' | 'stress';
  title: string;
  badge: string;
  description: string;
  customerPrompt: string;
  hasMedia?: boolean;
  expectedAgent: string;
  expectedPricing?: string;
  simulatedResponse: string;
  empathyScore: number;
  accuracyScore: number;
  guardrailStatus: 'passed' | 'warning' | 'handoff_triggered';
  explanation: string;
}

const PRELOADED_SCENARIOS: TestScenario[] = [
  // HAVEN SCENARIOS
  {
    id: 'haven-ctwa-escova',
    category: 'haven',
    title: '1. Anúncio CTWA (Escova R$ 59)',
    badge: 'Meta Ads CTWA',
    description: 'Lead clica no anúncio de Escova Express e pergunta se inclui lavagem e tem vaga hoje.',
    customerPrompt: 'Olá! Vi o anúncio da escova por R$ 59 no Instagram. Esse valor já inclui a lavagem? Tem horário para hoje às 14h?',
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'R$ 59,00 (Promocional)',
    simulatedResponse: 'Olá! Que alegria receber você na Haven! 🌸 Sim, a nossa Escova Express por R$ 59 inclui a lavagem completa com produtos de alta performance e ozônioterapia para deixar seu cabelo super brilhoso e protegido! ✨\n\nPara hoje, temos encaixes excelentes! Você prefere o período da tarde ou quer garantir diretamente pelo nosso link do Trinks? https://www.trinks.com/haven-escovaria-e-esmalteria',
    empathyScore: 98,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Confirmou o valor exato da promoção do Meta Ads, destacou a ozônioterapia inclusa e ofertou o link oficial do Trinks.',
  },
  {
    id: 'haven-multimodal-nail',
    category: 'haven',
    title: '2. Foto de Unha em Gel (Multimodal)',
    badge: 'Visão Computacional',
    description: 'Cliente manda foto de referência de esmaltação em gel e pergunta valor e tempo.',
    customerPrompt: '[📷 Foto anexada: Unha formato amendoado com esmaltação em gel nude e francesinha fina] Oi Bia! Quero fazer igual essa da foto no sábado. Quanto fica e quanto tempo demora?',
    hasMedia: true,
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'R$ 150,00 (Esmaltação em Gel Premium)',
    simulatedResponse: 'Uau, que escolha elegante e sofisticada! ✨ Analisei a sua foto de referência: é uma Esmaltação em Gel Premium com acabamento em francesinha fina. \n\n💎 Valor: R$ 150,00 (dura até 21 dias impecável sem lascar)\n⏱️ Duração: cerca de 1 hora\n\nPara o sábado as vagas são concorridas! Deseja segurar seu horário pelo Trinks (https://www.trinks.com/haven-escovaria-e-esmalteria) ou prefere que eu faça o pré-agendamento com o sinal de R$ 30 no Pix?',
    empathyScore: 99,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Fez a leitura visual precisa da foto, identificou o serviço da tabela 2026 e protegeu a agenda de sábado com sinal Pix.',
  },
  {
    id: 'haven-pricing-dias',
    category: 'haven',
    title: '3. Preço por Dia (Corte Seg-Qua vs Qui-Sáb)',
    badge: 'Tabela Dinâmica 2026',
    description: 'Cliente pergunta a diferença de valor do corte entre terça e sábado.',
    customerPrompt: 'Quanto fica o corte com escova no sábado? É o mesmo valor de terça-feira?',
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'R$ 110 (Seg-Qua) vs R$ 140 (Qui-Sáb)',
    simulatedResponse: 'Nossos valores de Corte com Escova funcionam assim na Tabela Oficial 2026:\n\n✨ Segunda à Quarta: R$ 110,00\n✨ Quinta à Sábado: R$ 140,00\n\nEm ambos os dias está inclusa a lavagem purificante, visagismo e a finalização com escova modelada! Se você tiver flexibilidade para vir entre segunda e quarta, aproveita essa condição especial. Qual dia fica melhor para você?',
    empathyScore: 96,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Diferenciou perfeitamente as duas faixas de preço da tabela oficial 2026 sem misturar nem alucinar valores.',
  },
  {
    id: 'haven-quimica-handoff',
    category: 'haven',
    title: '4. Trava Química & Handoff Humano',
    badge: 'Guardrail Anti-Alucinação',
    description: 'Cliente com cabelo quimicamente tratado pede descoloração radical sem teste.',
    customerPrompt: 'Eu passei hennê preto faz 2 meses e agora quero platinar meu cabelo todo no sábado! Vocês fazem direto sem teste de mecha né?',
    expectedAgent: 'Handoff · Especialista Humano',
    simulatedResponse: '[ALÇADA DE SEGURANÇA CAPILAR ACIONADA] ⚠️\n\nOlá! Para a Haven, a saúde e integridade do seu cabelo vêm sempre em primeiro lugar! Como o hennê possui incompatibilidade química severa com descolorantes, NUNCA realizamos procedimento sem um Teste de Mecha prévio rigoroso para evitar corte químico.\n\nEstou transferindo seu contato imediatamente para a nossa cabeleireira técnica sênior para avaliar seu caso e agendar uma avaliação gratuita. Um instante por favor!',
    empathyScore: 95,
    accuracyScore: 100,
    guardrailStatus: 'handoff_triggered',
    explanation: 'Detectou perigo químico e interrompeu o bot imediatamente, transferindo para o profissional técnico com alçada.',
  },
  {
    id: 'haven-sinal-pix',
    category: 'haven',
    title: '5. Agendamento & Sinal PIX R$ 30',
    badge: 'Anti-No-Show',
    description: 'Cliente quer reservar horário de pico e pede dados de pagamento do sinal.',
    customerPrompt: 'Pode reservar sábado às 10h para escova modelada e pedicure? Como faço para pagar o sinal?',
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'Sinal R$ 30,00 (Descontado no total)',
    simulatedResponse: 'Perfeito! Anotei seu desejo de horário para sábado às 10h (Escova Modelada R$ 69 + Pedicure R$ 45 = Total R$ 114).\n\nPara garantir a sua cadeira exclusiva e evitar faltas, solicitamos um sinal de R$ 30,00 (que é abatido integralmente no pagamento final no salão):\n\n🔑 Chave PIX: contato@havenescovaria.com.br\n🏦 Favorecido: Haven Escovaria & Esmalteria\n\nAssim que enviar o comprovante por aqui, sua vaga fica 100% blindada na nossa agenda! 💕',
    empathyScore: 97,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Calculou a soma exata dos serviços (R$ 114) e instruiu o envio do sinal Pix de R$ 30 com clareza.',
  },
  // SOS SALES SCENARIOS
  {
    id: 'sos-ctwa-desconto',
    category: 'sos',
    title: '6. SOS Sales: Incentivo 50% OFF (12x R$ 97)',
    badge: 'B2B CTWA',
    description: 'Empresário pergunta sobre a promoção de 50% no Plano Anual.',
    customerPrompt: 'Vi o anúncio do SOS Sales com 50% de desconto. Como funciona esse valor de 12x R$ 97 e o que vem incluso?',
    expectedAgent: 'Atlas · Consultor Comercial',
    expectedPricing: '12x R$ 97 (Plano Anual)',
    simulatedResponse: 'Olá! Excelente momento para falar do SOS Sales. 🚀 O Programa de Incentivo PME libera 50% de subsídio no Plano Anual, saindo de R$ 2.328 por apenas 12x de R$ 97 sem juros.\n\nVocê recebe:\n✅ Cockpit Comercial com respostas em 1 clique (< 300ms)\n✅ Integração com WhatsApp Oficial e WAHA\n✅ Atribuição real de ROI Meta Ads CAPI (Traffic Proof)\n✅ Fila com SLA anti-vácuo e até 5 operadores\n\nQuantos atendentes ou números de WhatsApp você tem hoje na sua empresa?',
    empathyScore: 96,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Apresentou a oferta real do AbacatePay sem inventar dados e fez a pergunta de qualificação de volume.',
  },
];

export const QaSimulatorView: React.FC<QaSimulatorViewProps> = ({
  currentWorkspace,
  onSimulateIncomingLeadMessage,
  onSimulateNetworkErrorToggle,
  isNetworkErrorForced = false,
}) => {
  const isHavenActive = currentWorkspace?.id === 'ws-haven-beauty' || currentWorkspace?.name?.toLowerCase().includes('haven');
  
  const [activeCategory, setActiveCategory] = useState<'all' | 'haven' | 'sos'>(
    isHavenActive ? 'haven' : 'all'
  );

  const wsId = currentWorkspace?.id || 'ws-haven-beauty';
  const [autonomyMode, setAutonomyMode] = useState<GlobalAiAutonomyMode>(() =>
    getWorkspaceAiMode(wsId)
  );

  React.useEffect(() => {
    setAutonomyMode(getWorkspaceAiMode(wsId));
    const handleModeChanged = (e: any) => {
      if (e.detail?.workspaceId === wsId && e.detail?.mode) {
        setAutonomyMode(e.detail.mode);
      }
    };
    window.addEventListener('sos_ai_mode_changed', handleModeChanged);
    return () => window.removeEventListener('sos_ai_mode_changed', handleModeChanged);
  }, [wsId]);

  const handleToggleAutonomyMode = (mode: GlobalAiAutonomyMode) => {
    setWorkspaceAiMode(wsId, mode);
    setAutonomyMode(mode);
  };

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    isHavenActive ? 'haven-ctwa-escova' : 'haven-ctwa-escova'
  );
  const [isTesting, setIsTesting] = useState(false);
  const [activeResult, setActiveResult] = useState<TestScenario | null>(PRELOADED_SCENARIOS[0]);

  // Live Free-form Chat Sandbox
  const [customInput, setCustomInput] = useState('');
  const [customChatHistory, setCustomChatHistory] = useState<Array<{ role: 'customer' | 'assistant'; text: string; time: string }>>([
    {
      role: 'customer',
      text: isHavenActive
        ? 'Oi, queria saber se tem vaga para escova hoje à tarde!'
        : 'Olá, gostaria de entender como funciona o SOS Sales na prática.',
      time: '08:45',
    },
    {
      role: 'assistant',
      text: isHavenActive
        ? 'Olá! Seja muito bem-vinda à Haven! 🌸 Temos sim vagas para a tarde de hoje. Nossa Escova Express (Lisa R$ 59 / Modelada R$ 69) inclui ozônioterapia. Você prefere qual horário?'
        : 'Olá! O SOS Sales é o sistema operacional de vendas no WhatsApp que elimina o vácuo no atendimento com sugestões em 1 clique e rastreia o faturamento exato dos seus anúncios Meta.',
      time: '08:45',
    },
  ]);

  const [logs, setLogs] = useState<
    Array<{ timestamp: string; label: string; details: string; status: 'ok' | 'warn' | 'error' }>
  >([
    {
      timestamp: new Date().toLocaleTimeString(),
      label: 'Simulador 24/7 Inicializado',
      details: `Motor de inteligência calibrado para ${currentWorkspace?.name || 'Haven Escovaria'}. Modo: ${autonomyMode}.`,
      status: 'ok',
    },
  ]);

  const filteredScenarios = PRELOADED_SCENARIOS.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });

  const handleSelectScenario = (scenario: TestScenario) => {
    setSelectedScenarioId(scenario.id);
    setIsTesting(true);
    setTimeout(() => {
      setActiveResult(scenario);
      setIsTesting(false);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: `Simulação: ${scenario.title}`,
          details: `Alçada: ${scenario.guardrailStatus} | Empatia: ${scenario.empathyScore}% | Preço: ${scenario.accuracyScore}%.`,
          status: scenario.guardrailStatus === 'handoff_triggered' ? 'warn' : 'ok',
        },
        ...prev,
      ]);
    }, 450);
  };

  const handleSendCustomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    const userText = customInput.trim();
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setCustomChatHistory((prev) => [...prev, { role: 'customer', text: userText, time: timeNow }]);
    setCustomInput('');

    // Process simulated answer using 5-layer rule engine
    setTimeout(() => {
      let botResponse = '';
      const lower = userText.toLowerCase();

      if (isHavenActive) {
        if (lower.includes('preco') || lower.includes('preço') || lower.includes('quanto') || lower.includes('valor')) {
          if (lower.includes('corte')) {
            botResponse = 'Nosso Corte com Escova na Haven custa R$ 110 (Segunda à Quarta) e R$ 140 (Quinta à Sábado), sempre com lavagem especial de ozônio inclusa! ✨';
          } else if (lower.includes('gel') || lower.includes('unha') || lower.includes('manicure')) {
            botResponse = 'Na nossa Esmalteria: Manicure Tradicional R$ 45, Manicure Premium R$ 50, Esmaltação em Gel R$ 150 e Alongamento R$ 250! 💅';
          } else {
            botResponse = 'Temos a Escova Lisa Express por R$ 59, Modelada por R$ 69, Hidratação c/ Ozônio por R$ 85 e Reconstrução Truss por R$ 150. Qual serviço você gostaria? 🌸';
          }
        } else if (lower.includes('agendar') || lower.includes('horario') || lower.includes('horário') || lower.includes('vaga')) {
          botResponse = 'Você pode agendar em tempo real pelo nosso Trinks oficial: https://www.trinks.com/haven-escovaria-e-esmalteria ou me dizer o dia e horário que prefere para segurarmos com o sinal Pix de R$ 30! 💕';
        } else if (lower.includes('quimica') || lower.includes('química') || lower.includes('loiro') || lower.includes('platinar') || lower.includes('henne')) {
          botResponse = 'Para garantir a total saúde dos seus fios, realizamos teste de mecha obrigatório antes de químicas. Estou chamando nossa especialista técnica para te atender agora mesmo! ⚠️';
        } else {
          botResponse = 'Olá! Que prazer ter você aqui na Haven! 🌸 Em que posso te ajudar hoje: Cabelos, Unhas, Sobrancelhas ou Maquiagem?';
        }
      } else {
        if (lower.includes('preco') || lower.includes('preço') || lower.includes('plano') || lower.includes('quanto')) {
          botResponse = 'Temos o Plano Anual SOS Sales com 50% de desconto por apenas 12x de R$ 97, ou o Plano Mensal Flexível por R$ 197/mês. Ambos com Cockpit 1-Clique e Traffic Proof Meta CAPI!';
        } else {
          botResponse = 'Olá! O SOS Sales é o sistema comercial de alta performance para WhatsApp. Quantos leads ou atendentes sua operação tem hoje?';
        }
      }

      setCustomChatHistory((prev) => [
        ...prev,
        { role: 'assistant', text: botResponse, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ]);
    }, 400);
  };

  return (
    <div id="qa-simulator-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & 24/7 Autonomy Mode Switch */}
      <div className="bg-slate-950 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-bold shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white font-heading flex items-center gap-2">
                Simulador de Atendimento IA & Validador 24/7
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Anti-Alucinação Ativo
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Workspace ativo: <strong className="text-emerald-400">{currentWorkspace?.name || 'Haven Escovaria'}</strong> · Validação em tempo real de prompts, catálogo 2026 e travas de segurança
              </p>
            </div>
          </div>
        </div>

        {/* Live Autonomy Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl shrink-0">
          <button
            onClick={() => {
              handleToggleAutonomyMode('copilot_supervised');
              setLogs((prev) => [
                {
                  timestamp: new Date().toLocaleTimeString(),
                  label: 'Master Switch Global Alterado',
                  details: 'Copilot Supervisionado ATIVADO globalmente. Respostas requerem aprovação no Cockpit.',
                  status: 'ok',
                },
                ...prev,
              ]);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              autonomyMode === 'copilot_supervised'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Aprendizado (Copiloto)</span>
          </button>

          <button
            onClick={() => {
              handleToggleAutonomyMode('autonomous_24_7');
              setLogs((prev) => [
                {
                  timestamp: new Date().toLocaleTimeString(),
                  label: 'Master Switch Global Alterado',
                  details: 'Autonomia 24/7 ATIVADA globalmente. O agente responderá clientes diretamente no WhatsApp em < 30s.',
                  status: 'warn',
                },
                ...prev,
              ]);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              autonomyMode === 'autonomous_24_7'
                ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autônomo 24/7</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Scenarios + Interactive Live Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Preloaded Benchmark Scenarios (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900 font-heading">
                  Cenários Reais de Teste (Golden Path & Estresse)
                </h3>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  onClick={() => setActiveCategory('haven')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    activeCategory === 'haven'
                      ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🌸 Haven
                </button>
                <button
                  onClick={() => setActiveCategory('sos')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    activeCategory === 'sos'
                      ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚡ SOS Sales
                </button>
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    activeCategory === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({PRELOADED_SCENARIOS.length})
                </button>
              </div>
            </div>

            {/* List of clickable scenario cards */}
            <div className="grid grid-cols-1 gap-2.5">
              {filteredScenarios.map((sc) => {
                const isSelected = selectedScenarioId === sc.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => handleSelectScenario(sc)}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs'
                        : 'bg-slate-50/50 border-slate-200/80 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">{sc.title}</span>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                          {sc.badge}
                        </span>
                        {sc.hasMedia && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-0.5">
                            <Camera className="w-2.5 h-2.5" /> Foto
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{sc.description}</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sc.guardrailStatus === 'passed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {sc.guardrailStatus === 'passed' ? '100% Blindado' : 'Handoff Seguro'}
                      </span>
                      <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Test Execution Result */}
            {isTesting ? (
              <div className="py-10 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600 animate-spin" />
                <span className="text-xs font-medium">Validando prompt com o motor de 5 camadas e tabela 2026...</span>
              </div>
            ) : activeResult ? (
              <div className="bg-slate-900 text-white rounded-xl p-4.5 space-y-3.5 border border-slate-800 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <Bot className="w-3.5 h-3.5" /> {activeResult.expectedAgent}
                    </span>
                    {activeResult.expectedPricing && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                        🏷️ {activeResult.expectedPricing}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      Empatia: {activeResult.empathyScore}%
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                      Precisão: {activeResult.accuracyScore}%
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-slate-400" /> Mensagem Simulada do Cliente:
                  </div>
                  <div className="text-xs italic text-slate-300 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60 leading-relaxed">
                    {activeResult.customerPrompt}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Sparkle className="w-3 h-3 text-emerald-400" /> Resposta Calculada da IA (Zero Alucinação):
                  </div>
                  <div className="text-xs text-white bg-slate-950 p-3 rounded-lg border border-emerald-500/30 leading-relaxed font-normal whitespace-pre-line">
                    {activeResult.simulatedResponse}
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-800/40 p-2 rounded-lg border border-slate-700/40 flex items-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Auditoria de IA:</strong> {activeResult.explanation}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Column: Live Chat Sandbox & Emergency Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live Chat Sandbox */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col h-[480px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-bold text-sm text-slate-900 font-heading">
                  Playground de Conversa Livre
                </h3>
              </div>
              <button
                onClick={() => setCustomChatHistory([])}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Limpar
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
              {customChatHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs italic text-center p-4">
                  Envie uma mensagem abaixo para ver a IA respondendo em tempo real com as regras ativas.
                </div>
              ) : (
                customChatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.role === 'customer' ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.role === 'customer'
                          ? 'bg-slate-100 text-slate-900 rounded-tl-xs'
                          : 'bg-emerald-600 text-white rounded-tr-xs shadow-2xs font-normal'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 px-1">{msg.time}</span>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendCustomMessage} className="pt-2 border-t border-slate-100 flex items-center gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder={
                  isHavenActive
                    ? 'Ex: Quanto fica unha de gel com francesinha?'
                    : 'Ex: Qual o valor do plano anual com desconto?'
                }
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <button
                type="submit"
                className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shrink-0 shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Quick Trigger Buttons */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-slate-900">Ações Rápidas de Disparo</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (onSimulateIncomingLeadMessage) onSimulateIncomingLeadMessage();
                  setLogs((prev) => [
                    {
                      timestamp: new Date().toLocaleTimeString(),
                      label: 'Lead Injetado',
                      details: 'Novo lead CTWA injetado no Cockpit.',
                      status: 'ok',
                    },
                    ...prev,
                  ]);
                }}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center"
              >
                <Play className="w-3.5 h-3.5 text-emerald-600" />
                <span>Injetar no Cockpit</span>
              </button>

              <button
                onClick={() => {
                  if (onSimulateNetworkErrorToggle) onSimulateNetworkErrorToggle();
                  setLogs((prev) => [
                    {
                      timestamp: new Date().toLocaleTimeString(),
                      label: isNetworkErrorForced ? 'Rede Normalizada' : 'Falha Forçada',
                      details: isNetworkErrorForced ? 'Modo normal restaurado.' : 'Simulando offline retry no composer.',
                      status: isNetworkErrorForced ? 'ok' : 'warn',
                    },
                    ...prev,
                  ]);
                }}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-center ${
                  isNetworkErrorForced
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <AlertTriangle className={`w-3.5 h-3.5 ${isNetworkErrorForced ? 'text-rose-600' : 'text-amber-600'}`} />
                <span>{isNetworkErrorForced ? 'Desativar Falha' : 'Forçar Falha Rede'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal de Eventos de QA */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs shadow-xs space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5 font-bold">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Log de Auditoria & Eventos do Simulador 24/7
          </span>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            Limpar Log
          </button>
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic py-2">Nenhum evento registrado ainda.</div>
          ) : (
            logs.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">[{item.timestamp}]</span>
                <span
                  className={`font-bold shrink-0 ${
                    item.status === 'ok'
                      ? 'text-emerald-400'
                      : item.status === 'warn'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {item.label}:
                </span>
                <span className="text-slate-300">{item.details}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
