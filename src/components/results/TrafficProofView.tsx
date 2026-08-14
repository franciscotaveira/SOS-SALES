import React from 'react';
import { TrafficProofStats, SalesOsGateway } from '../../services/salesOsGateway';
import { Journey, Workspace } from '../../types/cockpit';
import {
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  ShieldCheck,
  Target,
} from 'lucide-react';

interface TrafficProofViewProps {
  workspace: Workspace;
  gateway: SalesOsGateway;
  journeys: Journey[];
}

export const TrafficProofView: React.FC<TrafficProofViewProps> = ({
  workspace,
  gateway,
  journeys,
}) => {
  const [stats, setStats] = React.useState<TrafficProofStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    gateway.getTrafficStats(workspace.id).then((data) => {
      if (isMounted) {
        setStats(data);
        setIsLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [workspace.id, gateway, journeys]);

  if (isLoading || !stats) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div id="traffic-proof-view" className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h1 className="text-xl font-bold text-slate-900">
              Prova de Resultado Comercial
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Atribuição ponta a ponta: Anúncio Meta CTWA ➔ Atendimento Humano ➔ Faturamento Real
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-slate-500">Unidade:</span>
          <span className="font-bold text-slate-800">{workspace.name}</span>
        </div>
      </div>

      {/* 4 Macro KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Won Revenue */}
        <div className="cockpit-panel p-4 bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Receita Gerada</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            R$ {stats.totalDealsWonBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" />
            Fechamentos confirmados pelos operadores
          </div>
        </div>

        {/* CTWA Spend */}
        <div className="cockpit-panel p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Investimento Mídia (CTWA)</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            R$ {stats.totalCtwaCostBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.totalLeadsAttributed} leads capturados
          </div>
        </div>

        {/* ROAS Ratio */}
        <div className="cockpit-panel p-4 bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">ROAS Comercial</span>
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-900 font-mono">
            {stats.roasRatio > 0 ? `${stats.roasRatio.toFixed(1)}x` : 'Em apuração'}
          </div>
          <div className="text-[11px] text-blue-700 font-medium mt-1">
            Retorno sobre o gasto de anúncio
          </div>
        </div>

        {/* SLA Adherence */}
        <div className="cockpit-panel p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Aderência de SLA</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {stats.slaAdherenceRate}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Tempo médio 1ª resposta: <strong>{stats.avgFirstResponseMinutes} min</strong>
          </div>
        </div>
      </div>

      {/* Campaigns Table Breakdown */}
      <div className="cockpit-panel overflow-hidden">
        <div className="cockpit-panel-header px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Desempenho por Campanha Meta Ads (CTWA)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Atualizado em tempo real
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Campanha / Criativo</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Gasto CTWA</th>
                <th className="px-4 py-3 text-right">Conversões</th>
                <th className="px-4 py-3 text-right">Receita Gerada</th>
                <th className="px-4 py-3 text-right">Taxa Conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {stats.campaigns.map((camp, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {camp.campaignName}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono">{camp.leadsCount}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600">
                    R$ {camp.spendBrl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">
                    {camp.conversionsCount}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                    R$ {camp.revenueBrl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      {camp.conversionRate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Continuity Proof Chain Explanation */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          Garantia de Não-Vazamento Comercial
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          No Sales OS, cada real investido no anúncio CTWA possui continuidade direta: a oferta vista pelo cliente no Instagram/Facebook chega intacta ao operador com o contexto do veículo ou serviço, a recomendação inteligente sugere a resposta exata e o fechamento retroalimenta o ROAS.
        </p>
      </div>
    </div>
  );
};
