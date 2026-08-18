import React from 'react';
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

  // Fallback blocks if journey.dossier is not fully populated
  const objectiveFacts = dossier?.customerObjective || [
    {
      id: 'd-obj-default',
      label: 'Objetivo Principal',
      value: journey.urgencyReason || 'Agendamento / Compra de serviço',
      confidence: 'CONFIRMED' as const,
      evidence: [
        {
          id: 'ev-obj-def',
          source: 'CUSTOMER_MESSAGE' as const,
          label: 'Última mensagem do lead',
          excerpt: journey.lastLeadMessage,
          occurredAt: 'Recente',
        },
      ],
      updatedAt: journey.lastActivityAt,
    },
  ];

  const confirmedFactsList = dossier?.confirmedFacts || knownFacts.filter((f) => f.confidence === 'CONFIRMED');
  const activeFrictionList = dossier?.activeFriction || knownFacts.filter((f) => f.confidence === 'TO_CONFIRM' || f.confidence === 'PROBABLE');
  const lastCommitmentList = dossier?.lastCommitment || [];
  const ownershipList = dossier?.ownershipAndDeadline || [
    {
      id: 'd-own-default',
      label: 'Responsável e Prazo',
      value: `${journey.assignedOperatorName || 'Fila Aberta (Pendente)'} · SLA ${journey.slaMinutesRemaining}m restantes`,
      confidence: 'CONFIRMED' as const,
      evidence: [
        {
          id: 'ev-own-def',
          source: 'SYSTEM_INFERENCE' as const,
          label: 'Monitor de SLA',
          excerpt: `SLA Deadline: ${journey.slaDeadline}`,
          occurredAt: 'Tempo Real',
        },
      ],
      updatedAt: journey.lastActivityAt,
    },
  ];

  const displayedConfirmed = showAllConfirmed ? confirmedFactsList : confirmedFactsList.slice(0, 5);

  return (
    <div id="live-dossier-panel" className="cockpit-panel flex flex-col h-full max-h-full min-h-0 overflow-hidden">
      {/* Panel Header */}
      <div className="cockpit-panel-header px-4 py-3 shrink-0 flex items-center justify-between border-b border-[#e2e8f0] bg-white">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-heading">
              Dossiê Vivo de Decisão
            </h2>
          </div>
          <p className="text-[11px] text-slate-500">5 blocos de continuidade comercial</p>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Sales OS Live
          </span>

          {onToggleMode && (
            <button
              onClick={onToggleMode}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
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
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Fechar / Recolher Dossiê"
              aria-label="Fechar Dossiê"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Dossier Content */}
      <div className="p-3.5 overflow-y-auto flex-1 min-h-0 space-y-3.5">
        {/* Outcome Banner (if closed) */}
        {outcome && (
          <div
            id="dossier-outcome-banner"
            className={`p-3 rounded-xl border text-xs ${
              outcome.status === 'won'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600" />
                Resultado: {outcome.status === 'won' ? 'Venda Concluída' : 'Perdido'}
              </span>
              {outcome.dealValueBrl && (
                <span className="font-mono text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded font-bold">
                  R$ {(Number(outcome.dealValueBrl) || 0).toFixed(2)}
                </span>
              )}
            </div>
            {outcome.serviceOrProduct && (
              <div className="text-[11px] font-medium text-slate-700">
                Item: {outcome.serviceOrProduct}
              </div>
            )}
            {outcome.reason && (
              <div className="text-[11px] text-slate-600 italic mt-0.5">
                "{outcome.reason}"
              </div>
            )}
          </div>
        )}

        {/* Origem e Atribuição Meta CTWA */}
        <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-slate-700">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              Origem da Conversa
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isCTWA ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {isCTWA ? 'Meta Ads CTWA' : 'Orgânico / Direto'}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Campanha</span>
            <div className="font-semibold text-slate-900 leading-snug">
              {acquisition.campaignName || 'Origem ainda não confirmada'}
            </div>
          </div>

          {acquisition.referralOffer && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-[10px] font-bold uppercase text-blue-700 flex items-center gap-1 mb-0.5">
                <Tag className="w-3 h-3" />
                Oferta Prometida no Anúncio:
              </span>
              <div className="font-bold text-blue-900 text-[11px]">
                {acquisition.referralOffer}
              </div>
            </div>
          )}
        </div>

        {/* Sales AI Memory Notes */}
        <MemoryNotesPanel journey={journey} onUpdateJourney={onUpdateJourney} />

        {/* Intelligent Omissions & Missing Notes Checklist (Never forget to ask or note) */}
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-amber-900 flex items-center gap-1.5 font-heading">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Checklist de Omissões & Notas Faltantes
            </span>
            <span className="text-[10px] font-mono bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded font-bold">
              IA Guard
            </span>
          </div>
          <p className="text-[11px] text-amber-800 leading-snug">
            Verificação em tempo real de dados essenciais que o operador pode ter esquecido de solicitar:
          </p>

          <div className="space-y-1.5 text-xs">
            {/* Checklist Item 1: Budget */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200/60 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${journey.estimatedDealValueBrl ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
                <span className="font-medium text-slate-800">
                  {journey.estimatedDealValueBrl ? `Orçamento Estimado: R$ ${(Number(journey.estimatedDealValueBrl) || 0).toFixed(2)}` : 'Orçamento / Faixa de Preço não confirmada'}
                </span>
              </div>
              {!journey.estimatedDealValueBrl && (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                  Recomendado
                </span>
              )}
            </div>

            {/* Checklist Item 2: Follow-up / Reminder */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200/60 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${journey.followUpSchedule ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-medium text-slate-800">
                  {journey.followUpSchedule ? `Alarme: ${journey.followUpSchedule.label}` : 'Nenhum Follow-up / Retorno agendado'}
                </span>
              </div>
              {!journey.followUpSchedule && (
                <span className="text-[10px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded">
                  Essencial
                </span>
              )}
            </div>

            {/* Checklist Item 3: Decision Maker */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200/60 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-slate-800">Decisor Principal Identificado</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                OK
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* OS 5 BLOCOS FIXOS DO LIVE DOSSIER */}
        {/* ========================================================================= */}

        {/* BLOCO 1: Objetivo do Cliente */}
        <div id="dossier-block-objective" className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('objective')}
            className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Target className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-slate-800 truncate">
                1. Objetivo do Cliente
              </span>
            </div>
            {expandedBlocks.objective ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {expandedBlocks.objective && (
            <div className="p-2.5 space-y-2">
              {objectiveFacts.map((fact) => (
                <KnownFactItem
                  key={fact.id}
                  fact={fact}
                  onViewEvidence={handleOpenFactEvidence}
                />
              ))}
            </div>
          )}
        </div>

        {/* BLOCO 2: O que já foi confirmado */}
        <div id="dossier-block-confirmed" className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('confirmed')}
            className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3 h-3" />
              </div>
              <div className="min-w-0">
                <span className="font-bold text-xs text-slate-800 block truncate">
                  2. O que já foi confirmado ({confirmedFactsList.length})
                </span>
              </div>
            </div>
            {expandedBlocks.confirmed ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {expandedBlocks.confirmed && (
            <div className="p-2.5 space-y-2">
              {confirmedFactsList.length === 0 ? (
                <div className="text-center py-2 text-xs text-slate-500">
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
                      className="w-full py-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 text-center"
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
        <div id="dossier-block-friction" className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('friction')}
            className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-slate-800 truncate">
                3. Fricção ou Objeção Atual ({activeFrictionList.length})
              </span>
            </div>
            {expandedBlocks.friction ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {expandedBlocks.friction && (
            <div className="p-2.5 space-y-2">
              {activeFrictionList.length === 0 ? (
                <div className="text-center py-2 text-xs text-slate-500">
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
        <div id="dossier-block-commitment" className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('commitment')}
            className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Handshake className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-slate-800 truncate">
                4. Último Combinado
              </span>
            </div>
            {expandedBlocks.commitment ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {expandedBlocks.commitment && (
            <div className="p-2.5 space-y-2">
              {journey.followUpSchedule && (
                <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-purple-900">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Retomada Programada:
                    </span>
                    <span className="bg-purple-200/80 text-purple-950 px-2 py-0.5 rounded text-[10px] font-mono">
                      {journey.followUpSchedule.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800 italic">
                    "{journey.followUpSchedule.reason}"
                  </p>
                </div>
              )}

              {lastCommitmentList.length === 0 && !journey.followUpSchedule ? (
                <div className="text-center py-2 text-xs text-slate-500">
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
        <div id="dossier-block-ownership" className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => toggleBlock('ownership')}
            className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <UserCheck className="w-3 h-3" />
              </div>
              <span className="font-bold text-xs text-slate-800 truncate">
                5. Responsável e Próximo Prazo
              </span>
            </div>
            {expandedBlocks.ownership ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {expandedBlocks.ownership && (
            <div className="p-2.5 space-y-2">
              {ownershipList.map((fact) => (
                <KnownFactItem
                  key={fact.id}
                  fact={fact}
                  onViewEvidence={handleOpenFactEvidence}
                />
              ))}
            </div>
          )}
        </div>

        {/* Estado do Canal WhatsApp */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
            Canal WhatsApp
          </span>
          <ChannelStatus
            channel={channel}
            onTogglePause={onToggleChannelPause}
            canManageChannel={role !== 'viewer'}
          />
        </div>

        {/* Controles de Handoff */}
        <div className="space-y-2">
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
