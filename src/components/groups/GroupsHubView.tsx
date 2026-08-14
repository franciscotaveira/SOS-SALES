import React from 'react';
import { WhatsAppGroup, WhatsAppEngineType, GroupCategory } from '../../types/groupsAndEngines';
import {
  Users,
  Search,
  Filter,
  Pin,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  Sparkles,
  Zap,
  Tag,
  Radio,
  Layers,
  ArrowUpRight,
  MessageSquare,
  ShieldCheck,
  Check,
  Smile,
  Paperclip,
} from 'lucide-react';

interface GroupsHubViewProps {
  groups: WhatsAppGroup[];
  onUpdateGroup?: (updated: WhatsAppGroup) => void;
}

export const GroupsHubView: React.FC<GroupsHubViewProps> = ({
  groups: initialGroups,
  onUpdateGroup,
}) => {
  const [groups, setGroups] = React.useState<WhatsAppGroup[]>(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>(
    initialGroups[0]?.id || ''
  );
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [engineFilter, setEngineFilter] = React.useState<string>('all');
  const [quickReplyText, setQuickReplyText] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'chat' | 'tasks' | 'settings'>('chat');

  const selectedGroup = React.useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || groups[0],
    [groups, selectedGroupId]
  );

  const filteredGroups = React.useMemo(() => {
    return groups.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.clientName.toLowerCase().includes(search.toLowerCase()) ||
        g.lastMessage.text.toLowerCase().includes(search.toLowerCase()) ||
        g.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (engineFilter !== 'all' && g.engine !== engineFilter) return false;
      return true;
    });
  }, [groups, search, categoryFilter, engineFilter]);

  const pendingAttentionCount = groups.filter(
    (g) => g.healthStatus === 'pending_action' || g.unreadCount > 0
  ).length;

  const handleTogglePin = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = groups.map((g) =>
      g.id === groupId ? { ...g, pinned: !g.pinned } : g
    );
    setGroups(updated);
  };

  const handleMarkAsDone = (groupId: string) => {
    const updated = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            unreadCount: 0,
            healthStatus: 'active' as const,
            pendingTaskCount: Math.max(0, g.pendingTaskCount - 1),
          }
        : g
      );
    setGroups(updated);
  };

  const handleSendGroupMessage = () => {
    if (!quickReplyText.trim() || !selectedGroup) return;

    const updated = groups.map((g) =>
      g.id === selectedGroup.id
        ? {
            ...g,
            unreadCount: 0,
            healthStatus: 'active' as const,
            lastMessage: {
              sender: 'Você (Gestor)',
              text: quickReplyText.trim(),
              timestamp: 'Agora',
              isClient: false,
            },
          }
        : g
    );
    setGroups(updated);
    setQuickReplyText('');
  };

  const handleSwitchEngine = (newEngine: WhatsAppEngineType) => {
    if (!selectedGroup) return;
    const updated = groups.map((g) =>
      g.id === selectedGroup.id ? { ...g, engine: newEngine } : g
    );
    setGroups(updated);
  };

  return (
    <div id="groups-hub-view" className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4">
      {/* Top Banner: Agency Command Center Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#111b21]">
              Hub de Grupos de WhatsApp
            </h1>
            <span className="bg-[#e7f8e8] text-[#00a884] font-bold text-xs px-2.5 py-0.5 rounded-full border border-[#00a884]/30">
              12 Clientes Ativos
            </span>
          </div>
          <p className="text-xs text-[#54656f] mt-0.5">
            Gestão unificada de grupos da agência com alternância entre WABA (Oficial) e WAHA (Automação).
          </p>
        </div>

        {/* Quick Agency Metrics */}
        <div className="flex items-center gap-2">
          <div className="bg-white border border-[#e2e8f0] px-3 py-1.5 rounded-xl shadow-2xs text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="font-bold text-[#111b21]">
              {pendingAttentionCount} grupos
            </span>
            <span className="text-[#667781]">precisam de resposta</span>
          </div>

          <div className="bg-[#f0f2f5] border border-[#e2e8f0] px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 text-[#54656f]">
            <Layers className="w-3.5 h-3.5 text-[#00a884]" />
            <span>Multi-Engine Ativo</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Groups Navigation Sidebar & Selected Group Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Group Search & List (4 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {/* Search & Filter Bar */}
          <div className="bg-white p-2.5 rounded-xl border border-[#e2e8f0] shadow-2xs space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8696a0] absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar grupo, cliente ou tag..."
                className="w-full pl-9 pr-3 py-1.5 text-xs text-[#111b21] bg-[#f0f2f5] rounded-lg border-none focus:ring-1 focus:ring-[#00a884] placeholder:text-[#8696a0]"
              />
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-0.5">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-[#f0f2f5] text-[#54656f] hover:bg-slate-200'
                }`}
              >
                Todos ({groups.length})
              </button>
              <button
                onClick={() => setCategoryFilter('client_account')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                  categoryFilter === 'client_account'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-[#f0f2f5] text-[#54656f] hover:bg-slate-200'
                }`}
              >
                Clientes
              </button>
              <button
                onClick={() => setCategoryFilter('launch_squad')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                  categoryFilter === 'launch_squad'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-[#f0f2f5] text-[#54656f] hover:bg-slate-200'
                }`}
              >
                Lançamentos
              </button>
              <button
                onClick={() => setCategoryFilter('agency_internal')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors ${
                  categoryFilter === 'agency_internal'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-[#f0f2f5] text-[#54656f] hover:bg-slate-200'
                }`}
              >
                Interno
              </button>
            </div>
          </div>

          {/* Groups Scrollable List */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-2xs divide-y divide-[#f0f2f5] max-h-[620px] overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8696a0]">
                Nenhum grupo encontrado com os filtros atuais.
              </div>
            ) : (
              filteredGroups.map((grp) => {
                const isSelected = grp.id === selectedGroup?.id;
                const needsAttention = grp.healthStatus === 'pending_action' || grp.unreadCount > 0;

                return (
                  <div
                    key={grp.id}
                    onClick={() => setSelectedGroupId(grp.id)}
                    className={`p-3 cursor-pointer transition-all relative ${
                      isSelected
                        ? 'bg-[#f0f2f5] border-l-4 border-l-[#00a884]'
                        : needsAttention
                        ? 'bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-400'
                        : 'hover:bg-[#f0f2f5]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      {/* Left: Avatar & Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#dfe5e7] text-[#54656f] flex items-center justify-center font-bold text-xs shrink-0 border border-white">
                          <Users className="w-4 h-4 text-[#54656f]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#111b21] truncate">
                              {grp.name}
                            </span>
                            {grp.pinned && (
                              <Pin className="w-3 h-3 text-[#00a884] shrink-0 fill-[#00a884]" />
                            )}
                          </div>
                          <span className="text-[11px] text-[#667781] block truncate">
                            {grp.clientName}
                          </span>
                        </div>
                      </div>

                      {/* Right: Engine Badge + Unread Badge */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                            grp.engine === 'waba'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {grp.engine.toUpperCase()}
                        </span>

                        {grp.unreadCount > 0 && (
                          <span className="bg-[#25d366] text-white font-bold text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center">
                            {grp.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Last message snippet */}
                    <div className="text-[11.5px] text-[#54656f] line-clamp-1 mt-1 font-normal">
                      <span className="font-semibold text-[#111b21]">
                        {grp.lastMessage.sender}:
                      </span>{' '}
                      {grp.lastMessage.text}
                    </div>

                    {/* Footer: Tags & Milestone */}
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#f0f2f5] text-[10px]">
                      <div className="flex items-center gap-1 text-[#8696a0] truncate max-w-[200px]">
                        <Clock className="w-3 h-3" />
                        <span>{grp.lastMessage.timestamp}</span>
                        {grp.nextMilestone && (
                          <span className="truncate text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-medium">
                            🎯 {grp.nextMilestone}
                          </span>
                        )}
                      </div>

                      {needsAttention && (
                        <span className="text-amber-800 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Pendente
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Group Detail & Quick Action Center (7 cols) */}
        {selectedGroup && (
          <div className="lg:col-span-7 bg-white rounded-xl border border-[#e2e8f0] shadow-2xs overflow-hidden flex flex-col min-h-[620px]">
            {/* WhatsApp Group Top Header */}
            <div className="p-3.5 bg-[#f0f2f5] border-b border-[#e2e8f0] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#dfe5e7] text-[#54656f] flex items-center justify-center font-bold text-sm shadow-2xs border border-white shrink-0">
                  <Users className="w-5 h-5 text-[#54656f]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm text-[#111b21] truncate">
                      {selectedGroup.name}
                    </h2>
                    <span className="text-[10.5px] bg-[#e7f8e8] text-[#00a884] font-bold px-2 py-0.5 rounded-full">
                      {selectedGroup.participantCount} participantes
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#667781] mt-0.5">
                    <span>Cliente: {selectedGroup.clientName}</span>
                    <span>·</span>
                    <span>Gestor: {selectedGroup.assignedManagerName}</span>
                  </div>
                </div>
              </div>

              {/* Engine Switcher Header Controller */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="bg-white border border-[#e2e8f0] p-0.5 rounded-lg flex items-center text-[10.5px] font-bold">
                  <button
                    onClick={() => handleSwitchEngine('waba')}
                    className={`px-2 py-1 rounded transition-colors ${
                      selectedGroup.engine === 'waba'
                        ? 'bg-[#00a884] text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111b21]'
                    }`}
                    title="Meta Cloud API Oficial (WABA)"
                  >
                    WABA Oficial
                  </button>
                  <button
                    onClick={() => handleSwitchEngine('waha')}
                    className={`px-2 py-1 rounded transition-colors ${
                      selectedGroup.engine === 'waha'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111b21]'
                    }`}
                    title="WAHA Multi-Device (Grupos & Automações)"
                  >
                    WAHA Hub
                  </button>
                </div>

                <button
                  onClick={() => handleMarkAsDone(selectedGroup.id)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors flex items-center gap-1 shadow-2xs"
                  title="Marcar como atendido / pendências resolvidas"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Resolvido</span>
                </button>
              </div>
            </div>

            {/* Sub-Tabs: Conversa Rápida | Demandas & Pauta | Inteligência de Tráfego */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-[#f0f2f5] bg-white text-xs font-semibold text-[#54656f]">
              <button
                onClick={() => setActiveTab('chat')}
                className={`pb-1 border-b-2 transition-colors ${
                  activeTab === 'chat'
                    ? 'border-[#00a884] text-[#00a884] font-bold'
                    : 'border-transparent hover:text-[#111b21]'
                }`}
              >
                💬 Visualização & Resposta Rápida
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`pb-1 border-b-2 transition-colors ${
                  activeTab === 'tasks'
                    ? 'border-[#00a884] text-[#00a884] font-bold'
                    : 'border-transparent hover:text-[#111b21]'
                }`}
              >
                🎯 Pauta & Entregas do Cliente ({selectedGroup.pendingTaskCount})
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`pb-1 border-b-2 transition-colors ${
                  activeTab === 'settings'
                    ? 'border-[#00a884] text-[#00a884] font-bold'
                    : 'border-transparent hover:text-[#111b21]'
                }`}
              >
                ⚙️ Roteamento de Engine ({selectedGroup.engine.toUpperCase()})
              </button>
            </div>

            {/* Tab Body */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col">
                {/* Chat Feed Simulated WhatsApp */}
                <div className="flex-1 p-4 whatsapp-chat-wallpaper space-y-3 overflow-y-auto max-h-[360px]">
                  {/* Context notice */}
                  <div className="text-center my-1">
                    <span className="text-[10px] bg-white/90 text-[#54656f] border border-[#e2e8f0] px-3 py-0.5 rounded-full shadow-2xs">
                      {selectedGroup.engine === 'waba'
                        ? '🟢 Conectado via Meta Business Cloud API (WABA Oficial)'
                        : '🔵 Conectado via WAHA Multi-Device (Agência Session)'}
                    </span>
                  </div>

                  {/* Previous context msg */}
                  <div className="flex flex-col items-start">
                    <div className="bg-white text-[#111b21] max-w-[85%] px-3.5 py-2 rounded-lg wa-bubble-shadow text-[13px]">
                      <div className="text-[10.5px] font-bold text-[#00a884] mb-0.5">
                        {selectedGroup.lastMessage.sender}
                      </div>
                      <p className="whitespace-pre-wrap">{selectedGroup.lastMessage.text}</p>
                      <div className="text-[10px] text-[#667781] text-right mt-1">
                        {selectedGroup.lastMessage.timestamp}
                      </div>
                    </div>
                  </div>

                  {/* Operational Notes Badge */}
                  {selectedGroup.notes && (
                    <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Contexto Estratégico do Cliente:</span>
                      </div>
                      <p className="text-[11.5px] leading-relaxed text-amber-800">
                        {selectedGroup.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Quick Reply Bar for Agency Manager */}
                <div className="p-3 bg-[#f0f2f5] border-t border-[#e2e8f0]">
                  {/* Shortcut helper chips */}
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
                    <span className="text-[10.5px] text-[#667781] font-bold shrink-0">
                      Respostas Rápidas:
                    </span>
                    <button
                      onClick={() =>
                        setQuickReplyText(
                          'Recebido! Já estamos verificando os anúncios e te dou um retorno em 15 minutos.'
                        )
                      }
                      className="text-[10.5px] bg-white hover:bg-slate-100 text-[#111b21] px-2 py-0.5 rounded-md border border-[#e2e8f0] shrink-0"
                    >
                      Analisando em 15min
                    </button>
                    <button
                      onClick={() =>
                        setQuickReplyText(
                          'Criativos aprovados e já subindo no Gerenciador de Anúncios!'
                        )
                      }
                      className="text-[10.5px] bg-white hover:bg-slate-100 text-[#111b21] px-2 py-0.5 rounded-md border border-[#e2e8f0] shrink-0"
                    >
                      Criativos subindo
                    </button>
                    <button
                      onClick={() =>
                        setQuickReplyText(
                          'Relatório de ROAS consolidado enviado no drive da pasta de vocês.'
                        )
                      }
                      className="text-[10.5px] bg-white hover:bg-slate-100 text-[#111b21] px-2 py-0.5 rounded-md border border-[#e2e8f0] shrink-0"
                    >
                      Relatório pronto
                    </button>
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 focus-within:border-[#00a884] focus-within:ring-1 focus-within:ring-[#00a884] shadow-2xs">
                      <textarea
                        value={quickReplyText}
                        onChange={(e) => setQuickReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSendGroupMessage();
                          }
                        }}
                        rows={2}
                        placeholder={`Responder no grupo "${selectedGroup.name}" como ${selectedGroup.assignedManagerName}... (Cmd + Enter)`}
                        className="w-full px-3.5 py-2 text-[13px] text-[#111b21] bg-transparent border-none outline-none resize-none leading-relaxed"
                      />
                    </div>

                    <button
                      onClick={handleSendGroupMessage}
                      disabled={!quickReplyText.trim()}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        quickReplyText.trim()
                          ? 'bg-[#00a884] hover:bg-[#008069] text-white shadow-xs cursor-pointer'
                          : 'bg-slate-300 text-white cursor-not-allowed opacity-70'
                      }`}
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && (
              <div className="p-4 space-y-4 flex-1">
                <div>
                  <h3 className="font-bold text-sm text-[#111b21]">
                    Pauta de Entregas & SLA do Cliente ({selectedGroup.clientName})
                  </h3>
                  <p className="text-xs text-[#667781]">
                    Acompanhe o que precisa ser entregue para destravar a operação da agência.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-purple-900">
                        Próximo Marco: {selectedGroup.nextMilestone || 'Alinhamento Semanal'}
                      </div>
                      <div className="text-purple-700 text-[11px]">
                        Responsável: {selectedGroup.assignedManagerName}
                      </div>
                    </div>
                    <span className="bg-purple-200 text-purple-950 font-bold px-2 py-0.5 rounded text-[10px]">
                      Prioritário
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-[#e2e8f0] rounded-xl flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#111b21]">
                        Monitoramento de Mensagens & Handoff do Bot
                      </div>
                      <div className="text-[#667781] text-[11px]">
                        Garantir que nenhum lead fique mais de 5 minutos sem resposta no WhatsApp.
                      </div>
                    </div>
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                      SLA Normal
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="p-4 space-y-4 flex-1">
                <div>
                  <h3 className="font-bold text-sm text-[#111b21]">
                    Configuração de Roteamento de Engine
                  </h3>
                  <p className="text-xs text-[#667781]">
                    Escolha qual tecnologia de WhatsApp gerencia este grupo e as mensagens.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() => handleSwitchEngine('waba')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedGroup.engine === 'waba'
                        ? 'bg-[#e7f8e8] border-[#00a884] ring-1 ring-[#00a884]'
                        : 'bg-white border-[#e2e8f0] hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-[#111b21] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#00a884]" />
                        Meta WABA (Cloud API Oficial)
                      </span>
                      {selectedGroup.engine === 'waba' && (
                        <CheckCircle2 className="w-4 h-4 text-[#00a884]" />
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#54656f] leading-relaxed">
                      Ideal para campanhas oficiais, alta confiabilidade de entrega e conformidade total com termos da Meta.
                    </p>
                  </div>

                  <div
                    onClick={() => handleSwitchEngine('waha')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedGroup.engine === 'waha'
                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-white border-[#e2e8f0] hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-[#111b21] flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-blue-600" />
                        WAHA (Multi-Device HTTP Hub)
                      </span>
                      {selectedGroup.engine === 'waha' && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#54656f] leading-relaxed">
                      Ideal para gestão ágil de múltiplos grupos comunitários, squads internos e escuta de eventos em tempo real.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
