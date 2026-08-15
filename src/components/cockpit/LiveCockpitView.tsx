import React from 'react';
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  CircleDot,
  DatabaseZap,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import {
  ApiCockpitView,
  ApiJourney,
  ApiPriority,
  HttpSalesOsGateway,
  SalesOsTransportError,
} from '../../services/salesOsGateway';

interface LiveCockpitViewProps {
  workspaceId: string;
  selectedJourneyId?: string;
  onSelectedJourneyChange: (journeyId: string | undefined) => void;
  gateway: HttpSalesOsGateway;
}

type LoadState<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'empty' }
  | { state: 'error'; message: string };

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function formatMoney(minor: number | null | undefined, currency = 'BRL'): string {
  if (minor === null || minor === undefined) return 'Não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100);
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return 'Não informado';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Valor estruturado indisponível para visualização';
  }
}

function stageLabel(value: string | null): string {
  if (!value) return 'Estágio ainda não registrado';
  return value.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
}

function availability(label: string, detail: string) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function QueueCard({
  item,
  selected,
  onClick,
}: {
  item: ApiPriority | ApiJourney;
  selected: boolean;
  onClick: () => void;
}) {
  const hasPriority = 'priorityReason' in item;
  const title = item.contactName || item.contactPhone || 'Contato sem nome';
  const secondary = hasPriority
    ? item.lastMessageText || item.priorityReason
    : item.primaryServiceOrProduct || 'Sem produto ou serviço registrado';
  const time = hasPriority ? item.lastMessageAt : item.updatedAt;
  const urgent = hasPriority && item.slaState === 'OVERDUE';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border-2 p-3 text-left transition focus-visible:outline-offset-2 ${selected
        ? 'border-blue-600 bg-blue-50 shadow-sm'
        : urgent
          ? 'border-rose-200 bg-rose-50 hover:border-rose-400'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{item.contactPhone || 'Telefone não registrado'}</p>
        </div>
        {hasPriority && (
          <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${urgent ? 'bg-rose-100 text-rose-700' : item.slaState === 'DUE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
            {item.slaState === 'OVERDUE' ? 'SLA vencido' : item.slaState === 'DUE' ? 'SLA próximo' : 'No prazo'}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-700">{secondary}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
        <span className="truncate">{hasPriority ? item.priorityReason : stageLabel(item.pipelineStage)}</span>
        <span className="shrink-0 font-mono">{formatDate(time)}</span>
      </div>
    </button>
  );
}

/**
 * Authenticated cockpit surface. It is deliberately a separate UI from the
 * demo cockpit: it renders only API read-model fields and marks missing
 * commercial context as unavailable. This protects operators from confusing
 * fixture data with live accounts.
 */
export const LiveCockpitView: React.FC<LiveCockpitViewProps> = ({
  workspaceId,
  selectedJourneyId,
  onSelectedJourneyChange,
  gateway,
}) => {
  const [priorities, setPriorities] = React.useState<LoadState<ApiPriority[]>>({ state: 'loading' });
  const [journeys, setJourneys] = React.useState<LoadState<ApiJourney[]>>({ state: 'loading' });
  const [cockpit, setCockpit] = React.useState<LoadState<ApiCockpitView>>({ state: 'loading' });
  const [refreshing, setRefreshing] = React.useState(false);
  const selectedJourneyRef = React.useRef(selectedJourneyId);

  React.useEffect(() => {
    selectedJourneyRef.current = selectedJourneyId;
  }, [selectedJourneyId]);

  const loadQueue = React.useCallback(async () => {
    setPriorities({ state: 'loading' });
    setJourneys({ state: 'loading' });
    try {
      const [priorityData, journeyPage] = await Promise.all([
        gateway.listPriorities(workspaceId, 5),
        gateway.listJourneys(workspaceId, { limit: 20 }),
      ]);
      setPriorities(priorityData.length ? { state: 'ready', value: priorityData } : { state: 'empty' });
      setJourneys(journeyPage.data.length ? { state: 'ready', value: journeyPage.data } : { state: 'empty' });
      const firstId = priorityData[0]?.journeyId || journeyPage.data[0]?.id;
      if (!selectedJourneyRef.current && firstId) onSelectedJourneyChange(firstId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível carregar a fila autenticada.';
      setPriorities({ state: 'error', message });
      setJourneys({ state: 'error', message });
    }
  }, [gateway, onSelectedJourneyChange, workspaceId]);

  React.useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  React.useEffect(() => {
    if (!selectedJourneyId) {
      setCockpit({ state: 'empty' });
      return;
    }
    let active = true;
    setCockpit({ state: 'loading' });
    gateway.getCockpit(workspaceId, selectedJourneyId).then((data) => {
      if (active) setCockpit({ state: 'ready', value: data });
    }).catch((error) => {
      if (!active) return;
      const message = error instanceof SalesOsTransportError
        ? error.message
        : 'Não foi possível carregar o contexto autenticado desta jornada.';
      setCockpit({ state: 'error', message });
    });
    return () => { active = false; };
  }, [gateway, selectedJourneyId, workspaceId]);

  const refresh = async () => {
    setRefreshing(true);
    await loadQueue();
    if (selectedJourneyId) {
      setCockpit({ state: 'loading' });
      try {
        setCockpit({ state: 'ready', value: await gateway.getCockpit(workspaceId, selectedJourneyId) });
      } catch (error) {
        setCockpit({ state: 'error', message: error instanceof Error ? error.message : 'Não foi possível atualizar a jornada.' });
      }
    }
    setRefreshing(false);
  };

  const queue = priorities.state === 'ready' ? priorities.value : journeys.state === 'ready' ? journeys.value : [];
  const view = cockpit.state === 'ready' ? cockpit.value : null;

  return (
    <main className="mx-auto max-w-[1720px] px-4 py-5 lg:px-6">
      <section className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border-2 border-blue-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><DatabaseZap size={15} /> Operação autenticada</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Cockpit ao vivo</h1>
          <p className="mt-1 text-sm text-slate-600">Fila, conversa e contexto vindos do Supabase. Campos sem evidência permanecem explícitos.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-600 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Atualizar dados
        </button>
      </section>

      <div className="grid min-h-[660px] gap-4 xl:grid-cols-[310px_minmax(0,1fr)_330px]">
        <aside className="cockpit-panel flex min-h-0 flex-col border-2 border-blue-200">
          <div className="cockpit-panel-header flex items-center justify-between px-4 py-3">
            <div><p className="text-sm font-bold text-slate-900">Fila priorizada</p><p className="text-xs text-slate-500">até 5 itens com contexto real</p></div>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{queue.length}</span>
          </div>
          <div className="space-y-2 overflow-y-auto p-3">
            {priorities.state === 'loading' || journeys.state === 'loading' ? <p className="px-2 py-5 text-sm text-slate-500">Carregando fila…</p> : null}
            {priorities.state === 'error' ? availability('Fila indisponível', priorities.message) : null}
            {priorities.state === 'empty' && journeys.state === 'empty' ? availability('Zero jornadas', 'Nenhuma jornada autorizada foi encontrada neste workspace.') : null}
            {queue.map((item) => (
              <div key={'journeyId' in item ? item.journeyId : item.id}>
                <QueueCard item={item} selected={('journeyId' in item ? item.journeyId : item.id) === selectedJourneyId} onClick={() => onSelectedJourneyChange('journeyId' in item ? item.journeyId : item.id)} />
              </div>
            ))}
          </div>
        </aside>

        <section className="cockpit-panel min-w-0 border-2 border-slate-200">
          {cockpit.state === 'loading' && <div className="flex h-full min-h-[560px] items-center justify-center text-sm text-slate-500">Carregando jornada autenticada…</div>}
          {cockpit.state === 'error' && <div className="m-4">{availability('Contexto indisponível', cockpit.message)}</div>}
          {cockpit.state === 'empty' && <div className="m-4">{availability('Selecione uma jornada', 'Escolha um item da fila para abrir seu contexto comercial.')}</div>}
          {view && <LiveJourneyBody view={view} />}
        </section>

        <aside className="cockpit-panel min-w-0 border-2 border-violet-200">
          <div className="cockpit-panel-header px-4 py-3"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Sparkles size={16} className="text-violet-600" /> Dossiê vivo</p><p className="mt-0.5 text-xs text-slate-500">fatos e decisões com proveniência</p></div>
          <div className="space-y-3 p-3">
            {!view && availability('Sem dossiê selecionado', 'O dossiê aparece apenas para uma jornada acessível.')}
            {view && <LiveDossier view={view} />}
          </div>
        </aside>
      </div>
    </main>
  );
};

function LiveJourneyBody({ view }: { view: ApiCockpitView }) {
  const { journey, acquisitionContexts, messages, decisionState, recommendation, handoff, outcome } = view;
  const acquisition = acquisitionContexts[0] ?? null;
  return <>
    <header className="border-b border-slate-200 bg-slate-50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="flex items-center gap-2 text-lg font-bold text-slate-950"><UserRound size={19} className="text-blue-600" />{journey.contact.name || 'Contato sem nome'}</p><p className="mt-1 font-mono text-sm text-slate-600">{journey.contact.phone}</p></div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{stageLabel(journey.pipelineStage)}</span>
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">{journey.status}</span>
          {journey.channel ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{journey.channel.name}</span> : <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-600">Canal não vinculado</span>}
        </div>
      </div>
    </header>

    <div className="space-y-4 p-4">
      <section className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-4 text-white shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-300"><CircleDot size={15} /> Linha de continuidade comercial</div>
        <div className="grid gap-3 md:grid-cols-3">
          <ContinuityCell icon={<Target size={16} />} label="Origem" tone="blue" value={acquisition?.campaignName || acquisition?.source || null} detail={acquisition?.offerHook || acquisition?.entryMessage || 'Origem ainda não registrada'} />
          <ContinuityCell icon={<MessageSquare size={16} />} label="Estado atual" tone="amber" value={decisionState?.currentStage || null} detail={decisionState?.primaryFriction || 'Sem fricção classificada'} />
          <ContinuityCell icon={<ChevronRight size={16} />} label="Próximo passo" tone="violet" value={recommendation?.suggestedAction || null} detail={recommendation?.microCommitmentGoal || 'Nenhuma recomendação autorizada'} />
        </div>
      </section>

      <section className="rounded-2xl border-2 border-slate-200 bg-[#efeae2] p-4">
        <div className="mb-3 flex items-center justify-between"><p className="font-bold text-slate-900">Conversa recente</p><span className="text-xs text-slate-500">até 50 mensagens normalizadas</span></div>
        {messages.length === 0 ? availability('Nenhuma mensagem disponível', 'Ainda não há mensagens normalizadas acessíveis para esta jornada.') : <div className="space-y-3">{messages.map((message) => <div key={message.id} className={`max-w-[86%] rounded-xl border px-3 py-2 shadow-sm ${message.direction === 'outbound' ? 'ml-auto border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><p className="text-sm leading-5 text-slate-800">{message.textContent || 'Mensagem sem conteúdo de texto'}</p><p className="mt-1 text-right text-[11px] text-slate-500">{message.senderType} · {formatDate(message.sentAt)}</p></div>)}</div>}
      </section>

      <section className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 font-bold text-violet-950"><Bot size={17} /> Sugestão supervisionada</p>{recommendation && <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-violet-700">{Math.round(recommendation.confidence * 100)}% confiança</span>}</div>
        {recommendation ? <><p className="mt-3 text-sm font-semibold text-slate-900">{recommendation.suggestedAction}</p>{recommendation.suggestedDraftText && <p className="mt-2 rounded-lg border border-violet-200 bg-white p-3 font-mono text-sm leading-6 text-slate-700">{recommendation.suggestedDraftText}</p>}<p className="mt-2 text-xs text-slate-600">Política: {recommendation.policyStatus}{recommendation.policyReason ? ` · ${recommendation.policyReason}` : ''}</p></> : availability('Nenhuma sugestão aprovada', 'O sistema não inventa uma resposta quando não existe recomendação registrada.')}
      </section>
    </div>
  </>;
}

function ContinuityCell({ icon, label, tone, value, detail }: { icon: React.ReactNode; label: string; tone: 'blue' | 'amber' | 'violet'; value: string | null; detail: string }) {
  const colors = { blue: 'border-blue-700/60 bg-blue-950/40 text-blue-200', amber: 'border-amber-500/60 bg-amber-950/30 text-amber-200', violet: 'border-violet-500/60 bg-violet-950/40 text-violet-200' };
  return <div className={`rounded-xl border p-3 ${colors[tone]}`}><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">{icon}{label}</p><p className="mt-2 text-sm font-semibold text-white">{value || 'Ainda indisponível'}</p><p className="mt-1 text-xs leading-5 text-slate-300">{detail}</p></div>;
}

function LiveDossier({ view }: { view: ApiCockpitView }) {
  const { journey, knownFacts, decisionState, handoff, outcome } = view;
  return <>
    <section className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Jornada</p><p className="mt-1 text-sm font-bold text-slate-900">{journey.primaryServiceOrProduct || 'Produto/serviço não registrado'}</p><dl className="mt-2 space-y-1 text-xs text-slate-600"><div className="flex justify-between gap-2"><dt>Iniciada</dt><dd>{formatDate(journey.startedAt)}</dd></div><div className="flex justify-between gap-2"><dt>Receita registrada</dt><dd className="font-mono">{formatMoney(journey.totalRevenueMinor, journey.currency)}</dd></div></dl></section>
    <section className="rounded-xl border-2 border-violet-200 bg-white"><div className="border-b border-violet-100 px-3 py-2"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Sparkles size={15} className="text-violet-600" /> Fatos conhecidos ({knownFacts.length})</p></div><div className="max-h-[300px] space-y-2 overflow-y-auto p-3">{knownFacts.length === 0 ? availability('Sem fatos extraídos', 'Nenhum fato com proveniência foi registrado para esta jornada.') : knownFacts.map((fact) => <div key={fact.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><p className="text-xs font-bold text-violet-700">{fact.key}</p><p className="mt-1 break-words text-sm text-slate-800">{valueToText(fact.value)}</p><p className="mt-1 text-[11px] text-slate-500">{fact.source} · confiança {Math.round(fact.confidence * 100)}%{fact.confirmedByCustomer ? ' · confirmado pelo cliente' : ''}</p></div>)}</div></section>
    <section className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><AlertTriangle size={15} className="text-amber-700" /> Fricção atual</p>{decisionState ? <><p className="mt-2 text-sm font-semibold text-slate-800">{decisionState.primaryFriction || 'Nenhuma fricção primária'}</p><p className="mt-1 text-xs leading-5 text-slate-600">{decisionState.frictionEvidence || 'Evidência não registrada'}</p></> : <p className="mt-2 text-sm text-slate-600">Ainda não há um estado decisório registrado.</p>}</section>
    <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3"><p className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={15} className="text-emerald-700" /> Handoff e resultado</p><p className="mt-2 text-sm text-slate-700">{handoff ? `Handoff ${handoff.status.toLocaleLowerCase('pt-BR')} · ${handoff.triggerReason}` : 'Sem handoff aberto.'}</p>{outcome ? <p className="mt-2 border-t border-emerald-200 pt-2 text-sm font-semibold text-emerald-900">{outcome.result} · {formatMoney(outcome.finalRevenueMinor, outcome.currency)}</p> : <p className="mt-2 text-xs text-slate-600">Resultado final ainda não registrado.</p>}</section>
  </>;
}
