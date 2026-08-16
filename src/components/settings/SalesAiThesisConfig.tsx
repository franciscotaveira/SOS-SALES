import React, { useState, useEffect } from 'react';
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
  Smile,
  Send,
  Calendar,
  Briefcase,
  HeartHandshake,
  Wrench,
  Stethoscope,
  Building2,
  ShieldAlert,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  getWorkspaceAiMode,
  setWorkspaceAiMode,
  GlobalAiAutonomyMode,
} from '../../services/aiAutonomyManager';

export type TonePreset =
  | 'elegante_acolhedor'
  | 'direto_objetivo'
  | 'tecnico_formal'
  | 'comercial_fechador'
  | 'empatico_cuidadoso';

export type RhythmPreset = 'instantaneo' | 'natural_humano' | 'pausado_artesanal';

export type MessageStructurePreset = 'picado_whatsapp' | 'bloco_unico';

export type EmojiUsagePreset = 'delicado_pontual' | 'vibrante_expressivo' | 'zero_emojis';

export type PrimaryGoalPreset = 'agendamento' | 'sinal_pix' | 'orcamento' | 'qualificacao_vendedor';

export const SalesAiThesisConfig: React.FC<{ workspaceId?: string }> = ({ workspaceId = 'ws-haven-beauty' }) => {
  // Global Autonomy Mode (Single Source of Truth)
  const [globalMode, setGlobalMode] = useState<GlobalAiAutonomyMode>(() => getWorkspaceAiMode(workspaceId));

  useEffect(() => {
    setGlobalMode(getWorkspaceAiMode(workspaceId));
    const handleModeChanged = (e: any) => {
      if (e.detail?.workspaceId === workspaceId && e.detail?.mode) {
        setGlobalMode(e.detail.mode);
      }
    };
    window.addEventListener('sos_ai_mode_changed', handleModeChanged);
    return () => window.removeEventListener('sos_ai_mode_changed', handleModeChanged);
  }, [workspaceId]);

  // Tone & Personality Settings
  const STORAGE_KEY = `sos_sales_personality_config_${workspaceId}`;

  const [tone, setTone] = useState<TonePreset>('elegante_acolhedor');
  const [rhythm, setRhythm] = useState<RhythmPreset>('natural_humano');
  const [structure, setStructure] = useState<MessageStructurePreset>('picado_whatsapp');
  const [emojis, setEmojis] = useState<EmojiUsagePreset>('delicado_pontual');
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoalPreset>('agendamento');

  // Business Safety Limits
  const [maxDiscountPercent, setMaxDiscountPercent] = useState<number>(10);
  const [humanHandoffTriggers, setHumanHandoffTriggers] = useState({
    quimicaSensivel: true,
    reclamacoes: true,
    pedidoHumano: true,
    descontoAlto: true,
  });

  const [typingDelaySeconds, setTypingDelaySeconds] = useState<number>(20);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Load saved settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tone) setTone(parsed.tone);
        if (parsed.rhythm) setRhythm(parsed.rhythm);
        if (parsed.structure) setStructure(parsed.structure);
        if (parsed.emojis) setEmojis(parsed.emojis);
        if (parsed.primaryGoal) setPrimaryGoal(parsed.primaryGoal);
        if (parsed.maxDiscountPercent !== undefined) setMaxDiscountPercent(parsed.maxDiscountPercent);
        if (parsed.humanHandoffTriggers) setHumanHandoffTriggers(parsed.humanHandoffTriggers);
        if (parsed.typingDelaySeconds !== undefined) setTypingDelaySeconds(parsed.typingDelaySeconds);
      }
    } catch {
      // fallback
    }
  }, [STORAGE_KEY]);

  const handleSaveConfig = () => {
    const config = {
      tone,
      rhythm,
      structure,
      emojis,
      primaryGoal,
      maxDiscountPercent,
      humanHandoffTriggers,
      typingDelaySeconds,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  const handleToggleGlobalMode = (newMode: GlobalAiAutonomyMode) => {
    setWorkspaceAiMode(workspaceId, newMode);
    setGlobalMode(newMode);
  };

  // Live Preview Message Generator based on Current Calibration
  const getLivePreview = () => {
    if (tone === 'elegante_acolhedor') {
      if (structure === 'picado_whatsapp') {
        return [
          'Olá, que bom ter você aqui! 🌸 Temos sim horários disponíveis para hoje.',
          'Nossa Escova Express (Lisa R$ 59 / Modelada R$ 69) inclui a lavagem com ozônio. Você prefere vir no período da tarde ou início da noite?',
        ];
      }
      return [
        'Olá! Que prazer ter você aqui conosco! 🌸 Temos sim disponibilidade para hoje. Nossa Escova Express (Lisa R$ 59 / Modelada R$ 69) inclui a lavagem especial com ozônio. Você prefere no período da tarde ou início da noite?',
      ];
    }

    if (tone === 'direto_objetivo') {
      if (structure === 'picado_whatsapp') {
        return [
          'Olá! Temos vaga disponível para hoje sim.',
          'A escova lisa está R$ 59 e a modelada R$ 69. Qual horário fica melhor: às 14h ou às 16h30?',
        ];
      }
      return [
        'Olá! Temos horários para hoje sim. A escova lisa está R$ 59 e a modelada R$ 69 com lavagem inclusa. Qual horário fica melhor para você: às 14h ou às 16h30?',
      ];
    }

    if (tone === 'tecnico_formal') {
      return [
        'Olá. Confirmamos a disponibilidade de atendimento para a presente data. O procedimento padrão contempla higienização capilar por ozonioterapia e finalização estruturada. Qual seria a sua preferência de horário para agendamento?',
      ];
    }

    if (tone === 'comercial_fechador') {
      return [
        'Oi! Que excelente escolha! ✨ As vagas de hoje estão super concorridas, mas separei 2 encaixes perfeitos para você.',
        'A escova promocional de R$ 59 já inclui lavagem com ozônio. Quer garantir a sua vaga às 15h ou às 17h com o sinal Pix de R$ 30?',
      ];
    }

    // empatico_cuidadoso
    return [
      'Olá, querida! Seja muito bem-vinda! 🌷 Cuidaremos do seu cabelo com todo o carinho e conforto.',
      'Temos horários livres hoje para você relaxar. Você prefere vir no começo da tarde ou mais pro final do dia?',
    ];
  };

  const previewBubbles = getLivePreview();

  return (
    <div id="sales-ai-thesis-config" className="space-y-6 animate-in fade-in duration-150">
      {/* Top Banner: Master Calibration Overview */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00A884] to-emerald-400 text-slate-950 flex items-center justify-center font-bold shadow-md">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white font-heading flex items-center gap-2">
                Personalidade, Tom & Comportamento da IA
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00A884]/20 text-emerald-300 border border-[#00A884]/30">
                  Calibração Humanizada
                </span>
              </h1>
              <p className="text-xs text-slate-300">
                Ajuste como o seu atendente inteligente deve conversar no WhatsApp, o ritmo das respostas, o nível de energia e as regras de avanço de vendas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSaveConfig}
            className="py-2.5 px-4 rounded-xl text-xs font-bold bg-[#00A884] hover:bg-[#009473] text-white transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            {savedFeedback ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
            <span>{savedFeedback ? 'Calibração Salva!' : 'Salvar Calibração'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: MODO DE OPERAÇÃO (AUTONOMIA & HORÁRIOS) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 font-heading">
            <Zap className="w-4 h-4 text-[#00A884]" />
            <span>1. Modo de Atendimento Principal</span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Status Atual: <strong className={globalMode === 'autonomous_24_7' ? 'text-emerald-700' : 'text-indigo-700'}>
              {globalMode === 'autonomous_24_7' ? '⚡ 100% Autônomo 24/7' : '🛡️ Aprendizado (Copiloto c/ 1-Clique)'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card: Modo Aprendizado */}
          <div
            onClick={() => handleToggleGlobalMode('copilot_supervised')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
              globalMode === 'copilot_supervised'
                ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-2 ring-indigo-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-indigo-950">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Modo Aprendizado (Copiloto Supervisionado)</span>
              </div>
              <span className={`w-3.5 h-3.5 rounded-full border-2 ${globalMode === 'copilot_supervised' ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`} />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A IA sugere a melhor resposta em menos de 1 segundo dentro do Cockpit. <strong>Nenhuma mensagem é enviada sem o atendente humano aprovar com 1 clique</strong>. Ideal para calibrar o tom da equipe e aprender com as conversas.
            </p>
          </div>

          {/* Card: Modo Autônomo 24/7 */}
          <div
            onClick={() => handleToggleGlobalMode('autonomous_24_7')}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-2 ${
              globalMode === 'autonomous_24_7'
                ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Modo Autônomo 24/7 (Piloto Automático Ativo)</span>
              </div>
              <span className={`w-3.5 h-3.5 rounded-full border-2 ${globalMode === 'autonomous_24_7' ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`} />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A IA responde diretamente os clientes no WhatsApp em menos de 30 segundos, tira dúvidas de catálogo, envia link de agendamento/Pix e transfere para humanos apenas em casos sensíveis.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: TOM DE VOZ & ENERGIA (SELETORES VISUAIS) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 font-heading">
            <Smile className="w-4 h-4 text-purple-600" />
            <span>2. Tom de Voz & Estilo de Conversa</span>
          </div>
          <span className="text-xs text-slate-500">Como a IA deve falar com o cliente</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Preset 1: Elegante & Acolhedor */}
          <button
            type="button"
            onClick={() => setTone('elegante_acolhedor')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer space-y-1.5 ${
              tone === 'elegante_acolhedor'
                ? 'border-purple-600 bg-purple-50/50 shadow-xs ring-2 ring-purple-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="text-lg">🌸</div>
            <div className="font-bold text-xs text-slate-900">Elegante & Acolhedor</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Carinhoso, delicado e atento aos detalhes. (Salões, Estética, Moda)
            </p>
          </button>

          {/* Preset 2: Direto & Objetivo */}
          <button
            type="button"
            onClick={() => setTone('direto_objetivo')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer space-y-1.5 ${
              tone === 'direto_objetivo'
                ? 'border-emerald-600 bg-emerald-50/50 shadow-xs ring-2 ring-emerald-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="text-lg">⚡</div>
            <div className="font-bold text-xs text-slate-900">Direto & Rápido</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Sem enrolação, focado em resolver no ato. (Oficinas, Peças, Delivery)
            </p>
          </button>

          {/* Preset 3: Técnico & Formal */}
          <button
            type="button"
            onClick={() => setTone('tecnico_formal')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer space-y-1.5 ${
              tone === 'tecnico_formal'
                ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="text-lg">👔</div>
            <div className="font-bold text-xs text-slate-900">Técnico & Formal</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Vocabulário seguro, sem gírias. (Advocacia, Contábil, B2B)
            </p>
          </button>

          {/* Preset 4: Comercial & Fechador */}
          <button
            type="button"
            onClick={() => setTone('comercial_fechador')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer space-y-1.5 ${
              tone === 'comercial_fechador'
                ? 'border-amber-600 bg-amber-50/50 shadow-xs ring-2 ring-amber-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="text-lg">🚀</div>
            <div className="font-bold text-xs text-slate-900">Comercial & Closer</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Foco em quebrar objeções e urgência. (Cursos, Imóveis, Carros)
            </p>
          </button>

          {/* Preset 5: Empático & Cuidadoso */}
          <button
            type="button"
            onClick={() => setTone('empatico_cuidadoso')}
            className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer space-y-1.5 ${
              tone === 'empatico_cuidadoso'
                ? 'border-rose-600 bg-rose-50/50 shadow-xs ring-2 ring-rose-600/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="text-lg">🩺</div>
            <div className="font-bold text-xs text-slate-900">Empático & Cuidadoso</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              Acolhimento, respeito e escuta. (Clínicas Médicas, Dentistas, Saúde)
            </p>
          </button>
        </div>
      </div>

      {/* SECTION 3: RITMO, FORMATO DAS MENSAGENS & EMOJIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Col 1: Ritmo & Digitando */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 font-heading border-b border-slate-100 pb-2.5">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>3. Ritmo de Resposta</span>
          </div>

          <div className="space-y-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setRhythm('instantaneo');
                setTypingDelaySeconds(5);
              }}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                rhythm === 'instantaneo' ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>⚡ Resposta Imediata (&lt; 5s)</span>
              <span className="text-[10px] text-slate-500">Noturno / Urgência</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRhythm('natural_humano');
                setTypingDelaySeconds(20);
              }}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                rhythm === 'natural_humano' ? 'bg-indigo-50 border-indigo-500 text-indigo-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>💬 Ritmo Natural (15s a 25s)</span>
              <span className="text-[10px] text-indigo-700 font-bold">Mais Humano</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRhythm('pausado_artesanal');
                setTypingDelaySeconds(35);
              }}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                rhythm === 'pausado_artesanal' ? 'bg-purple-50 border-purple-500 text-purple-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>⏳ Pausado (35s)</span>
              <span className="text-[10px] text-slate-500">Consultivo VIP</span>
            </button>
          </div>
        </div>

        {/* Col 2: Estrutura das Mensagens */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 font-heading border-b border-slate-100 pb-2.5">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            <span>4. Tamanho das Mensagens</span>
          </div>

          <div className="space-y-2 text-xs">
            <button
              type="button"
              onClick={() => setStructure('picado_whatsapp')}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                structure === 'picado_whatsapp' ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>🗨️ Mensagens Curtas (2 a 3 balões)</span>
              <span className="text-[10px] text-blue-700 font-bold">Estilo WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => setStructure('bloco_unico')}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                structure === 'bloco_unico' ? 'bg-blue-50 border-blue-500 text-blue-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>📄 Mensagem Única Completa</span>
              <span className="text-[10px] text-slate-500">1 Balão</span>
            </button>
          </div>
        </div>

        {/* Col 3: Uso de Emojis */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 font-heading border-b border-slate-100 pb-2.5">
            <Smile className="w-4 h-4 text-amber-600" />
            <span>5. Presença de Emojis</span>
          </div>

          <div className="space-y-2 text-xs">
            <button
              type="button"
              onClick={() => setEmojis('delicado_pontual')}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                emojis === 'delicado_pontual' ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>🌸 Delicado & Pontual (1 ou 2)</span>
              <span className="text-[10px] text-amber-800 font-bold">Recomendado</span>
            </button>

            <button
              type="button"
              onClick={() => setEmojis('vibrante_expressivo')}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                emojis === 'vibrante_expressivo' ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>🎉 Vibrante & Amigável</span>
              <span className="text-[10px] text-slate-500">Expressivo</span>
            </button>

            <button
              type="button"
              onClick={() => setEmojis('zero_emojis')}
              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                emojis === 'zero_emojis' ? 'bg-slate-100 border-slate-400 text-slate-950 font-bold' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>🚫 Sem Emojis (Estritamente Formal)</span>
              <span className="text-[10px] text-slate-500">Sério</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: TRAVAS DE SEGURANÇA & QUANDO CHAMAR O HUMANO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 font-heading border-b border-slate-100 pb-3">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          <span>6. Travas de Segurança & Quando Chamar um Atendente Humano</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Desconto Máximo */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-900">
              <span>Desconto Máximo que a IA pode dar sem pedir pro chefe:</span>
              <span className="text-emerald-700 font-mono text-sm">{maxDiscountPercent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={25}
              value={maxDiscountPercent}
              onChange={(e) => setMaxDiscountPercent(Number(e.target.value))}
              className="w-full accent-[#00A884]"
            />
            <p className="text-[11px] text-slate-500">
              Se o cliente pedir um desconto acima de {maxDiscountPercent}%, a IA pausa e transfere para o supervisor no Cockpit.
            </p>
          </div>

          {/* Gatilhos de Transbordo */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="font-bold text-slate-900">Transferir Imediatamente para Humano se:</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanHandoffTriggers.pedidoHumano}
                  onChange={(e) => setHumanHandoffTriggers({ ...humanHandoffTriggers, pedidoHumano: e.target.checked })}
                  className="rounded text-[#00A884]"
                />
                <span>Cliente pedir atendente</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanHandoffTriggers.quimicaSensivel}
                  onChange={(e) => setHumanHandoffTriggers({ ...humanHandoffTriggers, quimicaSensivel: e.target.checked })}
                  className="rounded text-[#00A884]"
                />
                <span>Dúvida de química / risco</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanHandoffTriggers.reclamacoes}
                  onChange={(e) => setHumanHandoffTriggers({ ...humanHandoffTriggers, reclamacoes: e.target.checked })}
                  className="rounded text-[#00A884]"
                />
                <span>Reclamações ou litígio</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanHandoffTriggers.descontoAlto}
                  onChange={(e) => setHumanHandoffTriggers({ ...humanHandoffTriggers, descontoAlto: e.target.checked })}
                  className="rounded text-[#00A884]"
                />
                <span>Negociação complexa</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5: PRÉ-VISUALIZAÇÃO AO VIVO (COMO A IA RESPONDE NA PRÁTICA) */}
      <div className="bg-gradient-to-br from-[#0B141A] to-[#111B21] text-white rounded-2xl p-5 border border-slate-800 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2 font-bold text-xs text-white">
            <Brain className="w-4 h-4 text-[#00A884]" />
            <span>Pré-visualização Ao Vivo no WhatsApp (Simulação do Tom Escolhido)</span>
          </div>
          <span className="text-[10px] font-mono bg-white/10 text-emerald-400 px-2 py-0.5 rounded-full">
            Efeito Imediato
          </span>
        </div>

        {/* Simulated Chat Bubble */}
        <div className="space-y-2.5 max-w-lg">
          {/* Customer */}
          <div className="flex justify-start">
            <div className="bg-[#202C33] text-slate-100 text-xs px-3.5 py-2 rounded-2xl rounded-tl-xs max-w-xs shadow-xs space-y-0.5">
              <p>Olá! Vocês têm horário para escova hoje à tarde?</p>
              <div className="text-[10px] text-slate-400 text-right">14:02</div>
            </div>
          </div>

          {/* AI Response Preview */}
          {previewBubbles.map((bubble, idx) => (
            <div key={idx} className="flex justify-end">
              <div className="bg-[#005C4B] text-white text-xs px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-md shadow-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-1">
                <p className="leading-relaxed">{bubble}</p>
                <div className="text-[10px] text-emerald-200 text-right flex items-center justify-end gap-1">
                  <span>14:02</span>
                  <span>✓✓</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
