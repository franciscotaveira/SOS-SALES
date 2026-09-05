import React from 'react';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { Journey, Channel, OperatorRole, KnownFact, EvidenceReference } from '../../types/cockpit';
import { KnownFactItem } from './KnownFactItem';
import { ChannelStatus } from './ChannelStatus';
import { HandoffControls } from './HandoffControls';
import { EvidenceModal } from './EvidenceModal';
import { MemoryNotesPanel } from './MemoryNotesPanel';
import {
  Globe,
  Tag,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Handshake,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Award,
  Layers,
  Sparkles,
  Brain,
  Minimize2,
  Maximize2,
  X,
  PanelRightClose,
  Columns3,
  FileText,
  Copy,
  Check,
  Flame,
  CreditCard,
  CalendarCheck,
  Snowflake,
  Star,
  Timer,
  Zap,
  BotIcon,
  UserRound,
  Loader2,
} from 'lucide-react';

interface LiveDossierProps {
  journey: Journey;
  channel?: Channel;
  role: OperatorRole;
  currentOperatorId: string;
  currentOperatorName: string;
  onClaimHandoff: () => void;
  onReleaseHandoff: () => void;
  onToggleChannelPause: (channelId: string) => void;
  onOpenOutcomeModal: () => void;
  onUpdateJourney?: (updated: Journey) => void;
  onClose?: () => void;
  displayMode?: 'docked' | 'drawer';
  onToggleMode?: () => void;
}

export const LiveDossier: React.FC<LiveDossierProps> = ({
  journey,
  channel,
  role,
  currentOperatorId,
  currentOperatorName,
  onClaimHandoff,
  onReleaseHandoff,
  onToggleChannelPause,
  onOpenOutcomeModal,
  onUpdateJourney,
  onClose,
  displayMode = 'docked',
  onToggleMode,
}) => {
  const { acquisition, knownFacts, outcome, dossier } = journey;
  const isCTWA = acquisition.source === 'ctwa';

  // Expansion state for the 5 fixed blocks
  const [expandedBlocks, setExpandedBlocks] = React.useState<Record<string, boolean>>({
    objective: true,
    confirmed: true,
    friction: true,
    commitment: false,
    ownership: true,
  });

  // Limits for "Ver mais"
  const [showAllConfirmed, setShowAllConfirmed] = React.useState(false);

  // Evidence modal state
  const [evidenceModalData, setEvidenceModalData] = React.useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    confidence?: any;
    evidences: EvidenceReference[];
    blockedReason?: string;
  }>({
    isOpen: false,
    title: '',
    evidences: [],
  });

  // Sales AI Handoff & Semantic Tags State
  const [showHandoffBox, setShowHandoffBox] = React.useState(false);
  const [copiedSummary, setCopiedSummary] = React.useState(false);
  const [activeTags, setActiveTags] = React.useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Bot 24/7 — freio duplo: enabled (explícito) + paused (humano assumiu)
  const [botEnabled, setBotEnabled] = React.useState(false);
  const [botPaused, setBotPaused]   = React.useState(false);
  const [botActive, setBotActive] = React.useState(false);
  const [responderOwner, setResponderOwner] = React.useState<'sos_sales' | 'meta_business_agent' | 'human'>('sos_sales');
  const [responderMode, setResponderMode] = React.useState<'sos_sales' | 'meta_business_agent' | 'auto_fallback' | 'manual'>('sos_sales');
  const [metaAgentReady, setMetaAgentReady] = React.useState(false);
  const [metaAgentEnabled, setMetaAgentEnabled] = React.useState(false);
  const [metaAgentEligibilityStatus, setMetaAgentEligibilityStatus] = React.useState<'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN'>('UNKNOWN');
  const [metaAgentActivationStatus, setMetaAgentActivationStatus] = React.useState<'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED'>('NOT_STARTED');
  const [botToggling, setBotToggling] = React.useState(false);
  const [botError, setBotError] = React.useState<string | null>(null);

  const loadBotStatus = React.useCallback(async () => {
    setBotError(null);
    const wsId = journey.workspaceId;
    if (!wsId) {
      setBotEnabled(false);
      setBotPaused(false);
      setBotActive(false);
      setResponderOwner('human');
      setResponderMode('manual');
      setMetaAgentEnabled(false);
      setMetaAgentEligibilityStatus('UNKNOWN');
      setMetaAgentActivationStatus('NOT_STARTED');
      setMetaAgentReady(false);
      setBotError('Workspace da jornada não informado');
      return;
    }
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${wsId}/journeys/${journey.id}/bot/status`);
      if (!response.ok) throw new Error(`Falha ao carregar estado do bot: HTTP ${response.status}`);
      const data = await response.json() as {
        botEnabled?: boolean;
        botPaused?: boolean;
        botActive?: boolean;
        responderOwner?: 'sos_sales' | 'meta_business_agent' | 'human';
        responderMode?: 'sos_sales' | 'meta_business_agent' | 'auto_fallback' | 'manual';
        metaAgentEnabled?: boolean;
        metaAgentId?: string | null;
        metaAgentEligibilityStatus?: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
        metaAgentActivationStatus?: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';
      };
      if (typeof data.botEnabled === 'boolean') setBotEnabled(data.botEnabled);
      if (typeof data.botPaused  === 'boolean') setBotPaused(data.botPaused);
      if (typeof data.botActive === 'boolean') setBotActive(data.botActive);
      if (data.responderOwner) setResponderOwner(data.responderOwner);
      if (data.responderMode) setResponderMode(data.responderMode);
      const nextMetaEnabled = data.metaAgentEnabled === true;
      const nextMetaStatus = data.metaAgentEligibilityStatus === 'ELIGIBLE' || data.metaAgentEligibilityStatus === 'INELIGIBLE'
        ? data.metaAgentEligibilityStatus
        : 'UNKNOWN';
      setMetaAgentEnabled(nextMetaEnabled);
      setMetaAgentEligibilityStatus(nextMetaStatus);
      const nextActivationStatus = data.metaAgentActivationStatus === 'PENDING' || data.metaAgentActivationStatus === 'READY' || data.metaAgentActivationStatus === 'FAILED'
        ? data.metaAgentActivationStatus
        : 'NOT_STARTED';
      setMetaAgentActivationStatus(nextActivationStatus);
      setMetaAgentReady(nextMetaEnabled && Boolean(data.metaAgentId) && nextMetaStatus === 'ELIGIBLE' && nextActivationStatus === 'READY');
    } catch {
      setBotEnabled(false);
      setBotPaused(false);
      setBotActive(false);
      setResponderOwner('human');
      setResponderMode('manual');
      setMetaAgentEnabled(false);
      setMetaAgentEligibilityStatus('UNKNOWN');
      setMetaAgentActivationStatus('NOT_STARTED');
      setMetaAgentReady(false);
      setBotError('Estado do bot indisponível');
    }
  }, [journey.id, journey.workspaceId]);

  const metaActivationUnknown = responderMode === 'auto_fallback'
    && metaAgentEnabled
    && (metaAgentEligibilityStatus === 'UNKNOWN' || metaAgentActivationStatus === 'PENDING' || metaAgentActivationStatus === 'FAILED')
    && !botActive;

  // Carrega estado real do servidor ao abrir o dossiê.
  React.useEffect(() => {
    void loadBotStatus();
  }, [loadBotStatus]);

  // O botão usa thread-control quando a Meta é a proprietária. Para o runtime
  // próprio, mantém os endpoints de enable/pause/resume já persistidos.
  const handleToggleBot = React.useCallback(async () => {
    setBotToggling(true);
    setBotError(null);
    const wsId = journey.workspaceId;
    if (!wsId) {
      setBotError('Workspace da jornada não informado');
      setBotToggling(false);
      return;
    }
    try {
      if (responderMode === 'manual') return;
      if (responderOwner === 'meta_business_agent') {
        const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/meta-business-agent/thread-control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'take',
            to: journey.leadPhone,
            journeyId: journey.id,
            metadata: 'SOS Vendas assumiu via Dossiê',
          }),
        });
        const data = await res.json().catch(() => null) as { responderOwner?: 'sos_sales' | 'meta_business_agent' | 'human'; error?: string; botActive?: boolean } | null;
        if (!res.ok) throw new Error(data?.error || `Falha ao assumir a conversa: HTTP ${res.status}`);
        setResponderOwner(data?.responderOwner || 'sos_sales');
        if (typeof data?.botActive === 'boolean') setBotActive(data.botActive);
        await loadBotStatus();
        return;
      }

      if (responderOwner === 'human') return;
      let action: string;
      if (!botEnabled) {
        action = 'enable';   // 🔴 → 🟢
      } else if (!botPaused) {
        action = 'pause';    // 🟢 → 🟡
      } else {
        action = 'resume';   // 🟡 → 🟢
      }
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/journeys/${journey.id}/bot/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: action === 'pause' ? 'Humano assumiu via Cockpit' : undefined }),
      });
      if (!res.ok) throw new Error(`Falha ao alterar estado do bot: HTTP ${res.status}`);
      const data = await res.json() as { botEnabled?: boolean; botPaused?: boolean; botActive?: boolean; responderOwner?: 'sos_sales' | 'meta_business_agent' | 'human' };
      if (typeof data.botEnabled === 'boolean') setBotEnabled(data.botEnabled);
      if (typeof data.botPaused  === 'boolean') setBotPaused(data.botPaused);
      if (typeof data.botActive === 'boolean') setBotActive(data.botActive);
      if (data.responderOwner) setResponderOwner(data.responderOwner);
    } catch {
      setBotError('Não foi possível alterar o bot. Tente novamente.');
    } finally {
      setBotToggling(false);
    }
  }, [botEnabled, botPaused, journey.id, journey.leadPhone, journey.workspaceId, loadBotStatus, responderMode, responderOwner]);

  const handleReleaseToMeta = React.useCallback(async () => {
    setBotToggling(true);
    setBotError(null);
    const wsId = journey.workspaceId;
    if (!wsId) {
      setBotError('Workspace da jornada não informado');
      setBotToggling(false);
      return;
    }
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/meta-business-agent/thread-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'release',
          to: journey.leadPhone,
          journeyId: journey.id,
          metadata: 'Conversa devolvida à Meta via Dossiê',
        }),
      });
      const data = await res.json().catch(() => null) as { responderOwner?: 'sos_sales' | 'meta_business_agent' | 'human'; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || `Falha ao devolver a conversa: HTTP ${res.status}`);
      setResponderOwner(data?.responderOwner || 'meta_business_agent');
      setBotActive(false);
      await loadBotStatus();
    } catch {
      setBotError('Não foi possível devolver a conversa à Meta. Tente novamente.');
    } finally {
      setBotToggling(false);
    }
  }, [journey.id, journey.leadPhone, journey.workspaceId, loadBotStatus]);

  const toggleBlock = (blockKey: string) => {
    setExpandedBlocks((prev) => ({ ...prev, [blockKey]: !prev[blockKey] }));
  };

  const handleOpenFactEvidence = (fact: KnownFact) => {
    setEvidenceModalData({
      isOpen: true,
      title: fact.label,
      subtitle: fact.value,
      confidence: fact.confidence,
      evidences: fact.evidence || [],
    });
  };

  // A sparse dossier is a legitimate production state. Do not manufacture a
  // confirmed fact or system evidence just to fill a card.
  const objectiveFacts = dossier?.customerObjective || [];

  const confirmedFactsList = dossier?.confirmedFacts || knownFacts.filter((f) => f.confidence === 'CONFIRMED');
  const activeFrictionList = dossier?.activeFriction || knownFacts.filter((f) => f.confidence === 'TO_CONFIRM' || f.confidence === 'PROBABLE');
  const lastCommitmentList = dossier?.lastCommitment || [];
  const ownershipList = dossier?.ownershipAndDeadline || [];

  const handoffExecutiveSummary = [
    `🎯 Objetivo: ${journey.urgencyReason?.trim() || 'Não registrado'}`,
    `📊 Status: ${journey.handoffStatus || 'Não registrado'}`,
    `⚡ Próximo passo: ${lastCommitmentList[0]?.value || 'Não definido'}`,
  ].join('\n');

  const handleCopyHandoff = () => {
    navigator.clipboard.writeText(handoffExecutiveSummary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const displayedConfirmed = showAllConfirmed ? confirmedFactsList : confirmedFactsList.slice(0, 5);

  return (
    <div id="live-dossier-panel" className="cockpit-panel flex flex-col h-full max-h-full min-h-0 overflow-hidden">
      {/* Panel Header - compact */}
      <div className="cockpit-panel-header px-3 py-2 shrink-0 flex items-center justify-between border-b border-[var(--sos-border)] bg-[var(--sos-canvas)]">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--sos-ai)]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
              Dossiê Vivo de Decisão
            </h2>
          </div>
          <p className="text-[10px] text-[var(--sos-muted)]">5 blocos de continuidade comercial</p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30">
            Sales OS Live
          </span>

          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="p-1 rounded-md text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-canvas)] transition-colors"
              title={displayMode === 'docked' ? 'Destacar como Gaveta Flutuante' : 'Fixar no Painel Grid'}
              aria-label={displayMode === 'docked' ? 'Destacar como Gaveta Flutuante' : 'Fixar no Painel Grid'}
            >
              {displayMode === 'docked' ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Columns3 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-canvas)] transition-colors"
              title="Fechar / Recolher Dossiê"
              aria-label="Fechar Dossiê"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Responder automático — o estado vem do backend, não de um cálculo local. */}
      <div className={`shrink-0 px-3 py-2 flex items-center justify-between border-b ${
        botActive   ? 'bg-emerald-50/60 border-emerald-200/60'
        : responderMode === 'manual' || metaActivationUnknown ? 'bg-amber-50/60 border-amber-200/60'
        : responderOwner === 'meta_business_agent' ? 'bg-violet-50/60 border-violet-200/60'
        : botEnabled ? 'bg-amber-50/60 border-amber-200/60'
        : 'bg-slate-50/60 border-slate-200/60'
      }`}>
        <div className="flex items-center gap-2">
          {botActive ? (
            <BotIcon className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          ) : responderMode === 'manual' ? (
            <UserRound className="w-3.5 h-3.5 text-amber-600" />
          ) : metaActivationUnknown ? (
            <BotIcon className="w-3.5 h-3.5 text-amber-600" />
          ) : responderOwner === 'meta_business_agent' ? (
            <BotIcon className="w-3.5 h-3.5 text-violet-600" />
          ) : botEnabled ? (
            <UserRound className="w-3.5 h-3.5 text-amber-600" />
          ) : (
            <BotIcon className="w-3.5 h-3.5 text-slate-400" />
          )}
          <div>
            <span className={`text-[11px] font-bold ${
              botActive ? 'text-emerald-800' : responderMode === 'manual' || metaActivationUnknown ? 'text-amber-800' : responderOwner === 'meta_business_agent' ? 'text-violet-800' : responderOwner === 'human' || botEnabled ? 'text-amber-800' : 'text-slate-500'
            }`}>
              {botActive ? '🟢 IA própria ativa (NVIDIA NIM)'
                : responderMode === 'manual' || responderOwner === 'human' ? '🟡 Atendimento manual'
                : metaActivationUnknown ? '🟡 Meta aguardando confirmação'
                : responderOwner === 'meta_business_agent' ? '🟣 Meta Business Agent responde'
                : botEnabled ? '🟡 Humano no Controle'
                : '🔴 Bot Desabilitado'}
            </span>
            <span className={`block text-[10px] ${
              botActive ? 'text-emerald-600' : responderMode === 'manual' || metaActivationUnknown ? 'text-amber-600' : responderOwner === 'meta_business_agent' ? 'text-violet-600' : responderOwner === 'human' || botEnabled ? 'text-amber-600' : 'text-slate-400'
            }`}>
              {botActive ? 'Respondendo automaticamente 24/7'
                : responderMode === 'manual' || responderOwner === 'human' ? 'Nenhum agente automático enviará mensagens'
                : metaActivationUnknown ? 'Nenhuma IA responde até a elegibilidade ser confirmada'
                : responderOwner === 'meta_business_agent' ? 'Resposta oficial da Meta; assuma somente se necessário'
                : botEnabled ? 'Você assumiu — clique para retomar'
                : 'Clique para habilitar o bot nesta conversa'}
            </span>
            {botError && (
              <span className="block text-[10px] font-semibold text-rose-700" role="alert">
                {botError}
              </span>
            )}
          </div>
        </div>
        <button
          id={`bot-toggle-btn-${journey.id}`}
          onClick={handleToggleBot}
          disabled={botToggling || responderOwner === 'human' || responderMode === 'manual'}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 border ${
            responderMode === 'manual' || metaActivationUnknown
              ? 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
              : botActive
              ? 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
              : responderOwner === 'meta_business_agent'
              ? 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
              : botEnabled
              ? 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
          title={
            responderMode === 'manual' || responderOwner === 'human' ? 'Atendimento manual ativo'
            : metaActivationUnknown ? 'Meta ainda não foi confirmada; atualize a elegibilidade antes de responder'
            : responderOwner === 'meta_business_agent' ? 'Assumir esta conversa no SOS Vendas'
            : botActive ? 'Pausar bot e assumir atendimento'
            : botEnabled ? 'Retomar atendimento automático'
            : 'Habilitar bot nesta conversa'
          }
        >
          {botToggling ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : responderMode === 'manual' ? (
            <UserRound className="w-3 h-3" />
          ) : responderOwner === 'meta_business_agent' ? (
            <UserRound className="w-3 h-3" />
          ) : botActive ? (
            <UserRound className="w-3 h-3" />
          ) : (
            <BotIcon className="w-3 h-3" />
          )}
          {responderMode === 'manual' || responderOwner === 'human' ? 'Modo manual' : metaActivationUnknown ? 'Aguardando Meta' : responderOwner === 'meta_business_agent' ? 'Assumir no SOS' : botActive ? 'Assumir' : botEnabled ? 'Retomar Bot' : 'Habilitar Bot'}
        </button>
        {responderOwner === 'sos_sales'
          && responderMode !== 'sos_sales'
          && metaAgentReady
          && (
            <button
              type="button"
              onClick={() => void handleReleaseToMeta()}
              disabled={botToggling}
              className="px-2 py-1 rounded-lg text-[10px] font-bold text-violet-700 border border-violet-200 bg-white hover:bg-violet-50 disabled:opacity-50"
              title="Devolver o controle para o Meta Business Agent"
            >
              Devolver à Meta
            </button>
          )}
      </div>

      {/* Scrollable Dossier Content - compact spacing */}
      <div className="p-2.5 overflow-y-auto flex-1 min-h-0 space-y-2.5">
        {/* Outcome Banner (if closed) - tokens semânticos */}
        {outcome && (
          <div
            id="dossier-outcome-banner"
            className={`p-2.5 rounded-lg border text-xs ${
              outcome.status === 'won'
                ? 'bg-[var(--sos-action-subtle)] border-[var(--sos-action)]/30 text-[var(--sos-action)]'
                : 'bg-[var(--sos-danger-subtle)] border-[var(--sos-danger)]/30 text-[var(--sos-danger)]'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[var(--sos-action)]" />
                Resultado: {outcome.status === 'won' ? 'Venda Concluída' : 'Perdido'}
              </span>
              {outcome.dealValueBrl && (
                <span className="font-mono text-[var(--sos-action)] bg-[var(--sos-action-subtle)] px-2 py-0.5 rounded font-bold">
                  R$ {(Number(outcome.dealValueBrl) || 0).toFixed(2)}
                </span>
              )}
            </div>
            {outcome.serviceOrProduct && (
              <div className="text-[10.5px] font-medium text-[var(--sos-muted)]">
                Item: {outcome.serviceOrProduct}
              </div>
            )}
            {outcome.reason && (
              <div className="text-[10.5px] text-[var(--sos-muted)] italic mt-0.5">
                "{outcome.reason}"
              </div>
            )}
          </div>
        )}

        {/* Origem e Atribuição Meta CTWA - tokens semânticos */}
        <div className="p-2.5 bg-[var(--sos-canvas)] border border-[var(--sos-border)] rounded-lg text-[11px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10.5px] text-[var(--sos-muted)]">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              Origem da Conversa
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isCTWA ? 'bg-blue-100 text-blue-800' : 'bg-[var(--sos-border)] text-[var(--sos-muted)]'
              }`}
            >
              {isCTWA ? 'Meta Ads CTWA' : 'Orgânico / Direto'}
            </span>
          </div>

          <div>
            <span className="text-[9px] font-bold uppercase text-[var(--sos-muted)] block">Campanha</span>
            <div className="font-semibold text-[var(--sos-ink)] leading-snug">
              {acquisition.campaignName || 'Origem ainda não confirmada'}
            </div>
          </div>

          {acquisition.referralOffer && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-[9px] font-bold uppercase text-blue-700 flex items-center gap-1 mb-0.5">
                <Tag className="w-3 h-3" />
                Oferta Prometida no Anúncio:
              </span>
              <div className="font-bold text-blue-900 text-[11px]">
                {acquisition.referralOffer}
              </div>
            </div>
          )}
        </div>

        {/* Sales AI Handoff & Executive Summary (3-Lines) */}
        <div className="p-2.5 bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-200/80 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10.5px] text-indigo-900 font-heading">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Resumo Executivo (Handoff)
            </span>
            <button
              onClick={() => setShowHandoffBox(!showHandoffBox)}
              className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-white/80 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs transition-colors"
            >
              {showHandoffBox ? 'Recolher' : 'Exibir 3 Linhas'}
            </button>
          </div>

          {showHandoffBox && (
            <div className="bg-white/95 border border-indigo-100 rounded-md p-2 space-y-1.5 shadow-2xs">
              <div className="text-[10.5px] text-[var(--sos-ink)] font-mono whitespace-pre-line leading-relaxed">
                {handoffExecutiveSummary}
              </div>
              <div className="flex items-center justify-end pt-1 border-t border-indigo-50">
                <button
                  onClick={handleCopyHandoff}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                >
                  {copiedSummary ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedSummary ? 'Copiado!' : 'Copiar Resumo'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Semantic Tags */}
          <div className="pt-1">
            <span className="text-[9px] font-bold uppercase text-indigo-800 block mb-1">
              Etiquetas Semânticas:
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { tag: '🔥 Lead Quente', color: 'bg-red-50 text-red-700 border-red-200' },
                { tag: '💳 Aguardando Pix', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                { tag: '📅 Agendado', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                { tag: '❄️ Frio', color: 'bg-slate-100 text-slate-700 border-slate-300' },
                { tag: '⭐ VIP', color: 'bg-amber-50 text-amber-800 border-amber-200' },
              ].map(({ tag, color }) => {
                const isSelected = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                      isSelected
                        ? `${color} ring-1 ring-offset-1 font-bold shadow-2xs`
                        : 'bg-white/60 text-[var(--sos-muted)] border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sales AI Memory Notes */}
        <MemoryNotesPanel journey={journey} onUpdateJourney={onUpdateJourney} />

        {/* Intelligent Omissions & Missing Notes Checklist - tokens semânticos */}
        <div className="bg-[var(--sos-warning-subtle)] border border-[var(--sos-warning)]/30 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[var(--sos-warning)] flex items-center gap-1.5 font-heading">
              <Sparkles className="w-3.5 h-3.5 text-[var(--sos-warning)]" />
              Checklist de Omissões & Notas Faltantes
            </span>
            <span className="text-[9px] font-mono bg-[var(--sos-warning)]/20 text-[var(--sos-warning)] px-1.5 py-0.5 rounded font-bold">
              IA Guard
            </span>
          </div>
          <p className="text-[10.5px] text-[var(--sos-warning)] leading-snug">
            Verificação em tempo real de dados essenciais que o operador pode ter esquecido de solicitar:
          </p>

          <div className="space-y-1 text-[10.5px]">
            {/* Checklist Item 1: Budget */}
            <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-[var(--sos-border)] shadow-2xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${journey.estimatedDealValueBrl ? 'bg-[var(--sos-action)]' : 'bg-[var(--sos-warning)] animate-ping'}`} />
                <span className="font-medium text-[var(--sos-ink)]">
                  {journey.estimatedDealValueBrl ? `Orçamento Estimado: R$ ${(Number(journey.estimatedDealValueBrl) || 0).toFixed(2)}` : 'Orçamento / Faixa de Preço não confirmada'}
                </span>
              </div>
              {!journey.estimatedDealValueBrl && (
                <span className="text-[9px] font-bold text-[var(--sos-warning)] bg-[var(--sos-warning-subtle)] px-1.5 py-0.5 rounded">
                  Recomendado
                </span>
              )}
            </div>

            {/* Checklist Item 2: Follow-up / Reminder */}
            <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-[var(--sos-border)] shadow-2xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${journey.followUpSchedule ? 'bg-[var(--sos-action)]' : 'bg-[var(--sos-danger)]'}`} />
                <span className="font-medium text-[var(--sos-ink)]">
                  {journey.followUpSchedule ? `Alarme: ${journey.followUpSchedule.label}` : 'Nenhum Follow-up / Retorno agendado'}
                </span>
              </div>
              {!journey.followUpSchedule && (
                <span className="text-[9px] font-bold text-[var(--sos-danger)] bg-[var(--sos-danger-subtle)] px-1.5 py-0.5 rounded">
                  Essencial
                </span>
              )}
            </div>

            {/* Checklist Item 3: Decision Maker */}
            <div className="flex items-center justify-between bg-white p-1.5 rounded-lg border border-[var(--sos-border)] shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--sos-action)]" />
                <span className="font-medium text-[var(--sos-ink)]">Decisor Principal Identificado</span>
              </div>
              <span className="text-[9px] font-bold text-[var(--sos-action)] bg-[var(--sos-action-subtle)] px-1.5 py-0.5 rounded">
                OK
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* OS 5 BLOCOS FIXOS DO LIVE DOSSIER - compact */}
        {/* ========================================================================= */}

        {/* BLOCO 1: Objetivo do Cliente */}
        <div id="dossier-block-objective" className="border border-[var(--sos-border)] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('objective')}
            className="w-full px-2.5 py-1.5 bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 flex items-center justify-between text-left transition-colors border-b border-[var(--sos-border)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-4 h-4 rounded bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Target className="w-2.5 h-2.5" />
              </div>
              <span className="font-bold text-xs text-[var(--sos-ink)] truncate">
                1. Objetivo do Cliente
              </span>
            </div>
            {expandedBlocks.objective ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            )}
          </button>

          {expandedBlocks.objective && (
            <div className="p-2 space-y-1.5">
              {objectiveFacts.length === 0 ? (
                <div className="text-center py-1.5 text-xs text-[var(--sos-muted)]">Objetivo ainda não registrado.</div>
              ) : objectiveFacts.map((fact) => (
                <KnownFactItem key={fact.id} fact={fact} onViewEvidence={handleOpenFactEvidence} />
              ))}
            </div>
          )}
        </div>

        {/* BLOCO 2: O que já foi confirmado */}
        <div id="dossier-block-confirmed" className="border border-[var(--sos-border)] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('confirmed')}
            className="w-full px-2.5 py-1.5 bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 flex items-center justify-between text-left transition-colors border-b border-[var(--sos-border)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-4 h-4 rounded bg-[var(--sos-action-subtle)] text-[var(--sos-action)] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-2.5 h-2.5" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-[var(--sos-ink)] block truncate">
                  2. O que já foi confirmado ({confirmedFactsList.length})
                </span>
              </div>
            </div>
            {expandedBlocks.confirmed ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            )}
          </button>

          {expandedBlocks.confirmed && (
            <div className="p-2 space-y-1.5">
              {confirmedFactsList.length === 0 ? (
                <div className="text-center py-1.5 text-xs text-[var(--sos-muted)]">
                  Nenhum fato confirmado até o momento.
                </div>
              ) : (
                <>
                  {displayedConfirmed.map((fact) => (
                    <KnownFactItem
                      key={fact.id}
                      fact={fact}
                      onViewEvidence={handleOpenFactEvidence}
                    />
                  ))}
                  {confirmedFactsList.length > 5 && (
                    <button
                      onClick={() => setShowAllConfirmed(!showAllConfirmed)}
                      className="w-full py-1 text-[10.5px] font-semibold text-[var(--sos-action)] hover:text-[var(--sos-action-hover)] text-center"
                    >
                      {showAllConfirmed
                        ? 'Ver menos'
                        : `Ver mais (${confirmedFactsList.length - 5} fatos restantes)`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* BLOCO 3: Fricção ou Objeção Atual */}
        <div id="dossier-block-friction" className="border border-[var(--sos-border)] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('friction')}
            className="w-full px-2.5 py-1.5 bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 flex items-center justify-between text-left transition-colors border-b border-[var(--sos-border)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-4 h-4 rounded bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-2.5 h-2.5" />
              </div>
              <span className="font-bold text-xs text-[var(--sos-ink)] truncate">
                3. Fricção ou Objeção Atual ({activeFrictionList.length})
              </span>
            </div>
            {expandedBlocks.friction ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            )}
          </button>

          {expandedBlocks.friction && (
            <div className="p-2 space-y-1.5">
              {activeFrictionList.length === 0 ? (
                <div className="text-center py-1.5 text-xs text-[var(--sos-muted)]">
                  Nenhuma fricção ou objeção ativa identificada.
                </div>
              ) : (
                activeFrictionList.map((fact) => (
                  <KnownFactItem
                    key={fact.id}
                    fact={fact}
                    onViewEvidence={handleOpenFactEvidence}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* BLOCO 4: Último Combinado */}
        <div id="dossier-block-commitment" className="border border-[var(--sos-border)] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('commitment')}
            className="w-full px-2.5 py-1.5 bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 flex items-center justify-between text-left transition-colors border-b border-[var(--sos-border)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-4 h-4 rounded bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Handshake className="w-2.5 h-2.5" />
              </div>
              <span className="font-bold text-xs text-[var(--sos-ink)] truncate">
                4. Último Combinado
              </span>
            </div>
            {expandedBlocks.commitment ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            )}
          </button>

          {expandedBlocks.commitment && (
            <div className="p-2 space-y-1.5">
              {journey.followUpSchedule && (
                <div className="p-2 bg-[var(--sos-ai-subtle)] border border-[var(--sos-ai)]/30 rounded-lg text-[10.5px] space-y-0.5">
                  <div className="flex items-center justify-between font-bold text-[var(--sos-ai)]">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[var(--sos-ai)]" />
                      Retomada Programada:
                    </span>
                    <span className="bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] px-2 py-0.5 rounded text-[9.5px] font-mono">
                      {journey.followUpSchedule.label}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-[var(--sos-ai)] italic">
                    "{journey.followUpSchedule.reason}"
                  </p>
                </div>
              )}

              {lastCommitmentList.length === 0 && !journey.followUpSchedule ? (
                <div className="text-center py-1.5 text-xs text-[var(--sos-muted)]">
                  Aguardando fechamento do primeiro combinado comercial.
                </div>
              ) : (
                lastCommitmentList.map((fact) => (
                  <KnownFactItem
                    key={fact.id}
                    fact={fact}
                    onViewEvidence={handleOpenFactEvidence}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* BLOCO 5: Responsável e Próximo Prazo */}
        <div id="dossier-block-ownership" className="border border-[var(--sos-border)] rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('ownership')}
            className="w-full px-2.5 py-1.5 bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 flex items-center justify-between text-left transition-colors border-b border-[var(--sos-border)]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-4 h-4 rounded bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center shrink-0">
                <UserCheck className="w-2.5 h-2.5" />
              </div>
              <span className="font-bold text-xs text-[var(--sos-ink)] truncate">
                5. Responsável e Próximo Prazo
              </span>
            </div>
            {expandedBlocks.ownership ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sos-muted)] shrink-0" />
            )}
          </button>

          {expandedBlocks.ownership && (
            <div className="p-2 space-y-1.5">
              {ownershipList.length === 0 ? (
                <div className="text-center py-1.5 text-xs text-[var(--sos-muted)]">Responsável e prazo ainda não registrados.</div>
              ) : ownershipList.map((fact) => (
                <KnownFactItem key={fact.id} fact={fact} onViewEvidence={handleOpenFactEvidence} />
              ))}
            </div>
          )}
        </div>

        {/* Estado do Canal WhatsApp */}
        <div className="space-y-1.5 pt-1.5 border-t border-[var(--sos-border)]">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--sos-muted)] block">
            Canal WhatsApp
          </span>
          <ChannelStatus
            channel={channel}
            onTogglePause={onToggleChannelPause}
            canManageChannel={role !== 'viewer'}
          />
        </div>

        {/* Controles de Handoff */}
        <div className="space-y-1.5">
          <HandoffControls
            journey={journey}
            role={role}
            currentOperatorId={currentOperatorId}
            currentOperatorName={currentOperatorName}
            onClaim={onClaimHandoff}
            onRelease={onReleaseHandoff}
          />
        </div>
      </div>

      {/* Shared Evidence Modal */}
      <EvidenceModal
        isOpen={evidenceModalData.isOpen}
        onClose={() => setEvidenceModalData((prev) => ({ ...prev, isOpen: false }))}
        title={evidenceModalData.title}
        subtitle={evidenceModalData.subtitle}
        confidence={evidenceModalData.confidence}
        evidences={evidenceModalData.evidences}
        blockedReason={evidenceModalData.blockedReason}
      />
    </div>
  );
};
