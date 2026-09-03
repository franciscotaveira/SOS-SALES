import React, { useState, useEffect } from 'react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import {
  Target,
  Users,
  Zap,
  Brain,
  TrendingUp,
  Handshake,
  AlertTriangle,
  MessageSquare,
  Flame,
  BarChart3,
  Inbox,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Bot,
  User,
  DollarSign,
  AlertCircle,
} from 'lucide-react';

interface ManagerDashboardViewProps {
  workspace?: Workspace;
}

export const ManagerDashboardView: React.FC<ManagerDashboardViewProps> = ({ workspace }) => {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const wsId = workspace?.id || '';

  const fetchMetrics = async () => {
    if (!wsId) {
      setData(null);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/reports/performance-sla?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.metrics || null);
      } else {
        setFetchError('Não foi possível carregar as métricas do servidor.');
      }
    } catch {
      setFetchError('Erro de conexão com o servidor de métricas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMetrics();
  }, [wsId, period]);

  const metrics = data || {
    aiResponseTimeFormatted: '—',
    humanResponseTimeFormatted: 'Sem registros',
    speedAdvantage: 'Sem dados',
    goldenWindowPercent: 0,
    volumeDistribution: {
      aiPercent: 0,
      humanPercent: 0,
      aiHandledCount: 0,
      humanHandledCount: 0,
    },
    trafficAudit: {
      totalAdLeads: 0,
      respondedUnder5m: 0,
      delayedOver15m: 0,
      adRevenueAtRiskBrl: '0.00',
      trafficVsAttendanceVerdict:
        'Sem dados de tráfego suficientes para gerar o parecer neste período. Conforme os leads chegarem pelo WhatsApp, a auditoria de SLA será calculada em tempo real.',
    },
    hourlySpeedHeatmap: [
      { period: 'Manhã (08h-12h)', aiSpeed: '—', humanSpeed: '—', status: 'SEM_DADOS' },
      { period: 'Almoço (12h-14h)', aiSpeed: '—', humanSpeed: '—', status: 'SEM_DADOS' },
      { period: 'Tarde (14h-18h)', aiSpeed: '—', humanSpeed: '—', status: 'SEM_DADOS' },
      { period: 'Noite/Madrugada (18h-08h)', aiSpeed: '—', humanSpeed: '—', status: 'SEM_DADOS' },
    ],
  };

  return (
    <div className="flex-1 bg-[#f8fafc] overflow-y-auto h-full p-4 sm:p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-black text-slate-900 font-heading tracking-tight flex items-center gap-2">
                Performance WhatsApp & SLA de Resposta
              </h1>
              <span className="text-[10.5px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                Humano vs IA · Auditoria de Tráfego
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Confronto de velocidade de atendimento, taxa na Janela de Ouro (&lt; 5 min) e proteção contra perda de leads de anúncios.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="bg-white border border-slate-200 text-xs rounded-xl px-3 py-2 font-bold text-slate-700 shadow-2xs outline-none"
            >
              <option value="today">Hoje (24h)</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>

            <button
              onClick={fetchMetrics}
              disabled={loading}
              className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl shadow-2xs transition cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error / Alert Banner if API failed */}
        {fetchError && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{fetchError} Exibindo estado sem dados até a próxima sincronização.</span>
            </div>
            <button
              onClick={fetchMetrics}
              className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-amber-800 font-bold hover:bg-amber-100 transition text-xs cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Top 4 Confrontation KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Velocidade IA */}
          <div className="bg-gradient-to-br from-purple-900 via-slate-900 to-slate-950 text-white rounded-2xl p-4 shadow-sm border border-purple-500/30 flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-purple-400" />
                Tempo de Resposta (IA)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Imediato
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white font-mono">{metrics.aiResponseTimeFormatted}</span>
                <span className="text-xs text-purple-300 font-semibold">média</span>
              </div>
              <p className="text-[11px] text-purple-200/70 mt-1">Atendimento 24/7 sem fila de espera</p>
            </div>
          </div>

          {/* Card 2: Velocidade Humana */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-amber-500" />
                Tempo Humano (Operador)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Gargalo
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 font-mono">{metrics.humanResponseTimeFormatted}</span>
                <span className="text-xs text-slate-400 font-semibold">espera</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Horário comercial / pausas operacionais</p>
            </div>
          </div>

          {/* Card 3: Vantagem de Velocidade */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-500" />
                Vantagem de Velocidade
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Ganho
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 font-mono">{metrics.speedAdvantage}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">A IA responde antes do lead abrir o concorrente</p>
            </div>
          </div>

          {/* Card 4: Janela de Ouro */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200 flex flex-col justify-between h-36">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-500" />
                Janela de Ouro (&lt; 5 min)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                Alta Conversão
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 font-mono">{metrics.goldenWindowPercent == null ? '—' : `${metrics.goldenWindowPercent}%`}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Leads atendidos no pico do desejo de compra</p>
            </div>
          </div>
        </div>

        {/* Tráfego vs Atendimento Audit Card (A Arma do Gestor / Consultor de Vendas) */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-purple-950 text-white rounded-2xl p-6 border border-purple-500/40 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Auditoria de Conversão: Tráfego Pago vs. Atendimento Comercial
                </h3>
                <p className="text-xs text-slate-300">
                  Prova irrefutável para separar o desempenho do anúncio da agilidade da equipe no WhatsApp.
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-[10.5px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0 self-start sm:self-auto">
              Proteção de ROI & Diagnóstico
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Leads de Anúncios Recebidos</span>
              <span className="text-2xl font-black text-white font-mono">{metrics.trafficAudit?.totalAdLeads || 0}</span>
              <span className="text-[11px] text-emerald-400 block mt-0.5">Entregues pelo Tráfego Pago</span>
            </div>

            <div className="p-3.5 bg-slate-900/80 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Atendidos na Janela (&lt; 5m)</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">{metrics.trafficAudit?.respondedUnder5m || 0}</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">Conversão máxima preservada</span>
            </div>

            <div className="p-3.5 bg-rose-950/40 rounded-xl border border-rose-500/30">
              <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Leads Esfriados (&gt; 15m espera)</span>
              <span className="text-2xl font-black text-rose-400 font-mono">{metrics.trafficAudit?.delayedOver15m || 0}</span>
              <span className="text-[11px] text-rose-300 font-semibold block mt-0.5">
                R$ {metrics.trafficAudit?.adRevenueAtRiskBrl || '0.00'} de receita já atribuída
              </span>
            </div>
          </div>

          {/* Veredito */}
          <div className="p-3.5 bg-purple-950/50 border border-purple-500/30 rounded-xl flex items-start gap-3 text-xs text-purple-200">
            <AlertCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block mb-0.5">Veredito Comercial Automatizado:</span>
              <p className="text-slate-300 leading-relaxed">
                {metrics.trafficAudit?.trafficVsAttendanceVerdict}
              </p>
            </div>
          </div>
        </div>

        {/* Heatmap & Volume Distribution Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Heatmap de Velocidade por Horário */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  Velocidade de Atendimento por Faixa de Horário
                </h3>
                <p className="text-xs text-slate-500">Comparativo direto de latência de resposta ao cliente.</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {metrics.hourlySpeedHeatmap.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Ainda não há amostra suficiente para comparar faixas de horário. Os dados aparecerão após respostas reais.
                </p>
              ) : metrics.hourlySpeedHeatmap.map((item: any, idx: number) => (
                <div key={idx} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-800">{item.period}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold ${
                        item.status === 'OK'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'GARGALO'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">🤖 Copilot IA</span>
                      <span className="font-mono font-bold text-purple-600">{item.aiSpeed}</span>
                    </div>
                    <div className="text-right min-w-[70px]">
                      <span className="text-[10px] text-slate-400 block">👤 Humano</span>
                      <span className={`font-mono font-bold ${item.status === 'CRÍTICO' ? 'text-rose-600' : 'text-slate-700'}`}>
                        {item.humanSpeed}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Volume Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-emerald-600" />
                Divisão de Carga de Trabalho
              </h3>
              <p className="text-xs text-slate-500">Volume de conversas conduzidas pelo Copilot vs. Humano.</p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-purple-700 flex items-center gap-1">🤖 Copilot IA ({metrics.volumeDistribution?.aiPercent}%)</span>
                  <span className="text-slate-600 flex items-center gap-1">👤 Humano ({metrics.volumeDistribution?.humanPercent}%)</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div style={{ width: `${metrics.volumeDistribution?.aiPercent}%` }} className="bg-purple-600 h-full" />
                  <div style={{ width: `${metrics.volumeDistribution?.humanPercent}%` }} className="bg-slate-400 h-full" />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Atendimentos Conduzidos por IA:</span>
                  <span className="font-bold text-slate-900">{metrics.volumeDistribution?.aiHandledCount}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Atendimentos Conduzidos por Humano:</span>
                  <span className="font-bold text-slate-900">{metrics.volumeDistribution?.humanHandledCount}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200/60">
                  <span>Amostra de respostas medidas:</span>
                  <span>{(metrics.volumeDistribution?.aiHandledCount || 0) + (metrics.volumeDistribution?.humanHandledCount || 0)}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Supervisão ativa no Live Cockpit com transbordo instantâneo.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
