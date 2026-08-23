import React, { useState } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Brain,
  Sparkles,
  TrendingUp,
  Clock,
  MessageSquare,
  Flame,
  CheckCircle2,
  AlertTriangle,
  HeartHandshake,
  Bot,
  Zap,
  RotateCcw,
  BookOpen,
  Camera,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Percent,
} from 'lucide-react';

interface HistoricalDiagnosisSectionProps {
  workspace: Workspace;
}

export const HistoricalDiagnosisSection: React.FC<HistoricalDiagnosisSectionProps> = ({ workspace }) => {
  const isHaven = workspace.id === 'ws-haven-beauty' || workspace.name.toLowerCase().includes('haven');

  const [isMining, setIsMining] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState('Hoje às 09:00 (1 Ano de Conversas Ingerido)');
  const [appliedFeedback, setAppliedFeedback] = useState(false);

  const handleRunDiagnosis = () => {
    setIsMining(true);
    setAppliedFeedback(false);

    setTimeout(() => {
      setIsMining(false);
      setLastSyncDate('Atualizado agora (1.842 conversas reprocessadas)');
    }, 1200);
  };

  const handleApplyToAgent = () => {
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 3000);
  };

  return (
    <div id="historical-diagnosis-section" className="space-y-6">
      {/* Top Banner: 1 Year Mining Overview */}
      <div className="bg-[var(--sos-surface)] border-[var(--sos-border)] rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/30">
              <Brain className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white font-heading flex items-center gap-2">
              Diagnóstico de 1 Ano de Conversas Reais (2024 – 2026)
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                1.842 Conversas Analisadas
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Análise das 1.842 conversas reais do WhatsApp da <strong>{workspace.name}</strong> para compreender a forma como as clientes chegam, o que perguntam, horários de pico e onde ocorriam perdas de agendamento no passado.
          </p>
          <div className="text-[11px] text-slate-400 font-mono">
            Última análise: <strong className="text-purple-300">{lastSyncDate}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRunDiagnosis}
            disabled={isMining}
            className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-1.5 shadow-md"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isMining ? 'animate-spin' : ''}`} />
            <span>{isMining ? 'Minerando Padrões...' : 'Re-analisar Histórico'}</span>
          </button>

          <button
            onClick={handleApplyToAgent}
            className="py-2.5 px-3.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md"
          >
            {appliedFeedback ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{appliedFeedback ? 'Aplicado na Bia!' : 'Injetar no Prompt'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Historical Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Conversas Mapeadas</span>
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-black text-slate-900 font-heading">
            {isHaven ? '1.842' : '960'}
          </div>
          <p className="text-[11px] text-slate-500">
            Histórico completo de chats de clientes reais
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Demanda Fora de Hora</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-600 font-heading">
            38.4%
          </div>
          <p className="text-[11px] text-slate-500">
            Mensagens recebidas à noite e fins de semana
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Tempo Médio Passado</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-black text-rose-600 font-heading">
            18m 40s
          </div>
          <p className="text-[11px] text-slate-500">
            Gargalo humano superado para &lt; 30s pela IA
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Envio de Fotos</span>
            <Camera className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-600 font-heading">
            27.6%
          </div>
          <p className="text-[11px] text-slate-500">
            Clientes mandam referências de unhas e cortes
          </p>
        </div>
      </div>

      {/* SECTION 1: MAPA DE CHEGADA & SERVIÇOS PROCURADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Intenções de Compra (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-sm text-slate-900 font-heading">
                Mapa de Intenções de Chegada dos Clientes
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">Volume Real</span>
          </div>

          <div className="space-y-3.5">
            {/* Service 1 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  1. Escova Express & Tratamentos c/ Ozônio (Lisa R$ 59 / Modelada R$ 69)
                </span>
                <span className="font-bold text-purple-700 font-mono">42% (774 conversas)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: '42%' }} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                &ldquo;Tem horário para hoje à tarde? A lavagem com ozônio já está inclusa no valor?&rdquo;
              </p>
            </div>

            {/* Service 2 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  2. Esmalteria em Gel, Russa & Alongamento (R$ 45 a R$ 250)
                </span>
                <span className="font-bold text-purple-700 font-mono">28% (515 conversas)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: '28%' }} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                &ldquo;[Foto de unha anexada] Vocês conseguem fazer essa francesinha fina em gel no sábado?&rdquo;
              </p>
            </div>

            {/* Service 3 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  3. Corte c/ Visagismo & Preço por Dia (Seg-Qua R$ 110 vs Qui-Sáb R$ 140)
                </span>
                <span className="font-bold text-purple-700 font-mono">16% (294 conversas)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: '16%' }} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                &ldquo;Qual o valor do corte no sábado? Precisa agendar ou posso ir direto?&rdquo;
              </p>
            </div>

            {/* Service 4 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  4. Reconstrução Truss, Detox & K-Beauty (R$ 85 a R$ 150)
                </span>
                <span className="font-bold text-purple-700 font-mono">9% (165 conversas)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: '9%' }} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                &ldquo;Meu cabelo está muito ressecado da praia, qual o melhor tratamento rápido?&rdquo;
              </p>
            </div>

            {/* Service 5 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  5. Make, Penteados para Noivas & Madrinhas (R$ 100 a R$ 220)
                </span>
                <span className="font-bold text-purple-700 font-mono">5% (94 conversas)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full rounded-full" style={{ width: '5%' }} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                &ldquo;Tenho um casamento sábado às 18h, tem como fazer penteado e make completa?&rdquo;
              </p>
            </div>
          </div>
        </div>

        {/* Right: Como as Clientes Esperam Ser Atendidas (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <HeartHandshake className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900 font-heading">
              Expectativas Críticas das Clientes
            </h3>
          </div>

          <div className="space-y-3">
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>1. Tom Caloroso, Elegante e Direto</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                As clientes adoram ser tratadas com delicadeza e emojis pontuais (🌸, ✨), sem formalidade engessada nem enrolação para passar preços.
              </p>
            </div>

            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>2. Resposta Imediata sobre Duração</span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Sempre informar o tempo estimado (ex: <em>40 min para escova</em>, <em>1h para unha em gel</em>), pois muitas clientes vão no horário de almoço.
              </p>
            </div>

            <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                <span>3. Confirmação com Sinal Pix R$ 30</span>
              </div>
              <p className="text-[11px] text-purple-800 leading-relaxed">
                Historicamente, quando o sinal de R$ 30 era solicitado de forma simpática, a taxa de no-show caiu em <strong>88%</strong> nos sábados.
              </p>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                <span>4. Autonomia de Link Trinks</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                40% das clientes preferem clicar no link do Trinks para escolher o profissional preferido diretamente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ANTES (HUMANO COM VÁCUO) VS DEPOIS (BIA 24/7 BLINDADA) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Zap className="w-4 h-4 text-amber-600" />
          <h3 className="font-bold text-sm text-slate-900 font-heading">
            Comparativo de Atendimento: Antes vs Com a Bia 24/7
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Antes */}
          <div className="bg-rose-50/40 border border-rose-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Como acontecia no passado (Pontos de Perda de Venda)</span>
            </div>

            <div className="space-y-2 text-rose-800">
              <div className="p-2.5 bg-white rounded-lg border border-rose-100 space-y-0.5">
                <div className="font-bold text-[11px]">Cliente (Sexta às 20h30):</div>
                <div className="italic">&ldquo;Tem vaga para escova amanhã cedo?&rdquo;</div>
                <div className="text-[10px] text-rose-600 font-bold mt-1">
                  ❌ Vácuo: Respondido apenas no sábado às 08h20 quando a cliente já havia procurado outro salão.
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-rose-100 space-y-0.5">
                <div className="font-bold text-[11px]">Cliente (Foto de Nail Art):</div>
                <div className="italic">&ldquo;Quanto fica essa unha?&rdquo;</div>
                <div className="text-[10px] text-rose-600 font-bold mt-1">
                  ❌ Resposta vaga: &ldquo;Depende da manicure, você precisa vir aqui para ver&rdquo; (Cliente desistia).
                </div>
              </div>
            </div>
          </div>

          {/* Depois com a Bia */}
          <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Como a Bia responde agora (100% Blindada)</span>
            </div>

            <div className="space-y-2 text-emerald-900">
              <div className="p-2.5 bg-white rounded-lg border border-emerald-100 space-y-0.5">
                <div className="font-bold text-[11px]">Resposta em 15 segundos:</div>
                <div className="text-[11px] leading-relaxed">
                  &ldquo;Olá! Temos sim encaixes maravilhosos para amanhã cedo! 🌸 Nossa Escova Express inclui ozônioterapia. Você prefere às 08h30 ou 09h30? Se quiser, pode reservar na hora pelo Trinks!&rdquo;
                </div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1">
                  ✅ Retenção do lead em tempo real na sexta à noite.
                </div>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-emerald-100 space-y-0.5">
                <div className="font-bold text-[11px]">Leitura Visual da Foto:</div>
                <div className="text-[11px] leading-relaxed">
                  &ldquo;Uau, que linda referência! ✨ É a nossa Esmaltação em Gel Premium com francesinha (R$ 150,00, dura até 21 dias). Quer garantir o horário no sábado com o sinal Pix?&rdquo;
                </div>
                <div className="text-[10px] text-emerald-700 font-bold mt-1">
                  ✅ Preço exato da tabela 2026 e fechamento com sinal Pix.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
