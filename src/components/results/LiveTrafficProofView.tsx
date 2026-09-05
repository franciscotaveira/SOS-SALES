import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, AlertCircle, CalendarDays, TrendingUp, Users, Target, DollarSign, ShieldAlert } from 'lucide-react';
import { ApiTrafficProofCampaign, ApiTrafficProofReport, SalesOsGateway } from '../../services/salesOsGateway';
import { getSupabaseClient } from '../../services/supabaseAuth';

interface LiveTrafficProofViewProps {
  workspaceId: string;
  gateway: SalesOsGateway;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; value: ApiTrafficProofReport };

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

    const client = getSupabaseClient();
    let channel: any;
    if (client) {
      channel = client
        .channel(`live-traffic-proof-${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'commercial_outcomes',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            void loadMetrics(true);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'campaign_spend_daily_facts',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            void loadMetrics(true);
          }
        )
        .subscribe();
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadMetrics(true);
    }, 30000);

    return () => {
      if (client && channel) void client.removeChannel(channel);
      clearInterval(timer);
    };
  }, [loadMetrics, workspaceId]);

  const refresh = () => loadMetrics(true);

  const handleSubmitPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    void loadMetrics();
  };

  const campaigns: ApiTrafficProofCampaign[] = loadState.state === 'ready'
    ? (Array.isArray(loadState.value?.data)
        ? loadState.value.data
        : Array.isArray((loadState.value as any)?.campaigns)
        ? (loadState.value as any).campaigns
        : Array.isArray(loadState.value)
        ? (loadState.value as any)
        : [])
    : [];
  const acquiredLeads = campaigns.reduce((acc, item) => acc + (item?.acquiredLeads || 0), 0);
  const wonOutcomes = campaigns.reduce((acc, item) => acc + (item?.wonOutcomes || 0), 0);
  const revenueMinor = campaigns.reduce((acc, item) => acc + (item?.revenueMinor || 0), 0);
  const importedSpend = campaigns.reduce((acc, item) => acc + (item?.spendMinor ?? 0), 0);
  const hasUnknownSpend = campaigns.some((c) => c?.spendMinor === null || c?.spendMinor === undefined);

  return (
    <main className="mx-auto max-w-7xl px-3 sm:px-4 py-3 lg:px-5 space-y-3">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[var(--sos-border)]">
        <div>
          <p className="flex items-center gap-1 text-[9.5px] font-bold text-[var(--sos-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sos-success)] animate-pulse" />
            Proof of Traffic Audit
          </p>
          <h1 className="mt-0.5 text-base font-bold tracking-tight text-[var(--sos-ink)]">
            Resultados & Atribuição de Tráfego
          </h1>
          <p className="text-[9.5px] text-[var(--sos-muted)] mt-0.5">
            Atribuição auditável baseada em coorte de aquisição e desfechos comerciais reais.
          </p>
        </div>

        <form onSubmit={handleSubmitPeriod} className="flex flex-wrap items-center gap-1.5 text-xs">
          <label className="flex items-center gap-1 rounded-lg border border-[var(--sos-border)] bg-[var(--sos-surface)] px-2 py-1 shadow-2xs">
            <span className="text-[var(--sos-muted)] font-medium">De:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent font-medium text-[var(--sos-ink)] focus:outline-none text-xs"
            />
          </label>
          <label className="flex items-center gap-1 rounded-lg border border-[var(--sos-border)] bg-[var(--sos-surface)] px-2 py-1 shadow-2xs">
            <span className="text-[var(--sos-muted)] font-medium">Até:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent font-medium text-[var(--sos-ink)] focus:outline-none text-xs"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--sos-action)] hover:bg-[var(--sos-action)]/90 px-3 py-1 text-[9.5px] font-bold text-white shadow-2xs transition cursor-pointer"
          >
            <CalendarDays size={13} /> Atualizar período
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loadState.state === 'loading'}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--sos-border)] bg-[var(--sos-surface)] hover:bg-[var(--sos-border)]/30 px-2.5 py-1 text-[9.5px] font-semibold text-[var(--sos-ink)] shadow-2xs transition disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Atualizar dados
          </button>
        </form>
      </section>

      <div className="space-y-3" aria-busy={loadState.state === 'loading'}>
        {loadState.state === 'loading' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-xl border border-[var(--sos-border)] bg-[var(--sos-border)]/30" />
            ))}
          </div>
        )}

        {loadState.state === 'error' && (
          <EmptyEvidence title="Prova de resultado indisponível" detail={loadState.message} />
        )}

        {loadState.state === 'ready' && (
          <>
            {/* Metric KPI Cards */}
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Leads Atribuídos"
                value={formatInteger(acquiredLeads)}
                detail="Na coorte selecionada"
                icon={<Users size={15} className="text-[var(--sos-operational)]" />}
              />
              <MetricCard
                label="Desfechos Ganhos"
                value={formatInteger(wonOutcomes)}
                detail="Resultados WON registrados"
                icon={<Target size={15} className="text-[var(--sos-success)]" />}
              />
              <MetricCard
                label="Receita Registrada"
                value={formatCurrency(revenueMinor)}
                detail="Desfechos comerciais confirmados"
                icon={<DollarSign size={15} className="text-[var(--sos-success)]" />}
              />
              <MetricCard
                label="Investimento Importado"
                value={hasUnknownSpend ? 'Parcialmente importado' : formatCurrency(importedSpend)}
                detail={hasUnknownSpend ? 'Há campanhas sem gasto registrado' : 'Importações de mídia'}
                icon={<TrendingUp size={15} className="text-[var(--sos-ai)]" />}
              />
            </section>

            {/* Campaign Breakdown Table */}
            <section className="overflow-hidden rounded-xl border border-[var(--sos-border)] bg-[var(--sos-surface)] shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sos-border)] bg-[var(--sos-border)]/30 px-3 py-2.5">
                <div>
                  <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-[var(--sos-ink)]">
                    <BarChart3 size={14} className="text-[var(--sos-success)]" /> Evidência por Origem e Campanha
                  </p>
                  <p className="text-[9.5px] text-[var(--sos-muted)]">
                    Base: {loadState.value?.meta?.basis === 'acquisition_cohort' ? 'coorte de aquisição' : 'coorte de aquisição'} · {loadState.value?.meta?.from || fromDate} a {loadState.value?.meta?.to || toDate}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--sos-border)]/50 px-2 py-0.5 font-mono text-[9.5px] font-bold text-[var(--sos-muted)]">
                  {campaigns.length} grupos
                </span>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-4">
                  <EmptyEvidence
                    title="Nenhuma aquisição encontrada"
                    detail="Não há registros de aquisição na janela escolhida. Isso não prova ausência de investimento fora do período."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[10.5px]">
                    <thead className="bg-[var(--sos-border)]/30 border-b border-[var(--sos-border)] text-[var(--sos-muted)] font-bold uppercase tracking-wider text-[9px]">
                      <tr>
                        <th className="px-3 py-2">Origem / Campanha</th>
                        <th className="px-3 py-2 text-right">Leads</th>
                        <th className="px-3 py-2 text-right">Ganhos</th>
                        <th className="px-3 py-2 text-right">Perdas</th>
                        <th className="px-3 py-2 text-right">Receita</th>
                        <th className="px-3 py-2 text-right">Gasto Importado</th>
                        <th className="px-3 py-2 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sos-border)] text-[var(--sos-ink)]">
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
            <section className="rounded-xl border border-[var(--sos-border)] bg-[var(--sos-canvas)] p-3 text-[var(--sos-ink)] shadow-2xs">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--sos-success)]">
                Regra Soberana de Evidência
              </p>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-[var(--sos-muted)]">
                “Não importado” não significa R$ 0,00. O SOS Vendas só calcula ROAS quando o gasto da campanha foi importado e associado à mesma coorte. Nenhuma estimativa ou simulação fictícia é criada.
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
    <section className="rounded-xl border border-[var(--sos-border)] bg-[var(--sos-surface)] p-3 shadow-2xs">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--sos-muted)]">{label}</p>
        <div className="p-1 rounded-lg bg-[var(--sos-border)]/30 border border-[var(--sos-border)]">{icon}</div>
      </div>
      <p className="mt-2 break-words font-mono text-lg font-bold text-[var(--sos-ink)]">{value}</p>
      <p className="mt-0.5 text-[9.5px] text-[var(--sos-muted)]">{detail}</p>
    </section>
  );
}

const CampaignRow: React.FC<{ campaign: ApiTrafficProofCampaign }> = ({ campaign }) => {
  if (!campaign) return null;
  const roasVal = typeof campaign.roas === 'number' ? campaign.roas : null;
  return (
    <tr className="hover:bg-[var(--sos-border)]/30 transition-colors">
      <td className="px-3 py-2">
        <p className="font-bold text-[var(--sos-ink)]">{campaignTitle(campaign)}</p>
        <p className="mt-0.5 font-mono text-[9.5px] text-[var(--sos-muted)]">
          {campaign.source || 'Meta Ads'}
          {campaign.campaignId ? ` · ${campaign.campaignId}` : ''}
        </p>
      </td>
      <td className="px-3 py-2 text-right font-mono text-[var(--sos-muted)]">{formatInteger(campaign.acquiredLeads || 0)}</td>
      <td className="px-3 py-2 text-right font-mono font-bold text-[var(--sos-success)]">{formatInteger(campaign.wonOutcomes || 0)}</td>
      <td className="px-3 py-2 text-right font-mono text-[var(--sos-danger)]">{formatInteger(campaign.lostOutcomes || 0)}</td>
      <td className="px-3 py-2 text-right font-mono font-bold text-[var(--sos-ink)]">
        {formatCurrency(campaign.revenueMinor || 0, campaign.currency || 'BRL')}
      </td>
      <td className="px-3 py-2 text-right font-mono">
        {campaign.spendMinor === null || campaign.spendMinor === undefined ? (
          <span className="font-sans text-[9.5px] text-[var(--sos-muted)]">Não importado</span>
        ) : (
          formatCurrency(campaign.spendMinor, campaign.currency || 'BRL')
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {roasVal === null ? (
          <span className="rounded border border-[var(--sos-border)] bg-[var(--sos-border)]/30 px-1.5 py-0.5 text-[9.5px] text-[var(--sos-muted)]">
            Não calculável
          </span>
        ) : (
          <span className="rounded border border-[var(--sos-success)]/30 bg-[var(--sos-success-subtle)] px-1.5 py-0.5 font-mono font-bold text-[var(--sos-success)] text-[10.5px]">
            {(Number(roasVal) || 0).toFixed(2)}x
          </span>
        )}
      </td>
    </tr>
  );
};

function EmptyEvidence({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl shadow-2xs">
      <ShieldAlert size={24} className="text-[var(--sos-muted)] mb-1.5" />
      <p className="text-xs font-bold text-[var(--sos-ink)]">{title}</p>
      <p className="mt-0.5 text-[9.5px] text-[var(--sos-muted)] max-w-md">{detail}</p>
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
