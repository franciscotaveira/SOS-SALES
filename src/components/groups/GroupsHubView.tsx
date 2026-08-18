import React from 'react';
import { WhatsAppGroup, WhatsAppEngineType, GroupCategory } from '../../types/groupsAndEngines';
import { GroupMonitor } from './GroupMonitor';
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
  Megaphone,
  Play,
  Pause,
  Volume2,
  ChevronDown,
  ChevronUp,
  FileText,
  TrendingUp,
  Activity,
  Tv,
} from 'lucide-react';
import { LiveWallboardView } from '../monitoring/LiveWallboardView';
import { getSupabaseClient } from '../../services/supabaseAuth';

interface GroupsHubViewProps {
  groups: WhatsAppGroup[];
  workspaceId?: string;
  onUpdateGroup?: (updated: WhatsAppGroup) => void;
  activeSubTab?: 'conversations' | 'monitor' | 'broadcast' | 'wallboard';
  onChangeSubTab?: (subTab: 'conversations' | 'monitor' | 'broadcast' | 'wallboard') => void;
}

export const GroupsHubView: React.FC<GroupsHubViewProps> = ({
  groups: initialGroups,
  workspaceId,
  onUpdateGroup,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab: externalOnChangeSubTab,
}) => {
  const [groups, setGroups] = React.useState<WhatsAppGroup[]>(initialGroups);
  const [internalSubTab, setInternalSubTab] = React.useState<'conversations' | 'monitor' | 'broadcast' | 'wallboard'>('conversations');
  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;
  const setActiveSubTab = externalOnChangeSubTab !== undefined ? externalOnChangeSubTab : setInternalSubTab;

  const [hubMode, setHubMode] = React.useState<'conversations' | 'monitor' | 'wallboard'>('conversations');
  const [selectedGroupId, setSelectedGroupId] = React.useState<string>(
    initialGroups[0]?.id || ''
  );

  const RESOLVED_STORAGE_KEY = `sos_sales_resolved_groups_${workspaceId || 'default'}`;

  const [resolvedMap, setResolvedMap] = React.useState<Record<string, { resolvedAt: string; isResolved: boolean }>>(() => {
    try {
      const saved = localStorage.getItem(RESOLVED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateResolvedMap = (updater: (prev: Record<string, { resolvedAt: string; isResolved: boolean }>) => Record<string, { resolvedAt: string; isResolved: boolean }>) => {
    setResolvedMap((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(RESOLVED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const fetchGroups = React.useCallback(async () => {
    const wsId = workspaceId || '11111111-1111-1111-1111-111111111111';
    try {
      const res = await fetch(`/api/v1/workspaces/${wsId}/groups`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.groups) && data.groups.length > 0) {
        // Read latest resolved map from localStorage to preserve user actions
        let currentResolvedMap: Record<string, { resolvedAt: string; isResolved: boolean }> = {};
        try {
          const saved = localStorage.getItem(`sos_sales_resolved_groups_${wsId}`);
          if (saved) currentResolvedMap = JSON.parse(saved);
        } catch {}

        const merged = data.groups.map((g: WhatsAppGroup) => {
          const resInfo = currentResolvedMap[g.id];
          if (resInfo?.isResolved) {
            return {
              ...g,
              healthStatus: 'active' as const,
              unreadCount: 0,
              pendingTaskCount: 0,
            };
          }
          return g;
        });

        setGroups(merged);
        if (!selectedGroupId || selectedGroupId === initialGroups[0]?.id) {
          setSelectedGroupId(data.groups[0].id);
        }
      }
    } catch {
      // silent
    }
  }, [workspaceId, initialGroups, selectedGroupId]);

  // Fetch live WhatsApp groups from API & Realtime Sync
  React.useEffect(() => {
    void fetchGroups();

    const wsId = workspaceId || '11111111-1111-1111-1111-111111111111';
    const client = getSupabaseClient();
    let channel: any;
    if (client) {
      channel = client
        .channel(`live-groups-${wsId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversation_messages',
            filter: `workspace_id=eq.${wsId}`,
          },
          () => {
            void fetchGroups();
          }
        )
        .subscribe();
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchGroups();
    }, 15000);

    return () => {
      if (client && channel) void client.removeChannel(channel);
      clearInterval(timer);
    };
  }, [fetchGroups, workspaceId]);

  const [search, setSearch] = React.useState('');
  const [clientFilter, setClientFilter] = React.useState<string>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [engineFilter, setEngineFilter] = React.useState<string>('all');
  const [quickReplyText, setQuickReplyText] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'chat' | 'tasks' | 'settings'>('chat');
  const [isDigestOpen, setIsDigestOpen] = React.useState(true);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = React.useState(false);
  const [broadcastText, setBroadcastText] = React.useState('');
  const [broadcastEngine, setBroadcastEngine] = React.useState<WhatsAppEngineType>('waha');
  const [broadcastTarget, setBroadcastTarget] = React.useState<'all' | 'clients' | 'launches'>('clients');
  const [broadcastSuccess, setBroadcastSuccess] = React.useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = React.useState(false);

  React.useEffect(() => {
    if (activeSubTab === 'conversations') {
      setHubMode('conversations');
      setIsBroadcastModalOpen(false);
    } else if (activeSubTab === 'monitor') {
      setHubMode('monitor');
      setIsBroadcastModalOpen(false);
    } else if (activeSubTab === 'wallboard') {
      setHubMode('wallboard');
      setIsBroadcastModalOpen(false);
    } else if (activeSubTab === 'broadcast') {
      setIsBroadcastModalOpen(true);
    }
  }, [activeSubTab]);

  React.useEffect(() => {
    if (!isBroadcastModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBroadcastModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBroadcastModalOpen]);

  const selectedGroup = React.useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId]
  );

  const uniqueClients = React.useMemo(() => {
    return ['all', ...Array.from(new Set((groups || []).map((g) => g?.clientName).filter(Boolean)))];
  }, [groups]);

  const filteredGroups = React.useMemo(() => {
    return (groups || []).filter((g) => {
      if (!g) return false;
      const gName = (g.name || '').toLowerCase();
      const gClient = (g.clientName || '').toLowerCase();
      const gLastText = (typeof g.lastMessage === 'string' ? g.lastMessage : (g.lastMessage?.text || '')).toLowerCase();
      const gTags = Array.isArray(g.tags) ? g.tags : [];
      const q = (search || '').toLowerCase();

      const matchesSearch =
        !q ||
        gName.includes(q) ||
        gClient.includes(q) ||
        gLastText.includes(q) ||
        gTags.some((t) => (t || '').toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (clientFilter !== 'all' && g.clientName !== clientFilter) return false;
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (engineFilter !== 'all' && g.engine !== engineFilter) return false;
      return true;
    });
  }, [groups, search, clientFilter, categoryFilter, engineFilter]);

  const pendingAttentionCount = (groups || []).filter((g) => {
    if (!g) return false;
    const isResolved = Boolean(resolvedMap[g.id]?.isResolved) || (g.healthStatus === 'active' && (g.unreadCount || 0) === 0);
    return !isResolved && (g.healthStatus === 'pending_action' || (g.unreadCount || 0) > 0);
  }).length;

  const handleTogglePin = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = groups.map((g) =>
      g.id === groupId ? { ...g, pinned: !g.pinned } : g
    );
    setGroups(updated);
  };

  const handleToggleResolve = async (groupId: string) => {
    const isCurrentlyResolved = Boolean(resolvedMap[groupId]?.isResolved);
    const newResolved = !isCurrentlyResolved;

    updateResolvedMap((prev) => ({
      ...prev,
      [groupId]: {
        resolvedAt: new Date().toISOString(),
        isResolved: newResolved,
      },
    }));

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              unreadCount: newResolved ? 0 : 1,
              healthStatus: newResolved ? ('active' as const) : ('pending_action' as const),
              pendingTaskCount: newResolved ? 0 : 1,
            }
          : g
      )
    );

    try {
      const wsId = workspaceId || '11111111-1111-1111-1111-111111111111';
      await fetch(`/api/v1/workspaces/${wsId}/groups/${encodeURIComponent(groupId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: newResolved }),
      });
    } catch {
      // silent
    }
  };

  const handleSendGroupMessage = async () => {
    if (!quickReplyText.trim() || !selectedGroup) return;

    const messageToSend = quickReplyText.trim();
    setQuickReplyText('');

    // Mark as resolved automatically on operator reply
    updateResolvedMap((prev) => ({
      ...prev,
      [selectedGroup.id]: {
        resolvedAt: new Date().toISOString(),
        isResolved: true,
      },
    }));

    const updated = groups.map((g) =>
      g.id === selectedGroup.id
        ? {
            ...g,
            unreadCount: 0,
            healthStatus: 'active' as const,
            pendingTaskCount: 0,
            lastMessage: {
              sender: 'Você (Gestor)',
              text: messageToSend,
              timestamp: 'Agora',
              isClient: false,
            },
          }
        : g
    );
    setGroups(updated);

    try {
      const wsId = workspaceId || '11111111-1111-1111-1111-111111111111';
      await fetch(`/api/v1/workspaces/${wsId}/groups/${encodeURIComponent(selectedGroup.id)}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageToSend }),
      });
    } catch {
      // ignore
    }
  };

  const handleSwitchEngine = (newEngine: WhatsAppEngineType) => {
    if (!selectedGroup) return;
    const updated = groups.map((g) =>
      g.id === selectedGroup.id ? { ...g, engine: newEngine } : g
    );
    setGroups(updated);
  };

  const handleExecuteBroadcast = () => {
    if (!broadcastText.trim()) return;

    const updated = groups.map((g) => {
      const isTarget =
        broadcastTarget === 'all' ||
        (broadcastTarget === 'clients' && g.category === 'client_account') ||
        (broadcastTarget === 'launches' && g.category === 'launch_squad');

      if (isTarget) {
        return {
          ...g,
          lastMessage: {
            sender: 'Você (Comunicado Agência)',
            text: broadcastText.trim(),
            timestamp: 'Agora',
            isClient: false,
          },
        };
      }
      return g;
    });

    setGroups(updated);
    setBroadcastSuccess(true);
    setTimeout(() => {
      setBroadcastSuccess(false);
      setIsBroadcastModalOpen(false);
      setBroadcastText('');
    }, 1200);
  };

  return (
    <div id="groups-hub-view" className="h-full overflow-y-auto w-full p-3 sm:p-5 max-w-7xl mx-auto space-y-4">
      {/* Broadcast Modal */}
      {isBroadcastModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#e7f8e8] text-[#00a884] flex items-center justify-center font-bold">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#111b21]">
                    Disparo de Comunicado em Lote para Grupos
                  </h3>
                  <p className="text-[11px] text-[#667781]">
                    Envie avisos simultâneos para os grupos de clientes da agência
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Target Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111b21]">Destinatários & Segmentação Comportamental:</label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  onClick={() => setBroadcastTarget('clients')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all ${
                    broadcastTarget === 'clients'
                      ? 'bg-[#e7f8e8] border-[#00a884] text-[#00a884]'
                      : 'bg-[#f0f2f5] border-transparent text-[#54656f]'
                  }`}
                >
                  12 Clientes Ativos
                </button>
                <button
                  onClick={() => setBroadcastTarget('launches')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all ${
                    broadcastTarget === 'launches'
                      ? 'bg-[#e7f8e8] border-[#00a884] text-[#00a884]'
                      : 'bg-[#f0f2f5] border-transparent text-[#54656f]'
                  }`}
                >
                  Squads Lançamento
                </button>
                <button
                  onClick={() => setBroadcastTarget('all')}
                  className={`p-2 rounded-xl border text-center font-bold transition-all ${
                    broadcastTarget === 'all'
                      ? 'bg-[#e7f8e8] border-[#00a884] text-[#00a884]'
                      : 'bg-[#f0f2f5] border-transparent text-[#54656f]'
                  }`}
                >
                  Todos os Grupos
                </button>
              </div>

              {/* Engagement Segmentation Filter */}
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>Filtro de Engajamento Comportamental:</span>
                  <span className="text-[10px] text-purple-700 font-mono">IA Scoring Ativo</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded accent-[#00a884]" />
                    <span className="text-slate-700">Apenas Alta Atividade (&gt;80%)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded accent-[#00a884]" />
                    <span className="text-slate-700">Excluir Grupos Silenciosos (&lt;3 dias)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Engine Route Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111b21]">Canal de Disparo:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => setBroadcastEngine('waha')}
                  className={`p-2 rounded-xl border flex items-center justify-between font-bold transition-all ${
                    broadcastEngine === 'waha'
                      ? 'bg-blue-50 border-blue-500 text-blue-800'
                      : 'bg-[#f0f2f5] border-transparent text-[#54656f]'
                  }`}
                >
                  <span>🔵 WAHA Hub (Sem Custo HSM)</span>
                  {broadcastEngine === 'waha' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                </button>
                <button
                  onClick={() => setBroadcastEngine('waba')}
                  className={`p-2 rounded-xl border flex items-center justify-between font-bold transition-all ${
                    broadcastEngine === 'waba'
                      ? 'bg-[#e7f8e8] border-[#00a884] text-[#00a884]'
                      : 'bg-[#f0f2f5] border-transparent text-[#54656f]'
                  }`}
                >
                  <span>🟢 WABA Oficial (Meta Cloud)</span>
                  {broadcastEngine === 'waba' && <CheckCircle2 className="w-3.5 h-3.5 text-[#00a884]" />}
                </button>
              </div>
            </div>

            {/* Broadcast Message Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111b21]">Texto do Comunicado:</label>
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                rows={3}
                placeholder="Ex: Equipe, favor conferir o saldo de recarga no Meta Ads antes do feriado..."
                className="w-full p-3 text-xs bg-[#f0f2f5] rounded-xl border-none outline-none focus:ring-1 focus:ring-[#00a884] text-[#111b21]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-[#54656f] hover:text-[#111b21]"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteBroadcast}
                disabled={!broadcastText.trim()}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  broadcastSuccess
                    ? 'bg-emerald-600 text-white'
                    : broadcastText.trim()
                    ? 'bg-[#00a884] hover:bg-[#008069] text-white shadow-xs'
                    : 'bg-slate-300 text-white cursor-not-allowed'
                }`}
              >
                {broadcastSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Disparado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparar para os Grupos</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header: Groups & Communities Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#111b21]">
              Hub de Grupos de WhatsApp
            </h1>
            <span className="bg-[#e7f8e8] text-[#00a884] font-bold text-xs px-2.5 py-0.5 rounded-full border border-[#00a884]/30">
              {groups.length} Grupos Ativos
            </span>
          </div>
          <p className="text-xs text-[#54656f] mt-0.5">
            Gestão unificada de grupos e comunidades de clientes com alternância de motor WABA e Evolution/WAHA.
          </p>
        </div>

        {/* View Mode Switcher & Quick Agency Metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveSubTab('conversations')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                hubMode === 'conversations'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversas</span>
            </button>

            <button
              onClick={() => setActiveSubTab('monitor')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                hubMode === 'monitor'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Monitor</span>
            </button>

            <button
              id="groups-switch-wallboard-btn"
              onClick={() => setActiveSubTab('wallboard')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                hubMode === 'wallboard'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-purple-700'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Torre TV (NOC)</span>
            </button>
          </div>

          <div className="bg-white border border-[#e2e8f0] px-3 py-1.5 rounded-xl shadow-2xs text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span className="font-bold text-[#111b21]">
              {groups.filter((g) => (g.unreadCount || 0) > 0 || g.healthStatus === 'pending_action').length} grupos
            </span>
            <span className="text-[#54656f]">pendentes</span>
          </div>
        </div>
      </div>

      {/* AI Daily Digest Banner (O que aconteceu nos grupos hoje) */}
      <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-white border border-emerald-200/90 rounded-2xl p-3.5 shadow-2xs">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsDigestOpen(!isDigestOpen)}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#00a884] text-white flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-[#111b21] flex items-center gap-2">
                <span>Resumo Inteligente SOS: Monitoramento de {groups.length} grupos</span>
                <span className="text-[10px] bg-white text-[#00a884] border border-[#00a884]/30 px-2 py-0.2 rounded-full font-bold">
                  IA Copilot
                </span>
              </div>
              <p className="text-[11px] text-[#54656f]">
                {groups.length > 0
                  ? `${groups.filter(g => (g.unreadCount || 0) > 0 || g.healthStatus === 'pending_action').length} grupos com mensagens ou pendências recentes.`
                  : "Nenhum grupo ativo no momento."}
              </p>
            </div>
          </div>
          <button className="text-[#54656f] hover:text-[#111b21] p-1">
            {isDigestOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {isDigestOpen && groups.length > 0 && (
          <div className="mt-3 pt-3 border-t border-emerald-200/60 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            {groups.slice(0, 3).map((grp) => (
              <div
                key={grp.id}
                onClick={() => setSelectedGroupId(grp.id)}
                className="p-2.5 bg-white rounded-xl border border-slate-200/80 space-y-1 shadow-2xs cursor-pointer hover:border-emerald-400 transition"
              >
                <div className="flex items-center justify-between font-bold text-[#111b21] text-[11.5px]">
                  <span className="truncate max-w-[170px]">{grp.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                      (grp.unreadCount || 0) > 0 ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {(grp.unreadCount || 0) > 0 ? `${grp.unreadCount} novas` : 'Ativo'}
                  </span>
                </div>
                <p className="text-[11px] text-[#54656f] line-clamp-2">
                  {grp.lastMessage?.text ? `${grp.lastMessage.sender}: ${grp.lastMessage.text}` : 'Grupo sincronizado e monitorado via WAHA/WABA.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Conditional: Wallboard, Group Monitor or Standard 2-Column Split */}
      {hubMode === 'wallboard' ? (
        <LiveWallboardView
          groups={groups}
          mode="groups"
          onOpenGroup={(groupId) => {
            setSelectedGroupId(groupId);
            setActiveSubTab('conversations');
          }}
        />
      ) : hubMode === 'monitor' ? (
        <GroupMonitor
          groups={groups}
          onSelectGroup={(groupId) => {
            setSelectedGroupId(groupId);
            setHubMode('conversations');
          }}
          onQuickRespond={(groupId, message) => {
            const updated = groups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    unreadCount: 0,
                    healthStatus: 'active' as const,
                    lastMessage: {
                      sender: 'Você (Gestor)',
                      text: message,
                      timestamp: 'Agora',
                      isClient: false,
                    },
                  }
                : g
            );
            setGroups(updated);
          }}
        />
      ) : (
        /* Main 2-Column Split: Groups Navigation Sidebar & Selected Group Workspace */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Group Search & List (5 cols) */}
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

            {/* Client Account Filter */}
            <div className="flex items-center gap-2 pt-0.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#54656f] shrink-0">
                Cliente:
              </label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full text-xs font-semibold bg-[#f0f2f5] text-[#111b21] border-none rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-[#00a884]"
              >
                <option value="all">🏢 Todos os Clientes da Agência</option>
                {uniqueClients
                  .filter((c) => c !== 'all')
                  .map((client) => (
                    <option key={client} value={client}>
                      🏢 {client}
                    </option>
                  ))}
              </select>
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
                const isResolved = Boolean(resolvedMap[grp.id]?.isResolved) || (grp.healthStatus === 'active' && (grp.unreadCount || 0) === 0);
                const needsAttention = !isResolved && (grp.healthStatus === 'pending_action' || (grp.unreadCount || 0) > 0);

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
                          {grp.engine ? grp.engine.toUpperCase() : 'WAHA'}
                        </span>

                        {!isResolved && (grp.unreadCount || 0) > 0 && (
                          <span className="bg-[#25d366] text-white font-bold text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center">
                            {grp.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Last message snippet */}
                    <div className="text-[11.5px] text-[#54656f] line-clamp-1 mt-1 font-normal">
                      <span className="font-semibold text-[#111b21]">
                        {grp.lastMessage?.sender || 'Participante'}:
                      </span>{' '}
                      {grp.lastMessage?.text || 'Mensagem do grupo'}
                    </div>

                    {/* Footer: Tags & Milestone */}
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#f0f2f5] text-[10px]">
                      <div className="flex items-center gap-1 text-[#8696a0] truncate max-w-[200px]">
                        <Clock className="w-3 h-3" />
                        <span>{grp.lastMessage?.timestamp || 'Hoje'}</span>
                        {grp.nextMilestone && (
                          <span className="truncate text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-medium">
                            🎯 {grp.nextMilestone}
                          </span>
                        )}
                      </div>

                      {needsAttention ? (
                        <span className="text-amber-800 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Pendente
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Resolvido
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
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
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
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      selectedGroup.engine === 'waha'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-[#667781] hover:text-[#111b21]'
                    }`}
                    title="WAHA Multi-Device (Grupos & Automações)"
                  >
                    WAHA Hub
                  </button>
                </div>

                {(() => {
                  const isCurrentResolved = Boolean(resolvedMap[selectedGroup.id]?.isResolved) || (selectedGroup.healthStatus === 'active' && (selectedGroup.unreadCount || 0) === 0);
                  return (
                    <button
                      onClick={() => handleToggleResolve(selectedGroup.id)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                        isCurrentResolved
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300'
                          : 'bg-amber-50 hover:bg-emerald-50 text-amber-900 hover:text-emerald-900 border border-amber-300 hover:border-emerald-300'
                      }`}
                      title={
                        isCurrentResolved
                          ? 'Grupo resolvido. Clique para reabrir pendência se necessário.'
                          : 'Marcar como atendido / pendências resolvidas'
                      }
                    >
                      {isCurrentResolved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Resolvido</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 text-amber-700" />
                          <span>Marcar como Resolvido</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Sub-Tabs */}
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
                ⚙️ Roteamento de Engine ({selectedGroup.engine ? selectedGroup.engine.toUpperCase() : 'WAHA'})
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
                        {selectedGroup.lastMessage?.sender || 'Participante'}
                      </div>
                      <p className="whitespace-pre-wrap">{selectedGroup.lastMessage?.text || 'Grupo WhatsApp ativo'}</p>
                      <div className="text-[10px] text-[#667781] text-right mt-1">
                        {selectedGroup.lastMessage?.timestamp || 'Hoje'}
                      </div>
                    </div>
                  </div>

                  {/* Simulated Voice Message Bubble from Client */}
                  {selectedGroup.id === 'grp-01' && (
                    <div className="flex flex-col items-start">
                      <div className="bg-white text-[#111b21] max-w-[85%] p-2.5 rounded-lg wa-bubble-shadow text-[13px] space-y-1.5">
                        <div className="text-[10.5px] font-bold text-[#00a884]">
                          Renata (Sócia Bella) · Mensagem de Voz (0:28)
                        </div>
                        <div className="flex items-center gap-3 bg-[#f0f2f5] p-2 rounded-xl">
                          <button
                            onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                            className="w-8 h-8 rounded-full bg-[#00a884] text-white flex items-center justify-center shrink-0 shadow-2xs"
                          >
                            {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>
                          {/* Audio Waveform visualization */}
                          <div className="flex-1 flex items-center gap-0.5 h-6">
                            {[12, 24, 18, 32, 14, 28, 40, 20, 16, 30, 36, 22, 14, 26, 18, 10].map((h, idx) => (
                              <span
                                key={idx}
                                style={{ height: `${h}px` }}
                                className={`w-1 rounded-full transition-all ${
                                  isPlayingAudio ? 'bg-[#00a884] animate-pulse' : 'bg-slate-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] font-mono text-[#667781]">0:28</span>
                        </div>
                        <div className="text-[10.5px] text-[#667781] bg-amber-50 p-1.5 rounded border border-amber-200/60">
                          🤖 <b>Transcrição IA:</b> <i>"Oi equipe, conseguimos dar um foco no sábado para os atendimentos de noiva? Valeu!"</i>
                        </div>
                      </div>
                    </div>
                  )}

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
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendGroupMessage();
                          }
                        }}
                        rows={2}
                        placeholder={`Responder no grupo "${selectedGroup.name}"... (Pressione Enter para enviar, Shift+Enter para nova linha)`}
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
    )}
  </div>
);
};
