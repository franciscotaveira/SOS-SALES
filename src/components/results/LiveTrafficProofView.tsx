import React from 'react';
import {
  BarChart3,
  CalendarDays,
  DatabaseZap,
  DollarSign,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  ApiTrafficProofCampaign,
  ApiTrafficProofReport,
  HttpSalesOsGateway,
  SalesOsTransportError,
} from '../../services/salesOsGateway';

interface LiveTrafficProofViewProps {
  workspaceId: string;
  workspaceName: string;
  gateway: HttpSalesOsGateway;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'ready'; value: ApiTrafficProofReport }
  | { state: 'error'; message: string };

function dateInSaoPaulo(offsetDays: number): string {
  const localDate = new Date();
  localDate.setDate(localDate.getDate() + offsetDays);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(localDate);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatCurrency(minor: number | null, currency = 'BRL'): string {
  if (minor === null) return 'Não importado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function campaignTitle(campaign: ApiTrafficProofCampaign): string {
  return campaign.campaignName || campaign.campaignId || campaign.source || 'Origem sem identificação';
}

function EmptyEvidence({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{detail}</p>
    </section>
  );
}

/**
 * A factual, authenticated replacement for the fixture-based Traffic Proof
 * screen. It intentionally never derives spend, ROAS, CPL or SLA in the
 * browser: only the cohort values returned by the API are shown.
 */
export const LiveTrafficProofView: React.FC<LiveTrafficProofViewProps> = ({
  workspaceId,
  workspaceName,
  gateway,
}) => {
  const [from, setFrom] = React.useState(() => dateInSaoPaulo(-29));
  const [to, setTo] = React.useState(() => dateInSaoPaulo(0));
  const [loadState, setLoadState] = React.useState<LoadState>({ state: 'loading' });
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (range = { from, to }) => {
    setLoadState({ state: 'loading' });
    try {
      const value = await gateway.getTrafficProof(workspaceId, range);
      setLoadState({ state: 'ready', value });
    } catch (error) {
      const message = error instanceof SalesOsTransportError
        ? error.message
        : 'Não foi possível carregar a prova de resultado autenticada.';
      setLoadState({ state: 'error', message });
    }
  }, [from, gateway, to, workspaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submitRange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (from > to) {
      setLoadState({ state: 'error', message: 'A data inicial não pode ser posterior à data final.' });
      return;
    }
    void load({ from, to });
  };

  const refresh = async () => {
    setRefreshing(true);
    await load({ from, to });
    setRefreshing(false);
  };

  const campaigns = loadState.state === 'ready' ? loadState.value.data : [];
  const acquiredLeads = campaigns.reduce((total, campaign) => total + campaign.acquiredLeads, 0);
  const wonOutcomes = campaigns.reduce((total, campaign) => total + campaign.wonOutcomes, 0);
  const revenueMinor = campaigns.reduce((total, campaign) => total + campaign.revenueMinor, 0);
  const importedSpend = campaigns.reduce<number | null>((total, campaign) => {
    if (campaign.spendMinor === null) return total;
    return (total ?? 0) + campaign.spendMinor;
  }, null);
  const hasUnknownSpend = campaigns.some((campaign) => campaign.spendMinor === null);

  return (
    <main className="mx-auto h-full w-full max-w-7xl overflow-y-auto p-4 sm:p-6">
      <section className="rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700"><DatabaseZap size={15} /> Operação autenticada</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Prova de resultado comercial</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Coorte de aquisição: origem e campanha que trouxeram o lead, desfechos comerciais e receita registrada no Supabase.</p>
          </div>
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs">
            <p className="text-slate-500">Workspace</p>
            <p className="mt-0.5 font-mono font-bold text-slate-800">{workspaceName}</p>
          </div>
        </div>

        <form onSubmit={submitRange} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
          <label className="text-xs font-bold text-slate-700">De
            <input value={from} onChange={(event) => setFrom(event.target.value)} type="date" required className="mt-1 block rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:outline-none" />
          </label>
          <label className="text-xs font-bold text-slate-700">Até
            <input value={to} onChange={(event) => setTo(event.target.value)} type="date" required className="mt-1 block rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-500 focus:outline-none" />
          </label>
          <button type="submit" className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"><CalendarDays size={16} /> Atualizar período</button>
          <button type="button" onClick={() => void refresh()} disabled={refreshing || loadState.state === 'loading'} className="inline-flex items-center gap-2 rounded-lg border-2 border-emerald-600 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Atualizar dados</button>
        </form>
      </section>

      <div className="mt-5" aria-busy={loadState.state === 'loading'}>
        {loadState.state === 'loading' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl border-2 border-slate-200 bg-slate-100" />)}</div>}
        {loadState.state === 'error' && <EmptyEvidence title="Prova de resultado indisponível" detail={loadState.message} />}
        {loadState.state === 'ready' && <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Leads atribuídos" value={formatInteger(acquiredLeads)} detail="Na coorte de aquisição selecionada" icon={<Users size={17} />} tone="blue" />
            <MetricCard label="Desfechos ganhos" value={formatInteger(wonOutcomes)} detail="Resultados WON registrados" icon={<Target size={17} />} tone="emerald" />
            <MetricCard label="Receita registrada" value={formatCurrency(revenueMinor)} detail="Somente desfechos comerciais persistidos" icon={<DollarSign size={17} />} tone="emerald" />
            <MetricCard label="Investimento importado" value={hasUnknownSpend ? 'Parcialmente importado' : formatCurrency(importedSpend)} detail={hasUnknownSpend ? 'Há campanhas sem comprovante de gasto; ROAS não é consolidado.' : 'Importações de mídia desta coorte'} icon={<TrendingUp size={17} />} tone="violet" />
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border-2 border-blue-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
              <div><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><BarChart3 size={16} className="text-blue-700" /> Evidência por origem e campanha</p><p className="mt-0.5 text-xs text-slate-600">Base: {loadState.value.meta.basis === 'acquisition_cohort' ? 'coorte de aquisição' : 'não informada'} · {loadState.value.meta.from} a {loadState.value.meta.to}</p></div>
              <span className="rounded-lg border border-blue-200 bg-white px-2 py-1 font-mono text-xs text-blue-800">{campaigns.length} grupos</span>
            </div>
            {campaigns.length === 0 ? <div className="p-5"><EmptyEvidence title="Nenhuma aquisição encontrada" detail="Não há registros de aquisição na janela escolhida. Isso não prova ausência de investimento fora do período." /></div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Origem / campanha</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Ganhos</th><th className="px-4 py-3 text-right">Perdas</th><th className="px-4 py-3 text-right">Receita</th><th className="px-4 py-3 text-right">Gasto importado</th><th className="px-4 py-3 text-right">ROAS</th></tr></thead><tbody className="divide-y divide-slate-100 text-slate-800">{campaigns.map((campaign) => <CampaignRow key={`${campaign.source}:${campaign.campaignId ?? campaign.campaignName ?? 'unknown'}`} campaign={campaign} />)}</tbody></table></div>}
          </section>

          <section className="mt-5 rounded-2xl border-2 border-slate-800 bg-slate-950 p-4 text-slate-100"><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">Regra de evidência</p><p className="mt-1 text-sm leading-6 text-slate-300">“Não importado” não significa R$ 0,00. O SOS Sales só calcula ROAS quando o gasto da campanha foi importado e associado à mesma coorte. Nenhuma estimativa é criada no navegador.</p></section>
        </>}
      </div>
    </main>
  );
};

function MetricCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone: 'blue' | 'emerald' | 'violet' }) {
  const color = { blue: 'border-blue-200 bg-blue-50 text-blue-700', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700', violet: 'border-violet-200 bg-violet-50 text-violet-700' }[tone];
  return <section className={`rounded-2xl border-2 p-4 shadow-sm ${color}`}><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.1em]">{label}</p><span>{icon}</span></div><p className="mt-3 break-words font-mono text-xl font-bold text-slate-950">{value}</p><p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p></section>;
}

function CampaignRow({ campaign }: { campaign: ApiTrafficProofCampaign; key?: string }) {
  return <tr className="hover:bg-slate-50"><td className="px-4 py-3.5"><p className="font-semibold text-slate-950">{campaignTitle(campaign)}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{campaign.source}{campaign.campaignId ? ` · ${campaign.campaignId}` : ''}</p></td><td className="px-4 py-3.5 text-right font-mono">{formatInteger(campaign.acquiredLeads)}</td><td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">{formatInteger(campaign.wonOutcomes)}</td><td className="px-4 py-3.5 text-right font-mono text-rose-700">{formatInteger(campaign.lostOutcomes)}</td><td className="px-4 py-3.5 text-right font-mono font-bold">{formatCurrency(campaign.revenueMinor, campaign.currency)}</td><td className="px-4 py-3.5 text-right font-mono">{campaign.spendMinor === null ? <span className="font-sans text-slate-500">Não importado</span> : formatCurrency(campaign.spendMinor, campaign.currency)}</td><td className="px-4 py-3.5 text-right">{campaign.roas === null ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">Não calculável</span> : <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-mono font-bold text-violet-800">{campaign.roas.toFixed(2)}x</span>}</td></tr>;
}
