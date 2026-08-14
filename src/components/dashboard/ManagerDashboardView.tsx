import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell } from 'recharts';
import { Target, Users, Zap, Brain, TrendingUp, Handshake, AlertTriangle, MessageSquare, Flame } from 'lucide-react';

const revenueData = [
  { name: 'Seg', humano: 4000, ia: 2400 },
  { name: 'Ter', humano: 3000, ia: 4398 },
  { name: 'Qua', humano: 2000, ia: 6800 },
  { name: 'Qui', humano: 2780, ia: 7908 },
  { name: 'Sex', humano: 1890, ia: 9800 },
  { name: 'Sáb', humano: 2390, ia: 11800 },
  { name: 'Dom', humano: 3490, ia: 14300 },
];

const objectionData = [
  { name: 'Preço Alto', value: 85, color: '#f43f5e' },
  { name: 'Prazo', value: 65, color: '#f59e0b' },
  { name: 'Desconfiança', value: 45, color: '#8b5cf6' },
  { name: 'Concorrente', value: 35, color: '#0ea5e9' },
];

export const ManagerDashboardView: React.FC = () => {
  return (
    <div className="flex-1 bg-[#f8fafc] overflow-y-auto h-full p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 font-heading">Analytics & ROI da IA</h1>
            <p className="text-sm text-slate-500">Visão executiva do impacto do Sales OS na operação.</p>
          </div>
          <div className="flex gap-2">
            <select className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-1.5 font-medium text-slate-700 shadow-2xs">
              <option>Últimos 7 dias</option>
              <option>Este mês</option>
            </select>
            <button className="bg-slate-900 text-white text-sm font-bold px-4 py-1.5 rounded-lg shadow-sm hover:bg-slate-800 transition-colors">
              Exportar Relatório
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Taxa de Resolução IA</span>
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">78.4%</span>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> +5.2%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Atendimentos sem Handoff</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Receita Influenciada (IA)</span>
              <Zap className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">R$ 57k</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Volume fechado após interação</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Volume de Handoffs</span>
              <Handshake className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">21.6%</span>
                <span className="text-xs font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                  Queda na retenção
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">142 transbordos esta semana</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-32">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">Economia Estimada</span>
              <Target className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">142h</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Horas operacionais salvas</p>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading">Evolução de Receita: Humano vs. IA</h2>
              <p className="text-xs text-slate-500">Comparativo do volume de fechamentos ao longo da semana.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9333ea" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#9333ea" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorHumano" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => `R$${val/1000}k`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, undefined]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Area type="monotone" dataKey="ia" name="Convertido pela IA" stroke="#9333ea" strokeWidth={3} fillOpacity={1} fill="url(#colorIa)" />
                  <Area type="monotone" dataKey="humano" name="Convertido pelo Humano" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorHumano)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Objections Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 font-heading">Mapa de Objeções (IA)</h2>
              <p className="text-xs text-slate-500">Principais barreiras detectadas.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={objectionData} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {objectionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Handoff Log */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900 font-heading">Log de Transbordos Recentes (Handoffs)</h2>
            <p className="text-xs text-slate-500">Últimos atendimentos que exigiram intervenção humana.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Motivo do Handoff</th>
                  <th className="pb-3 font-medium">Tempo de IA</th>
                  <th className="pb-3 font-medium">Status Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-3 text-slate-900 font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">MR</div>
                    Marcelo Ribeiro
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">
                      <AlertTriangle className="w-3 h-3" /> Solicitação de Desconto Extra
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">4 min</td>
                  <td className="py-3"><span className="text-emerald-600 font-bold text-xs">Fechado (Ganho)</span></td>
                </tr>
                <tr>
                  <td className="py-3 text-slate-900 font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">LM</div>
                    Luciana Melo
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-xs font-bold">
                      <Flame className="w-3 h-3" /> Risco de Cancelamento
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">12 min</td>
                  <td className="py-3"><span className="text-amber-600 font-bold text-xs">Em Negociação</span></td>
                </tr>
                <tr>
                  <td className="py-3 text-slate-900 font-medium flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">CP</div>
                    Carlos Pereira
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">
                      <MessageSquare className="w-3 h-3" /> Dúvida Técnica Complexa
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">8 min</td>
                  <td className="py-3"><span className="text-slate-500 font-bold text-xs">Aguardando Cliente</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
