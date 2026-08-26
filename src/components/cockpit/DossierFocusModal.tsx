import React from 'react';
import {
  X,
  Sparkles,
  DollarSign,
  Calendar,
  Clock,
  Send,
  Paperclip,
  Mic,
  CreditCard,
  Zap,
  MapPin,
  FileText,
  AlertTriangle,
  Brain,
  Plus,
  Edit2,
  CheckCheck,
} from 'lucide-react';
import {
  ApiCockpitView,
  ApiMessage,
} from '../../services/salesOsGateway';
import { ContactAvatar } from './ContactAvatar';
import { MessageMediaRenderer } from './MessageMediaRenderer';
import { normalizeStage } from '../kanban/LiveCommercialKanbanView';
import { PIPELINE_STAGES, detectCustomerLoyalty, CustomerLoyaltyType } from './LiveCockpitView';
import { QuickToolsPopover, QuickToolItem } from './QuickToolsPopover';

interface DossierFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  view: ApiCockpitView;
  workspaceId: string;
  loyaltyMap?: Record<string, CustomerLoyaltyType>;
  onToggleLoyalty?: () => void;
  onStageChange: (stage: string) => void;
  onOpenOutcomeModal: () => void;
  onOpenFollowUpModal: () => void;
  onOpenExternalAgenda: () => void;
  onOpenSalesVaultModal: () => void;
  onOpenWabaButtonsModal: () => void;
  onOpenWabaTemplateModal: () => void;
  onOpenFactModal: () => void;
  onCreateOutboundDraft: (text: string) => void;
  onUpdateContactName?: (name: string) => void;
  actionInProgress: boolean;
}

export const DossierFocusModal: React.FC<DossierFocusModalProps> = ({
  isOpen,
  onClose,
  view,
  workspaceId,
  loyaltyMap,
  onToggleLoyalty,
  onStageChange,
  onOpenOutcomeModal,
  onOpenFollowUpModal,
  onOpenExternalAgenda,
  onOpenSalesVaultModal,
  onOpenWabaButtonsModal,
  onOpenWabaTemplateModal,
  onOpenFactModal,
  onCreateOutboundDraft,
  onUpdateContactName,
  actionInProgress,
}) => {
  const { journey, acquisitionContexts, messages, decisionState, recommendation, knownFacts } = view;
  const acquisition = acquisitionContexts[0] ?? null;
  const loyalty = React.useMemo(() => detectCustomerLoyalty(journey as any, loyaltyMap), [journey, loyaltyMap]);

  const [draftText, setDraftText] = React.useState('');
  const [quickToolsOpen, setQuickToolsOpen] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Notes state
  const [newNoteText, setNewNoteText] = React.useState('');
  const [newNoteTag, setNewNoteTag] = React.useState('Preferência');
  const [isAddingNote, setIsAddingNote] = React.useState(false);
  const [operatorNotes, setOperatorNotes] = React.useState<Array<{ id: string; text: string; tag: string; time: string }>>([
    { id: '1', text: 'Cliente prefere horários no final da tarde (após 17h30)', tag: 'Preferência', time: '10:45' },
  ]);

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    setOperatorNotes((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: newNoteText.trim(),
        tag: newNoteTag,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setNewNoteText('');
    setIsAddingNote(false);
  };

  // Keyboard shortcut: ESC to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Scroll to bottom on open or new message
  React.useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const currentNormalized = normalizeStage(journey.pipelineStage);
  const hoursSinceLastInbound = React.useMemo(() => {
    const inbounds = (messages || []).filter((m) => m.direction === 'inbound');
    if (inbounds.length === 0) return null;
    const last = inbounds[inbounds.length - 1];
    return Math.max(0, (Date.now() - new Date(last.sentAt).getTime()) / (1000 * 60 * 60));
  }, [messages]);

  const isWindowActive = hoursSinceLastInbound !== null && hoursSinceLastInbound < 24;
  const hoursRemaining = hoursSinceLastInbound !== null ? Math.max(0, 24 - hoursSinceLastInbound) : 24;

  const quickToolsList: QuickToolItem[] = [
    {
      id: 'pix',
      category: 'financeiro',
      icon: <CreditCard size={15} className="text-emerald-600" />,
      label: 'Chave Pix Oficial',
      description: 'Envia dados da conta e chave Pix para pagamento imediato',
      action: () => {
        setDraftText('Olá! Segue nossa chave Pix para confirmação do seu agendamento/pedido. Envie o comprovante aqui para confirmação imediata!');
        setQuickToolsOpen(false);
      },
    },
    {
      id: 'agenda',
      category: 'agenda',
      icon: <Calendar size={15} className="text-purple-600" />,
      label: 'Vagas & Horários Livres',
      description: 'Consulta grade de horários da Agenda Trinks',
      action: () => {
        onOpenExternalAgenda?.();
        setQuickToolsOpen(false);
      },
    },
    {
      id: 'followup',
      category: 'agenda',
      icon: <Clock size={15} className="text-blue-600" />,
      label: 'Agendar Follow-Up',
      description: 'Programa lembrete ou reengajamento comercial',
      action: () => {
        onOpenFollowUpModal?.();
        setQuickToolsOpen(false);
      },
    },
    {
      id: 'waba_buttons',
      category: 'waba',
      icon: <Zap size={15} className="text-amber-600" />,
      label: 'Botões Interativos WABA',
      description: 'Dispara botões de resposta rápida no WhatsApp',
      action: () => {
        onOpenWabaButtonsModal?.();
        setQuickToolsOpen(false);
      },
    },
    {
      id: 'vault',
      category: 'midia',
      icon: <Mic size={15} className="text-rose-600" />,
      label: 'Recursos & Áudios Prontos',
      description: 'Áudios gravados, fotos de antes/depois e tabelas',
      action: () => {
        onOpenSalesVaultModal?.();
        setQuickToolsOpen(false);
      },
    },
    {
      id: 'location',
      category: 'localizacao',
      icon: <MapPin size={15} className="text-emerald-600" />,
      label: 'Enviar Localização & Endereço',
      description: 'Injeta mapa e ponto de referência no chat',
      action: () => {
        setDraftText('📍 Nosso endereço: Av. Getúlio Vargas, 1000 - Centro, Chapecó - SC (Estacionamento conveniado no local).');
        setQuickToolsOpen(false);
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="w-full h-full max-w-7xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Top Header do Modo Foco */}
        <header className="border-b border-slate-200 bg-slate-900 px-5 py-3 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <ContactAvatar
              name={journey.contact.name}
              phone={journey.contact.phone}
              workspaceId={workspaceId}
              avatarUrl={(journey.contact as any)?.avatarUrl || (journey as any)?.leadAvatar}
              size="md"
              showOnlineBadge={isWindowActive}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black truncate font-heading text-white">
                  {journey.contact.name || 'Contato WhatsApp'}
                </h2>
                <button
                  type="button"
                  onClick={onToggleLoyalty}
                  className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold border transition-all cursor-pointer shadow-2xs hover:scale-105 ${loyalty.badgeClass}`}
                  title="Clique para alternar entre Cliente Recorrente e Novo Lead"
                >
                  {loyalty.label}
                </button>
                {isWindowActive && (
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                    <Clock size={11} /> Janela: {(Number(hoursRemaining) || 0).toFixed(1)}h
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="font-mono">{journey.contact.phone}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">{acquisition?.campaignName || 'Meta Ads (Tráfego Pago)'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Seletor de Etapa */}
            <div className="flex items-center gap-1.5 bg-slate-800 rounded-xl px-2.5 py-1 border border-slate-700">
              <span className="text-xs text-slate-400 font-bold hidden sm:inline">Etapa:</span>
              <select
                value={currentNormalized}
                onChange={(e) => onStageChange(e.target.value)}
                disabled={actionInProgress}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-slate-900 text-white">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Desfecho */}
            <button
              type="button"
              onClick={onOpenOutcomeModal}
              disabled={actionInProgress}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
            >
              <DollarSign size={14} /> Desfecho
            </button>

            {/* Botão Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Fechar Modo Foco (ESC)"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Corpo Dividido em 2 Painéis Amplos */}
        <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] flex-1 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          
          {/* PAINEL ESQUERDO: CHAT WHATSAPP AO VIVO */}
          <div className="flex flex-col h-full min-h-0 p-3 bg-slate-50/60 overflow-hidden">
            <div className="flex items-center justify-between pb-2 px-1 text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">💬 Conversa Ativa WhatsApp</span>
              <span className="text-[11px] text-slate-500 font-mono">{messages.length} mensagens</span>
            </div>

            {/* Stream de Mensagens */}
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 rounded-2xl border border-slate-200/90 bg-[#efeae2] p-3.5 overflow-y-auto whatsapp-chat-wallpaper space-y-2"
            >
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center p-6 text-center text-xs text-slate-500">
                  Nenhuma mensagem registrada ainda.
                </div>
              ) : (
                messages.map((message) => {
                  const isOut = message.direction === 'outbound';
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-2xs ${
                        isOut
                          ? 'ml-auto bg-[#d9fdd3] text-[#111b21] rounded-tr-xs border border-[#c4f8bb]'
                          : 'mr-auto bg-white text-[#111b21] rounded-tl-xs border border-slate-200/80'
                      }`}
                    >
                      <MessageMediaRenderer
                        mediaPayload={(message as any).mediaPayload}
                        textContent={message.textContent}
                        isOutbound={isOut}
                        senderName={isOut ? 'Você' : journey.contact.name || 'Cliente'}
                      />
                      <div className="mt-0.5 text-right text-[10px] text-slate-500 font-mono flex items-center justify-end gap-1">
                        <span>{new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isOut && <span className="text-[#53bdeb] font-bold text-xs">✓✓</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer do Modo Foco */}
            <div className="mt-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs space-y-2 shrink-0">
              {/* Linha Tática */}
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-extrabold text-emerald-950 text-[11px] shrink-0">💡 Próximo Passo:</span>
                  <span className="text-emerald-900 truncate text-[11px] italic">
                    "{recommendation?.suggestedDraftText || 'Ofereça opções de horários ou chave Pix para fechar'}"
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftText(recommendation?.suggestedDraftText || '')}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer shrink-0"
                >
                  Usar Resposta
                </button>
              </div>

              {/* Objection Breakers Chips */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-[10.5px]">
                <span className="text-[9.5px] font-extrabold uppercase text-slate-400 shrink-0">Quebrar:</span>
                {[
                  { label: "💰 Tá caro", text: "Entendo perfeitamente! Mas se dividirmos pelo resultado que você vai ter, sai menos de R$ 3 por dia. Vamos garantir sua vaga com essa condição especial?" },
                  { label: "🤔 Vou pensar", text: "Claro! Para te ajudar a decidir, qual é o ponto principal que ficou com dúvida? Assim já te passo a resposta certinha." },
                  { label: "👨‍👩‍👧 Falar com marido", text: "Super justo! Se você quiser, posso te mandar um resumo dos benefícios e horários livres para você mostrar pra ele." },
                  { label: "⏰ Sem tempo", text: "Pensando nisso, nosso atendimento é ultra-otimizado e pontual. Temos horários no início da manhã ou no fim da tarde. Qual prefere?" },
                  { label: "💳 Enviar Pix", text: "Olá! Segue nossa chave Pix para confirmação. Envie o comprovante aqui para confirmação imediata!" },
                  { label: "📍 Endereço", text: "📍 Nosso endereço: Av. Getúlio Vargas, 1000 - Centro, Chapecó - SC (Estacionamento conveniado no local)." },
                ].map((obj, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDraftText(obj.text)}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200/80 transition shrink-0 cursor-pointer active:scale-95 text-[10px]"
                  >
                    {obj.label}
                  </button>
                ))}
              </div>

              {/* Input Row */}
              <div className="flex items-center gap-1.5 relative">
                <QuickToolsPopover
                  isOpen={quickToolsOpen}
                  onClose={() => setQuickToolsOpen(false)}
                  tools={quickToolsList}
                />

                <button
                  type="button"
                  onClick={() => setQuickToolsOpen((prev) => !prev)}
                  className="p-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1 text-xs font-bold"
                  title="Caixa de Atalhos"
                >
                  <Zap size={15} className="text-amber-500" />
                  <span className="hidden sm:inline">Atalhos</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer shadow-2xs shrink-0"
                  title="Anexar Arquivo"
                >
                  <Paperclip size={15} />
                </button>

                <input
                  type="text"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 shadow-2xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draftText.trim()) {
                      e.preventDefault();
                      onCreateOutboundDraft(draftText.trim());
                      setDraftText('');
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    if (draftText.trim()) {
                      onCreateOutboundDraft(draftText.trim());
                      setDraftText('');
                    }
                  }}
                  disabled={actionInProgress || !draftText.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer shrink-0"
                >
                  <Send size={13} /> Enviar
                </button>
              </div>
            </div>
          </div>

          {/* PAINEL DIREITO: DOSSIÊ DO CLIENTE & AÇÕES DE FECHAMENTO */}
          <div className="flex flex-col h-full min-h-0 p-4 bg-white overflow-y-auto space-y-3.5">
            {/* Header do Dossiê */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 font-heading">
                  Dossiê Comercial do Cliente
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10.5px] font-bold">
                Memória do Lead
              </span>
            </div>

            {/* 0. Perfil de Fidelidade (Recorrente vs Novo) */}
            <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-purple-950 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={12} className="text-purple-600" /> Perfil de Fidelidade Comercial
                </span>
                <button
                  type="button"
                  onClick={onToggleLoyalty}
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10.5px] font-extrabold transition cursor-pointer shadow-2xs"
                >
                  Alternar para {loyalty.type === 'RECURRING' ? 'Novo Lead' : 'Recorrente'}
                </button>
              </div>
              <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-purple-100">
                <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold border shrink-0 ${loyalty.badgeClass}`}>
                  {loyalty.label}
                </span>
                <span className="text-xs text-slate-700 font-medium">{loyalty.description}</span>
              </div>
            </div>

            {/* 1. Origem do Lead & Gancho do Anúncio */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-2 shadow-2xs">
              <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1">
                <Zap size={12} className="text-indigo-600" /> Origem Meta Ads & Gancho de Interesse
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div className="p-2 bg-white rounded-xl border border-indigo-100 text-xs">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase block">Campanha:</span>
                  <span className="font-bold text-slate-900">{acquisition?.campaignName || 'Campanha Instagram / Meta Ads'}</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-indigo-100 text-xs">
                  <span className="text-[9.5px] text-slate-400 font-bold uppercase block">Oferta de Interesse:</span>
                  <span className="font-bold text-emerald-800">{acquisition?.offerHook || 'Oferta de Mechas & Tratamento'}</span>
                </div>
              </div>
            </div>

            {/* 2. Preferências & Fatos Confirmados */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5 font-heading uppercase tracking-wider">
                  <Brain size={13} className="text-purple-600" /> Fatos & Preferências ({knownFacts.length})
                </p>
                <button
                  type="button"
                  onClick={onOpenFactModal}
                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                >
                  <Plus size={10} /> + Info
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase block">Serviço Desejado:</span>
                    <span className="font-bold text-slate-900">{acquisition?.offerHook || 'Serviço de Beleza'}</span>
                  </div>
                  {knownFacts.map((fact) => (
                    <div key={fact.id} className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <span className="text-[9.5px] text-slate-400 font-bold uppercase block">{(fact as any).key || (fact as any).factKey || 'Fato'}:</span>
                      <span className="font-bold text-slate-800">{String((fact as any).value || (fact as any).factValue || '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Ações Rápidas de Fechamento (1 Toque) */}
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-emerald-950 flex items-center gap-1.5 font-heading uppercase tracking-wider">
                  <CheckCheck size={14} className="text-emerald-700" /> Fechamento em 1 Toque
                </p>
                <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                  Pronto para Enviar
                </span>
              </div>
              <p className="text-xs text-emerald-950 italic bg-white p-2 rounded-xl border border-emerald-200">
                "{recommendation?.suggestedDraftText || 'Olá! Temos horários disponíveis amanhã às 14h e às 17h. Qual período fica melhor para você?'}"
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onCreateOutboundDraft("Temos horários livres amanhã às 14h e 17h. Qual desses fica melhor para você?");
                    onClose();
                  }}
                  className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <Clock size={12} /> 2 Horários da Tarde
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateOutboundDraft("Olá! Segue nossa chave Pix para confirmação do sinal. Envie o comprovante para confirmação imediata!");
                    onClose();
                  }}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer flex items-center justify-center gap-1"
                >
                  <CreditCard size={12} /> Chave Pix Sinal
                </button>
              </div>
            </div>

            {/* 5. Anotações Estratégicas do Atendente */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-heading uppercase tracking-wider">
                  <FileText size={13} className="text-slate-700" /> Anotações do Atendente ({operatorNotes.length})
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddingNote((v) => !v)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  {isAddingNote ? 'Cancelar' : '+ Nova Nota'}
                </button>
              </div>

              {isAddingNote && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Tag:</span>
                    <select
                      value={newNoteTag}
                      onChange={(e) => setNewNoteTag(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg text-xs p-1 font-bold"
                    >
                      <option value="Preferência">Preferência</option>
                      <option value="Orçamento">Orçamento</option>
                      <option value="Restrição">Restrição</option>
                      <option value="Urgência">Urgência</option>
                    </select>
                  </div>
                  <textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Escreva a anotação..."
                    rows={2}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Salvar Nota
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {operatorNotes.map((note) => (
                  <div key={note.id} className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-bold text-[9.5px]">
                        {note.tag}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{note.time}</span>
                    </div>
                    <p className="text-slate-800 text-[11.5px] leading-snug">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
