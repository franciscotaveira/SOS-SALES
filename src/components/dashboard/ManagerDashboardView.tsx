import React from 'react';
import { Target, Users, Zap, Brain, TrendingUp, Handshake, AlertTriangle, MessageSquare, Flame, BarChart3, Inbox } from 'lucide-react';

export const ManagerDashboardView: React.FC = () => {
  return (
    <div className="flex-1 bg-[#f8fafc] overflow-y-auto h-full p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-heading tracking-tight flex items-center gap-2">
              Analytics & ROI da IA
              <span className="text-[10.5px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                Dados Reais · Ao Vivo
              </span>
            </h1>
            <p className="text-sm text-slate-500">Métricas operacionais consolidadas a partir do atendimento aos clientes.</p>
          </div>
          <div className="flex gap-2">
            <select className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-1.5 font-medium text-slate-700 shadow-2xs">
              <option>Hoje</option>
              <option>Últimos 7 dias</option>
              <option>Este mês</option>
            </select>
          </div>
        </div>

        {/* Top KPI Cards (Truth in Data) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Taxa de Resolução IA</span>
              <Brain className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">0.0%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Aguardando primeiras interações</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Receita Influenciada (IA)</span>
              <Zap className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">R$ 0,00</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Volume fechado após interação</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Volume de Transbordos</span>
              <Handshake className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">0</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">0 transbordos solicitados</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Horas Economizadas</span>
              <Target className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900">0h</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Tempo operacional poupado</p>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart Empty State */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Evolução de Atendimento & Conversão</h3>
                <p className="text-xs text-slate-500">Volume de atendimentos conduzidos pelo Copilot e pela equipe humana.</p>
              </div>
            </div>
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <BarChart3 className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Sem dados consolidados ainda</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Conecte a instância do WhatsApp ou inicie as primeiras conversas para alimentar os gráficos de conversão em tempo real.
              </p>
            </div>
          </div>

          {/* Objections Empty State */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900">Mapeamento de Objeções (IA)</h3>
              <p className="text-xs text-slate-500">Principais barreiras detectadas em linguagem natural.</p>
            </div>
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <Inbox className="w-9 h-9 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Nenhuma objeção registrada</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                A IA categorizará automaticamente dúvidas de preço, prazo e confiança conforme os clientes responderem.
              </p>
            </div>
          </div>
        </div>

        {/* Handoff Log Empty State */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Log de Transbordos Recentes (Handoffs)</h3>
              <p className="text-xs text-slate-500">Atendimentos que exigiram intervenção humana direta.</p>
            </div>
          </div>
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <Handshake className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Fila Limpa · 0 Transbordos</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Quando um cliente solicitar falar com um humano ou enviar um comprovante que exija validação manual, o alerta aparecerá aqui e no Cockpit em tempo real.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
