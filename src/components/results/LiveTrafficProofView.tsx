import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, AlertCircle, CalendarDays, TrendingUp, Users, Target, DollarSign, ShieldAlert } from 'lucide-react';
import { ApiTrafficProofCampaign, ApiTrafficProofResponse, SalesOsGateway } from '../../services/salesOsGateway';

interface LiveTrafficProofViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; value: ApiTrafficProofResponse };

function defaultPeriod() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export const LiveTrafficProofView: React.FC<LiveTrafficProofViewProps> = ({ workspaceId, gateway }) => {
  const initial = defaultPeriod();
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [loadState, setLoadState] = useState<LoadState>({ state: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadState({ state: 'loading' });

    try {
      const fn = (gateway as any).getTrafficProofMetrics?.bind(gateway) || (gateway as any).getTrafficProof?.bind(gateway);
      if (!fn) throw new Error('Método de Traffic Proof não implementado no Gateway.');
      const response = await fn(workspaceId, { from: fromDate, to: toDate });
      setLoadState({ state: 'ready', value: response });
    } catch (err) {
      setLoadState({
        state: 'error',
        message: err instanceof Error ? err.message : 'Falha ao carregar métricas auditáveis de tráfego.',
      });
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, [gateway, workspaceId, fromDate, toDate]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const refresh = () => loadMetrics(true);

  const handleSubmitPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    void loadMetrics();
  };

  const campaigns = loadState.state === 'ready' ? loadState.value.campaigns : [];
  const acquiredLeads = campaigns.reduce((acc, item) => acc + item.acquiredLeads, 0);
  const wonOutcomes = campaigns.reduce((acc, item) => acc + item.wonOutcomes, 0);
  const revenueMinor = campaigns.reduce((acc, item) => acc + item.revenueMinor, 0);
  const importedSpend = campaigns.reduce((acc, item) => acc + (item.spendMinor ?? 0), 0);
  const hasUnknownSpend = campaigns.some((c) => c.spendMinor === null);

  return (
    <main className="mx-auto max-w-7xl px-4 py-5 lg:px-6">
      {/* Header */}
      <section className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-xs">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Proof of Traffic Audit
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 font-heading">
            Resultados & Atribuição de Tráfego
          </h1>
          <p className="text-xs text-slate-500">
            Atribuição auditável baseada em coorte de aquisição e desfechos comerciais reais.
          </p>
        </div>

        <form onSubmit={handleSubmitPeriod} className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-2xs">
            <span className="text-slate-500 font-medium">De:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent font-medium text-slate-900 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-2xs">
            <span className="text-slate-500 font-medium">Até:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent font-medium text-slate-900 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition cursor-pointer"
          >
            <CalendarDays size={14} /> Atualizar período
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loadState.state === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar dados
          </button>
        </form>
      </section>

      <div className="mt-4" aria-busy={loadState.state === 'loading'}>
        {loadState.state === 'loading' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        )}

        {loadState.state === 'error' && (
          <EmptyEvidence title="Prova de resultado indisponível" detail={loadState.message} />
        )}

        {loadState.state === 'ready' && (
          <>
            {/* Metric KPI Cards */}
            <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Leads Atribuídos"
                value={formatInteger(acquiredLeads)}
                detail="Na coorte selecionada"
                icon={<Users size={16} className="text-blue-600" />}
              />
              <MetricCard
                label="Desfechos Ganhos"
                value={formatInteger(wonOutcomes)}
                detail="Resultados WON registrados"
                icon={<Target size={16} className="text-emerald-600" />}
              />
              <MetricCard
                label="Receita Registrada"
                value={formatCurrency(revenueMinor)}
                detail="Desfechos comerciais confirmados"
                icon={<DollarSign size={16} className="text-emerald-600" />}
              />
              <MetricCard
                label="Investimento Importado"
                value={hasUnknownSpend ? 'Parcialmente importado' : formatCurrency(importedSpend)}
                detail={hasUnknownSpend ? 'Há campanhas sem gasto registrado' : 'Importações de mídia'}
                icon={<TrendingUp size={16} className="text-indigo-600" />}
              />
            </section>

            {/* Campaign Breakdown Table */}
            <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-900 font-heading">
                    <BarChart3 size={15} className="text-emerald-600" /> Evidência por Origem e Campanha
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Base: {loadState.value.meta.basis === 'acquisition_cohort' ? 'coorte de aquisição' : 'não informada'} · {loadState.value.meta.from} a {loadState.value.meta.to}
                  </p>
                </div>
                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                  {campaigns.length} grupos
                </span>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-6">
                  <EmptyEvidence
                    title="Nenhuma aquisição encontrada"
                    detail="Não há registros de aquisição na janela escolhida. Isso não prova ausência de investimento fora do período."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                      <tr>
                        <th className="px-4 py-3">Origem / Campanha</th>
                        <th className="px-4 py-3 text-right">Leads</th>
                        <th className="px-4 py-3 text-right">Ganhos</th>
                        <th className="px-4 py-3 text-right">Perdas</th>
                        <th className="px-4 py-3 text-right">Receita</th>
                        <th className="px-4 py-3 text-right">Gasto Importado</th>
                        <th className="px-4 py-3 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {campaigns.map((campaign) => (
                        <CampaignRow
                          key={`${campaign.source}:${campaign.campaignId ?? campaign.campaignName ?? 'unknown'}`}
                          campaign={campaign}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Sovereign Truth In Data Note */}
            <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white shadow-xs">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-heading">
                Regra Soberana de Evidência
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                “Não importado” não significa R$ 0,00. O SOS Sales só calcula ROAS quando o gasto da campanha foi importado e associado à mesma coorte. Nenhuma estimativa ou simulação fictícia é criada.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-heading">{label}</p>
        <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">{icon}</div>
      </div>
      <p className="mt-2.5 break-words font-mono text-xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </section>
  );
}

function CampaignRow({ campaign }: { campaign: ApiTrafficProofCampaign }) {
  return (
    <tr className="hover:bg-slate-50/70 transition-colors">
      <td className="px-4 py-3.5">
        <p className="font-bold text-slate-900">{campaignTitle(campaign)}</p>
        <p className="mt-0.5 font-mono text-[10.5px] text-slate-500">
          {campaign.source}
          {campaign.campaignId ? ` · ${campaign.campaignId}` : ''}
        </p>
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-slate-700">{formatInteger(campaign.acquiredLeads)}</td>
      <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">{formatInteger(campaign.wonOutcomes)}</td>
      <td className="px-4 py-3.5 text-right font-mono text-rose-600">{formatInteger(campaign.lostOutcomes)}</td>
      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
        {formatCurrency(campaign.revenueMinor, campaign.currency)}
      </td>
      <td className="px-4 py-3.5 text-right font-mono">
        {campaign.spendMinor === null ? (
          <span className="font-sans text-[11px] text-slate-400">Não importado</span>
        ) : (
          formatCurrency(campaign.spendMinor, campaign.currency)
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {campaign.roas === null ? (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] text-slate-500">
            Não calculável
          </span>
        ) : (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono font-bold text-emerald-800 text-[11px]">
            {campaign.roas.toFixed(2)}x
          </span>
        )}
      </td>
    </tr>
  );
}

function EmptyEvidence({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-2xs">
      <ShieldAlert size={28} className="text-slate-400 mb-2" />
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-xs text-slate-500 max-w-md">{detail}</p>
    </div>
  );
}

function campaignTitle(c: ApiTrafficProofCampaign): string {
  return c.campaignName || c.campaignId || `Campanha ${c.source}`;
}

function formatInteger(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(v);
}

function formatCurrency(minor: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100);
}
