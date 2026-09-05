import React from 'react';
import { Workspace, OperatorRole } from '../../types/cockpit';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useFeatureFlags } from '../../contexts/FeatureFlagContext';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import {
  getWorkspaceAiMode,
  loadWorkspaceAgentConfig,
  setWorkspaceAiMode,
  GlobalAiAutonomyMode,
} from '../../services/aiAutonomyManager';
import {
  Flame,
  MessageSquare,
  Columns3,
  BarChart3,
  Users,
  Bot,
  Zap,
  Radio,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  LogOut,
  Shield,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Lock,
  PieChart,
  CalendarDays,
  BookOpen,
  Megaphone,
  Building2,
} from 'lucide-react';

export type NavigationTab =
  | 'agora'
  | 'conversas'
  | 'kanban'
  | 'agenda'
  | 'anotacoes'
  | 'clientes'
  | 'resultados'
  | 'analytics'
  | 'grupos'
  | 'playbook'
  | 'simulador'
  | 'configuracoes';

interface AppShellProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (workspace: Workspace) => void;
  activeTab: NavigationTab;
  onChangeTab: (tab: NavigationTab) => void;
  pendingPrioritiesCount: number;
  pendingGroupsCount?: number;
  role: OperatorRole;
  onChangeRole: (role: OperatorRole) => void;
  onSimulateIncomingLeadMessage?: () => void;
  onSimulateNetworkErrorToggle?: () => void;
  isNetworkErrorForced?: boolean;
  activeIntelligenceSubTab?: string;
  onChangeIntelligenceSubTab?: (subTab: string) => void;
  activeSettingsSubTab?: string;
  onChangeSettingsSubTab?: (subTab: string) => void;
  activeGroupSubTab?: string;
  onChangeGroupSubTab?: (subTab: string) => void;
  activeResultsSubTab?: string;
  onChangeResultsSubTab?: (subTab: any) => void;
  activeConversationsMode?: 'list' | 'kanban' | 'wallboard';
  onChangeConversationsMode?: (mode: 'list' | 'kanban' | 'wallboard') => void;
  userEmail?: string;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  activeTab,
  onChangeTab,
  pendingPrioritiesCount,
  pendingGroupsCount = 0,
  role,
  onChangeRole,
  activeIntelligenceSubTab = 'knowledge',
  onChangeIntelligenceSubTab,
  activeSettingsSubTab = 'canais',
  onChangeSettingsSubTab,
  activeGroupSubTab = 'conversations',
  onChangeGroupSubTab,
  activeResultsSubTab = 'traffic_proof',
  onChangeResultsSubTab,
  activeConversationsMode = 'list',
  onChangeConversationsMode,
  userEmail,
  onSignOut,
  children,
}) => {
  const { isFeatureEnabled } = useFeatureFlags();

  // Persistent sidebar state saved in localStorage (default to false = expanded)
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sos_sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);
  const [helpModalOpen, setHelpModalOpen] = React.useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = React.useState(false);
  const [administrationOpen, setAdministrationOpen] = React.useState(false);

  // Toggle collapse state and persist preference
  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sos_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Keyboard shortcut listener (Ctrl+K / Cmd+K and Esc)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchModalOpen(false);
        setNotificationsOpen(false);
        setRoleMenuOpen(false);
        setHelpModalOpen(false);
        setLogoutModalOpen(false);
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showKanban = isFeatureEnabled('commercial_kanban');
  // Production navigation is intentionally small. Every visible item still
  // needs a real backend contract; legacy demo screens stay out of the live
  // shell without deleting their code for future tiers.
  const isProductionMvp = salesOsRuntimeConfig.mode === 'api';
  const showGroups = !isProductionMvp && isFeatureEnabled('agency_groups');
  const showTrafficProof = isFeatureEnabled('traffic_proof');
  const showQaSimulator = !isProductionMvp && isFeatureEnabled('qa_simulator');

  // RBAC permissions based on role
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || role === 'owner';

  // Live channel status via real-time endpoints. Static workspace health is
  // never used as proof of a production connection.
  const [liveChannelStatus, setLiveChannelStatus] = React.useState<{
    session?: string;
    status: string;
    phone?: string | null;
    pushName?: string | null;
  } | null>(null);
  const [liveWabaStatus, setLiveWabaStatus] = React.useState<{
    configured?: boolean;
    credentialsAvailable?: boolean;
    phoneNumber?: string | null;
  } | null>(null);
  const [liveChannelStatusError, setLiveChannelStatusError] = React.useState<string | null>(null);

  const fetchLiveChannelStatus = React.useCallback(async () => {
    if (!currentWorkspace?.id) return;
    const [wahaResult, wabaResult] = await Promise.allSettled([
      authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/channels/whatsapp/status`),
      authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/channels/waba/channel-info`),
    ]);

    if (wahaResult.status === 'fulfilled') {
      const response = wahaResult.value;
      if (response.ok) {
        setLiveChannelStatus(await response.json());
        setLiveChannelStatusError(null);
      } else {
        setLiveChannelStatus(null);
        setLiveChannelStatusError(`Status indisponível (${response.status})`);
      }
    } else {
      setLiveChannelStatus(null);
      setLiveChannelStatusError('Status indisponível');
    }

    if (wabaResult.status === 'fulfilled') {
      const response = wabaResult.value;
      if (response.ok) {
        const data = await response.json();
        setLiveWabaStatus(data);
      } else if (response.status === 404) {
        setLiveWabaStatus({ configured: false });
      } else {
        setLiveWabaStatus(null);
      }
    } else {
      setLiveWabaStatus(null);
    }
  }, [currentWorkspace?.id]);

  React.useEffect(() => {
    fetchLiveChannelStatus();
    const interval = setInterval(fetchLiveChannelStatus, 5000);
    const handleStatusChanged = () => {
      void fetchLiveChannelStatus();
    };
    window.addEventListener('sos_channel_status_changed', handleStatusChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('sos_channel_status_changed', handleStatusChanged);
    };
  }, [fetchLiveChannelStatus]);

  // Single Source of Truth for Global AI Autonomy Mode (24/7 vs Learning/Copilot)
  const [globalAiMode, setGlobalAiMode] = React.useState<GlobalAiAutonomyMode>(() =>
    getWorkspaceAiMode(currentWorkspace.id)
  );
  const [aiModeLoading, setAiModeLoading] = React.useState(true);
  const [aiModeError, setAiModeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setGlobalAiMode(getWorkspaceAiMode(currentWorkspace.id));
    setAiModeLoading(true);
    setAiModeError(null);
    void loadWorkspaceAgentConfig(currentWorkspace.id)
      .then((config) => setGlobalAiMode(config.autonomyMode))
      .catch(() => {
        setGlobalAiMode('copilot_supervised');
        setAiModeError('Configuração da IA não confirmada');
      })
      .finally(() => setAiModeLoading(false));
    const handleModeChanged = (e: any) => {
      if (e.detail?.workspaceId === currentWorkspace.id && e.detail?.mode) {
        setGlobalAiMode(e.detail.mode);
      }
    };
    window.addEventListener('sos_ai_mode_changed', handleModeChanged);
    return () => window.removeEventListener('sos_ai_mode_changed', handleModeChanged);
  }, [currentWorkspace.id]);

  const toggleGlobalAiMode = async () => {
    if (aiModeLoading) return;
    const nextMode: GlobalAiAutonomyMode =
      globalAiMode === 'autonomous_24_7' ? 'copilot_supervised' : 'autonomous_24_7';
    setAiModeLoading(true);
    setAiModeError(null);
    try {
      const config = await setWorkspaceAiMode(currentWorkspace.id, nextMode);
      setGlobalAiMode(config.autonomyMode);
    } catch {
      setGlobalAiMode('copilot_supervised');
      setAiModeError('Falha ao publicar modo da IA');
    } finally {
      setAiModeLoading(false);
    }
  };

  // Primary channel status. A stored WABA token is configuration evidence,
  // not a live Meta health check, so never render it as "online". WAHA has a
  // live session status endpoint and may be shown as online only when that
  // endpoint reports WORKING.
  const primaryChannel = currentWorkspace.channels[0];
  const hasOfficialChannel = liveWabaStatus?.configured === true;
  const isOfficialChannelConfigured = hasOfficialChannel
    && liveWabaStatus?.credentialsAvailable === true;
  const isOfficialChannelIncomplete = hasOfficialChannel && !isOfficialChannelConfigured;
  const isChannelOnline = !hasOfficialChannel
    && !liveChannelStatusError
    && liveChannelStatus?.status === 'WORKING';
  const isChannelPaused = !hasOfficialChannel && primaryChannel?.health === 'paused';
  const isChannelScanning = !hasOfficialChannel && liveChannelStatus?.status === 'SCAN_QR_CODE';
  const channelEngine = hasOfficialChannel
    ? 'META'
    : liveChannelStatus?.session
      ? 'WAHA'
      : (primaryChannel as any)?.engine
        ? (primaryChannel as any).engine.toUpperCase()
        : 'CANAL';
  const channelBadgeState = isChannelPaused
    ? 'paused'
    : isOfficialChannelConfigured
      ? 'configured'
      : isOfficialChannelIncomplete
        ? 'attention'
        : isChannelOnline
          ? 'online'
          : isChannelScanning
            ? 'scanning'
            : 'offline';
  const channelBadgeCopy = {
    paused: 'WhatsApp Pausado',
    configured: 'Meta configurado',
    attention: 'Meta incompleto',
    online: 'WhatsApp Online',
    scanning: 'Aguardando QR',
    offline: 'WhatsApp Offline',
  }[channelBadgeState];

  // Role hierarchy helper for fine-grained authorization
  const roleHierarchy: Record<OperatorRole, number> = {
    viewer: 0,
    operator: 1,
    supervisor: 2,
    admin: 3,
    owner: 4,
  };

  const hasRoleAccess = (requiredRole?: OperatorRole) => {
    if (!requiredRole) return true;
    return (roleHierarchy[role] ?? 1) >= (roleHierarchy[requiredRole] ?? 1);
  };

  // Domain Navigation Group Definitions
  interface NavItem {
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
    roleRequired?: OperatorRole;
    visible?: boolean;
    tag?: string;
    conversationsMode?: 'list' | 'kanban' | 'wallboard';
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      title: 'ATENDIMENTO',
      items: [
        {
          id: 'agora',
          label: 'Agora',
          icon: Flame,
          badge: pendingPrioritiesCount > 0 ? pendingPrioritiesCount : undefined,
          badgeColor: 'bg-[#DC2626] text-white',
          roleRequired: 'operator',
          visible: true,
        },
        {
          id: 'conversas',
          label: 'Conversas',
          icon: MessageSquare,
          roleRequired: 'operator',
          visible: true,
          conversationsMode: 'list',
        },
        {
          id: 'conversas',
          label: 'Funil',
          icon: Columns3,
          roleRequired: 'operator',
          visible: showKanban,
          conversationsMode: 'kanban',
        },
        {
          id: 'grupos',
          label: 'Grupos',
          icon: Users,
          badge: pendingGroupsCount > 0 ? pendingGroupsCount : undefined,
          badgeColor: 'bg-[#D97706] text-white',
          roleRequired: 'operator',
          visible: showGroups,
        },
        {
          id: 'agenda',
          label: 'Agenda',
          icon: CalendarDays,
          roleRequired: 'operator',
          visible: !isProductionMvp,
        },
      ],
    },
    {
      title: 'NEGÓCIO',
      items: [
        {
          id: 'resultados' as NavigationTab,
          label: 'Resultados',
          icon: Megaphone,
          roleRequired: 'admin' as OperatorRole,
          visible: showTrafficProof,
        },
      ],
    },
    {
      title: 'INTELIGÊNCIA',
      items: [
        {
          id: 'playbook' as NavigationTab,
          label: isProductionMvp ? 'IA & Conhecimento' : 'Inteligência',
          icon: Bot,
          roleRequired: 'admin' as OperatorRole,
          visible: true,
        },
        {
          id: 'simulador' as NavigationTab,
          label: 'Simulador',
          icon: Zap,
          roleRequired: 'admin' as OperatorRole,
          visible: !isProductionMvp && (showQaSimulator || isAdmin),
        },
      ],
    },
    {
      title: 'SISTEMA',
      items: [
        {
          id: 'configuracoes' as NavigationTab,
          label: 'Configurações',
          icon: Settings,
          roleRequired: 'owner' as OperatorRole,
          visible: true,
        },
      ],
    },
    {
      title: 'ADMINISTRAÇÃO',
      items: [
        {
          id: 'clientes' as NavigationTab,
          label: 'Empresas e subcontas',
          icon: Building2,
          roleRequired: 'owner' as OperatorRole,
          visible: true,
        },
      ],
    },
  ];

  const handleNavClick = (tabId: NavigationTab, conversationsMode?: 'list' | 'kanban' | 'wallboard') => {
    if (tabId === 'conversas' && conversationsMode) {
      onChangeConversationsMode?.(conversationsMode);
    }
    onChangeTab(tabId);
    setMobileDrawerOpen(false);
  };

  // Filter items for search palette with role-based visibility and submode mapping
  const allSearchableItems: Array<{
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
    section: string;
    roleRequired?: OperatorRole;
    conversationsMode?: 'list' | 'kanban' | 'wallboard';
    subTab?: string;
  }> = [
    { id: 'agora', label: 'Cockpit Agora (Prioridades)', icon: Flame, section: 'Operação', roleRequired: 'operator' },
    { id: 'conversas', label: 'Todas as Conversas (Lista 1:1)', icon: MessageSquare, section: 'Operação', roleRequired: 'operator', conversationsMode: 'list' },
    { id: 'conversas', label: 'Funil Kanban Comercial', icon: Columns3, section: 'Operação', roleRequired: 'operator', conversationsMode: 'kanban' },
    ...(!isProductionMvp ? [
      { id: 'agenda' as NavigationTab, label: 'Agenda & Horários Comerciais', icon: CalendarDays, section: 'Operação', roleRequired: 'operator' as OperatorRole },
      { id: 'anotacoes' as NavigationTab, label: 'Anotações & Scripts da Equipe', icon: BookOpen, section: 'Operação', roleRequired: 'operator' as OperatorRole },
    ] : []),
    ...(showGroups ? [{ id: 'grupos' as NavigationTab, label: 'Grupos WhatsApp', icon: Users, section: 'Operação', roleRequired: 'operator' as OperatorRole }] : []),
    { id: 'clientes' as NavigationTab, label: 'Clientes e Sub-contas', icon: Building2, section: 'Sistema', roleRequired: 'owner' as OperatorRole },
    ...(showTrafficProof ? [
      { id: 'resultados' as NavigationTab, label: 'Resultados dos anúncios', icon: PieChart, section: 'Negócio', subTab: 'traffic_proof', roleRequired: 'admin' as OperatorRole },
      { id: 'resultados' as NavigationTab, label: 'Conectar rastreamento Meta', icon: BarChart3, section: 'Gestão', subTab: 'tracking', roleRequired: 'owner' as OperatorRole },
    ] : []),
    { id: 'playbook' as NavigationTab, label: isProductionMvp ? 'IA & Conhecimento da empresa' : 'Sales AI Playbook & Inteligência', icon: Bot, section: 'Inteligência', roleRequired: 'admin' as OperatorRole },
    ...(!isProductionMvp && (showQaSimulator || isAdmin) ? [
      { id: 'simulador' as NavigationTab, label: 'Simulador de QA & Estresse', icon: Zap, section: 'Inteligência', roleRequired: 'admin' as OperatorRole },
    ] : []),
    { id: 'configuracoes', label: 'Configurações do Workspace', icon: Settings, section: 'Sistema', roleRequired: 'owner' },
  ];

  const searchableItems = allSearchableItems
    .filter((item) => hasRoleAccess(item.roleRequired))
    .filter((item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.section.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const renderNavContent = (isMobile = false) => {
    const collapsed = isMobile ? false : isCollapsed;

    return (
      <div className="flex flex-col h-full justify-between select-none">
        {/* Brand Header */}
        <div className="p-3 flex items-center justify-between border-b border-slate-800/80 shrink-0">
          {collapsed ? (
            <button
              onClick={toggleCollapse}
              className="w-10 h-10 mx-auto rounded-xl bg-[#001f18] border border-[#00a884]/40 flex items-center justify-center cursor-pointer group hover:border-[#00a884] transition-colors"
              title="Expandir barra lateral"
            >
              <Flame className="w-5 h-5 text-[#00A884] group-hover:scale-105 transition-transform" />
            </button>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#001f18] border border-[#00a884]/40 flex items-center justify-center shrink-0 shadow-sm shadow-[#00a884]/20">
                  <Flame className="w-4 h-4 text-[#00A884]" />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-black text-xs tracking-wider leading-none font-heading truncate">SOS Vendas</div>
                  <div className="text-[#00A884] text-[10px] font-bold tracking-wider leading-none mt-1 uppercase flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] animate-pulse"></span>
                    Operacional
                  </div>
                </div>
              </div>
              {!isMobile && (
                <button
                  onClick={toggleCollapse}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Recolher barra lateral"
                  aria-label="Recolher barra lateral"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Mobile Drawer Close Button */}
          {isMobile && (
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Sections List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => item.visible !== false && hasRoleAccess(item.roleRequired)
            );
            if (visibleItems.length === 0) return null;

            const isAdministration = section.title === 'ADMINISTRAÇÃO';
            const sectionExpanded = !isAdministration || administrationOpen || visibleItems.some((item) => item.id === activeTab);

            return (
              <div key={section.title} className="space-y-1">
                {!collapsed && isAdministration ? (
                  <button
                    type="button"
                    onClick={() => setAdministrationOpen((open) => !open)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold tracking-wider text-slate-400 hover:text-slate-200 uppercase font-heading flex items-center justify-between"
                    aria-expanded={sectionExpanded}
                  >
                    <span>{section.title}</span>
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${sectionExpanded ? 'rotate-90' : ''}`} />
                  </button>
                ) : !collapsed ? (
                              <div className="px-2.5 py-1.5 text-xs font-bold tracking-wider text-slate-400 uppercase font-heading">
                                {section.title}
                              </div>
                            ) : (
                              <div className="h-px bg-slate-800/80 my-2 mx-1" />
                            )}

                {sectionExpanded && visibleItems.map((item) => {
                  const isActive = activeTab === item.id && (
                    item.id !== 'conversas' || !item.conversationsMode || activeConversationsMode === item.conversationsMode
                  );
                  const Icon = item.icon;

                  return (
                    <React.Fragment key={`${item.id}-${item.conversationsMode || 'default'}`}>
                      <button
                        id={`sidebar-nav-${item.id}${item.conversationsMode ? `-${item.conversationsMode}` : ''}`}
                        onClick={() => handleNavClick(item.id, item.conversationsMode)}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        style={{
                          backgroundColor: isActive ? '#00A884' : 'transparent',
                          color: isActive ? '#FFFFFF' : '#CBD5E1',
                          border: 'none',
                          outline: 'none',
                          boxShadow: isActive ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                        }}
                        className={`w-full flex items-center transition-colors group relative cursor-pointer border-0 outline-none ${
                          collapsed
                            ? `w-10 h-10 mx-auto rounded-xl justify-center ${
                                isActive
                                  ? 'text-white'
                                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                              }`
                            : `gap-2 py-1.5 px-2.5 rounded-xl text-xs font-semibold ${
                                isActive
                                  ? 'text-white'
                                  : 'text-slate-300 hover:text-white hover:bg-white/5'
                              }`
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />

                        {!collapsed && (
                          <span className="flex-1 text-left truncate">{item.label}</span>
                        )}

                        {/* Role / Mode Tag */}
                        {!collapsed && item.tag && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#1E293B] text-[#94A3B8] border border-[#334155] font-semibold">
                            {item.tag}
                          </span>
                        )}

                        {/* Numeric Notification Badge */}
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                              item.badgeColor || 'bg-slate-700 text-slate-200'
                            } ${collapsed ? 'absolute -top-1 -right-1 ring-2 ring-[#0B132B]' : ''}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {/* Subcategories for Playbook / Inteligência */}
                      {item.id === 'playbook' && isActive && !collapsed && (
                        <div className="mt-1 pl-6 bg-slate-800/30 space-y-0.5">
                          {(isProductionMvp ? [
                            { id: 'profile', label: 'Perfil da Empresa' },
                            { id: 'knowledge', label: 'Base de Conhecimento' },
                            { id: 'catalog', label: 'Catálogo de Serviços' },
                            { id: 'diagnosis', label: 'Diagnóstico da operação' },
                          ] : [
                            { id: 'profile', label: 'Perfil da Empresa' },
                            { id: 'knowledge', label: 'Base de Conhecimento' },
                            { id: 'catalog', label: 'Catálogo de Serviços' },
                            { id: 'agent', label: 'Robôs Especialistas' },
                            { id: 'learning', label: 'Curadoria & Aprendizado' },
                            { id: 'thesis', label: 'Tese & Tom de Voz' },
                            { id: 'diagnosis', label: 'Diagnóstico Histórico' },
                          ]).map((sub) => {
                            const isSubActive = activeIntelligenceSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('playbook');
                                  onChangeIntelligenceSubTab?.(sub.id);
                                }}
                                className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  isSubActive ? 'bg-slate-800 text-[#00A884] font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                              >
                                {sub.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Subcategories for Grupos */}
                      {item.id === 'grupos' && isActive && !collapsed && (
                        <div className="mt-1 pl-6 bg-slate-800/30 space-y-0.5">
                          {[
                            { id: 'conversations', label: 'Conversas nos Grupos' },
                            { id: 'monitor', label: 'Monitor de Saúde & Alertas' },
                            { id: 'wallboard', label: 'Torre de Grupos (NOC)' },
                            { id: 'broadcast', label: 'Disparo de Avisos' },
                          ].map((sub) => {
                            const isSubActive = activeGroupSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('grupos');
                                  onChangeGroupSubTab?.(sub.id);
                                }}
                                className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  isSubActive ? 'bg-slate-800 text-[#00A884] font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                              >
                                {sub.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Subcategories for Gestão de Campanhas */}
                      {item.id === 'resultados' && isActive && !collapsed && (
                        <div className="mt-1 pl-6 bg-slate-800/30 space-y-0.5">
                          {(isProductionMvp ? [
                            { id: 'traffic_proof', label: 'Resultados dos anúncios' },
                            ...(isOwner ? [{ id: 'tracking', label: 'Conectar Meta Ads' }] : []),
                          ] : [
                            { id: 'analytics', label: 'Analytics & ROI' },
                            { id: 'traffic_proof', label: 'Anúncios & CTWA' },
                            { id: 'broadcast', label: 'Disparo em Massa (Broadcast)' },
                            { id: 'campaign_links', label: 'Links & QR Code' },
                            { id: 'waba_templates', label: 'Modelos WABA' },
                            { id: 'tracking', label: 'Traqueamento' },
                          ]).map((sub) => {
                            const isSubActive = activeResultsSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('resultados');
                                  onChangeResultsSubTab?.(sub.id as any);
                                }}
                                className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  isSubActive ? 'bg-slate-800 text-[#00A884] font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                              >
                                {sub.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Subcategories for Configurações */}
                      {item.id === 'configuracoes' && isActive && !collapsed && (
                        <div className="mt-1 pl-6 bg-slate-800/30 rounded-r-lg space-y-0.5">
                          {(isProductionMvp ? [
                            { id: 'canais', label: 'WhatsApp' },
                            { id: 'ia', label: 'Atendimento com IA' },
                            { id: 'sla', label: 'Tempo de resposta' },
                            { id: 'membros', label: 'Equipe' },
                          ] : [
                            { id: 'team', label: 'Equipe & Usuários' },
                            { id: 'api_webhooks', label: 'API & Webhooks' },
                            { id: 'channels', label: 'Canais de WhatsApp' },
                            { id: 'feature_flags', label: 'Parâmetros Globais' },
                            { id: 'engines', label: 'Infra & Modelos' },
                          ]).map((sub) => {
                            const isSubActive = activeSettingsSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('configuracoes');
                                  onChangeSettingsSubTab?.(sub.id);
                                }}
                                className={`w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  isSubActive ? 'bg-slate-800 text-[#00A884] font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                              >
                                {sub.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer: Grouped — Conexão & Conta */}
        <div className="p-2.5 border-t border-slate-800 space-y-3 shrink-0 bg-[#0B1120]">
          {/* Grupo 1: Conexão — Workspace + WhatsApp Status */}
          <div className="space-y-2">
            {/* 1. Workspace Switcher (Dark Mode) */}
            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              onSelectWorkspace={onSelectWorkspace}
              variant="dark"
              collapsed={collapsed}
              onNavigateToClients={() => onChangeTab('clientes')}
            />

            {/* 2. WhatsApp Status Pill */}
            {!collapsed ? (
              <div
                className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                  channelBadgeState === 'online'
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                    : channelBadgeState === 'configured'
                    ? 'bg-sky-950/40 text-sky-300 border-sky-800/60'
                    : channelBadgeState === 'paused' || channelBadgeState === 'scanning' || channelBadgeState === 'attention'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                    : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                }`}
                title={channelBadgeState === 'configured'
                  ? 'Meta configurado; a conexão ao Graph ainda não foi verificada neste indicador.'
                  : `WhatsApp: ${channelBadgeCopy} · (${channelEngine})`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-2 w-2 shrink-0">
                    {isChannelOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        channelBadgeState === 'online'
                          ? 'bg-emerald-400'
                          : channelBadgeState === 'configured'
                          ? 'bg-sky-400'
                          : channelBadgeState === 'paused' || channelBadgeState === 'attention'
                          ? 'bg-amber-400'
                          : channelBadgeState === 'scanning'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-rose-400'
                      }`}
                    />
                  </span>
                  <span className="truncate text-xs">
                    {channelBadgeCopy}
                  </span>
                </div>
                <span className="text-[9px] font-mono opacity-70 shrink-0">
                  {channelEngine}
                </span>
              </div>
            ) : (
              <div
                className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center bg-slate-800/60 border border-slate-700/60"
                title={channelBadgeState === 'configured'
                  ? 'Meta configurado; conexão ao Graph não verificada neste indicador.'
                  : `WhatsApp: ${channelBadgeCopy}`}
              >
                <span className="relative flex h-2.5 w-2.5">
                  {isChannelOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      channelBadgeState === 'online'
                        ? 'bg-emerald-400'
                        : channelBadgeState === 'configured'
                        ? 'bg-sky-400'
                        : channelBadgeState === 'paused' || channelBadgeState === 'attention' || channelBadgeState === 'scanning'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Divider forte entre grupos */}
          <div className="h-px bg-slate-800/80 my-1" />

          {/* Grupo 2: Conta — IA + Perfil + Ações */}
          <div className="space-y-2">
            {/* 3. AI Autonomy Toggle Switch — With mode indicator */}
            {!collapsed ? (
              <button
                type="button"
                onClick={toggleGlobalAiMode}
                disabled={aiModeLoading || !isOwner}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  globalAiMode === 'autonomous_24_7'
                    ? 'bg-[#00A884]/20 hover:bg-[#00A884]/30 text-emerald-300 border-[#00A884]/40'
                    : 'bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border-indigo-800/60'
                }`}
                title={aiModeError || (isOwner ? 'Alterar modo publicado da IA no backend' : 'Somente o proprietário altera o modo da IA')}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {globalAiMode === 'autonomous_24_7' ? (
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                  )}
                  <span className="truncate text-xs">
                    {aiModeLoading
                      ? 'Verificando IA...'
                      : aiModeError
                        ? 'IA não confirmada'
                        : globalAiMode === 'autonomous_24_7' ? 'IA 24/7 Ativa' : 'Modo Copiloto'}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  globalAiMode === 'autonomous_24_7'
                    ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'
                    : 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
                }`}>
                  {globalAiMode === 'autonomous_24_7' ? 'AUTO' : 'LEARN'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleGlobalAiMode}
                disabled={aiModeLoading || !isOwner}
                className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 transition-colors cursor-pointer"
                title={aiModeError || (isOwner ? `IA: ${globalAiMode === 'autonomous_24_7' ? '24/7 ativa no backend' : 'Copiloto supervisionado'}` : 'Somente o proprietário altera o modo da IA')}
              >
                {globalAiMode === 'autonomous_24_7' ? (
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                )}
              </button>
            )}

            {/* 4. User Profile & Role Indicator — Compact with visible role badge */}
            <div className="relative">
              <button
                onClick={() => {
                  if (salesOsRuntimeConfig.mode !== 'api') {
                    setRoleMenuOpen(!roleMenuOpen);
                  }
                }}
                className={`w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-800/80 transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${salesOsRuntimeConfig.mode === 'api' ? 'cursor-default' : 'cursor-pointer'}`}
                title={userEmail || (role === 'owner' ? 'Owner' : role === 'admin' ? 'Supervisor' : 'Operador')}
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs">
                  {role === 'owner' ? 'OW' : role === 'admin' ? 'AD' : 'OP'}
                </div>

                {!collapsed && (
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {userEmail || currentWorkspace.name}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 whitespace-nowrap ${
                        role === 'owner'
                          ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
                          : role === 'admin'
                          ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/50'
                          : 'bg-slate-500/30 text-slate-300 border-slate-500/50'
                      }`}>
                        {role === 'owner' ? 'OWNER' : role === 'admin' ? 'ADMIN' : 'OPERADOR'}
                      </span>
                    </div>
                  </div>
                )}
              </button>

              {/* Role Switcher Popover (Demo Mode Only — hidden by default, enable via localStorage or ?demo=true) */}
              {roleMenuOpen && salesOsRuntimeConfig.mode !== 'api' && typeof window !== 'undefined' && (localStorage.getItem('sos_show_demo_role_menu') === 'true' || new URLSearchParams(window.location.search).get('demo') === 'true') && (
                <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 text-xs space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150 text-slate-800">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading">
                    Papel no Workspace (Demo)
                  </div>

                  <button
                    onClick={() => {
                      onChangeRole('operator');
                      setRoleMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                      role === 'operator' ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">Operador</div>
                      <div className="text-[10px] text-slate-500 font-normal">Foco no atendimento diário</div>
                    </div>
                    {role === 'operator' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>

                  <button
                    onClick={() => {
                      onChangeRole('admin');
                      setRoleMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                      role === 'admin' ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">Supervisor / Gestor</div>
                      <div className="text-[10px] text-slate-500 font-normal">Monitoramento e Playbook</div>
                    </div>
                    {role === 'admin' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>

                  <button
                    onClick={() => {
                      onChangeRole('owner');
                      setRoleMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors ${
                      role === 'owner' ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">Owner (Dono)</div>
                      <div className="text-[10px] text-slate-500 font-normal">Acesso total & financeiro</div>
                    </div>
                    {role === 'owner' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </button>
                </div>
              )}
            </div>

            {/* 5. Footer Actions: Help & Logout — Icons Only, Right Aligned */}
            <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-800/80">
              <button
                onClick={() => setHelpModalOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                title="Atalhos: ⌘K"
                aria-label="Atalhos"
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              </button>

              {onSignOut && (
                <button
                  onClick={() => setLogoutModalOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Sair do Workspace"
                  aria-label="Sair do Workspace"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen h-dvh max-h-screen max-h-dvh w-screen overflow-hidden flex flex-col lg:flex-row bg-[#F5F7FA] text-[#101828]">
      {/* Desktop Persistent Sidebar (232px expanded / 72px collapsed) */}
      <aside
        id="app-persistent-sidebar"
        className={`hidden lg:flex flex-col h-full max-h-screen bg-[#0B132B] border-r border-slate-800/80 transition-all duration-200 ease-in-out shrink-0 z-30 overflow-hidden ${
          isCollapsed ? 'w-[72px]' : 'w-[232px]'
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer Navigation (Slide-over with Backdrop) */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de Navegação Principal"
        >
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative flex flex-col w-[280px] bg-[#0B132B] text-white h-full pt-safe pb-safe shadow-2xl z-10 animate-in slide-in-from-left duration-200 overflow-hidden">
            {renderNavContent(true)}
          </div>
        </div>
      )}

      {/* Main App Workspace */}
      <div className="flex-1 h-full max-h-screen max-h-dvh flex flex-col min-w-0 overflow-hidden">
        {/* Sleek Compact TopBar (Search + Notifications Only) */}
        <header
          id="app-topbar"
          className="h-12 lg:h-11 bg-white border-b border-slate-200 shrink-0 px-3 sm:px-4 pt-safe flex items-center justify-between z-20 shadow-2xs"
        >
          {/* Left: Mobile Brand & Drawer Trigger (Mobile Only) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-[#00A884]"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-[#001f18] border border-[#00a884]/40 flex items-center justify-center shrink-0">
                <Flame className="w-3.5 h-3.5 text-[#00A884]" />
              </div>
              <span className="font-heading font-black text-xs text-slate-900 tracking-tight truncate max-w-[110px]">
                {currentWorkspace.name}
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isChannelOnline
                    ? 'bg-emerald-500 animate-pulse'
                    : isOfficialChannelConfigured
                    ? 'bg-sky-500'
                    : 'bg-rose-500'
                }`}
                title={channelBadgeCopy}
              />
            </div>
          </div>

          {/* Center: Global Search / Command Palette Trigger (Ctrl+K) */}
          <div className="flex items-center flex-1 max-w-[400px] mx-2">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="w-full h-8 sm:h-9 flex items-center justify-between px-2.5 sm:px-3 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-xs text-slate-500 transition-colors shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-[#00A884]"
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">Buscar...</span>
              </div>
              <kbd className="hidden sm:inline-block text-[10px] font-mono bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-500 font-semibold shadow-2xs">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: Notifications Popover (SLA Alerts) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="h-9 w-9 p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#00A884]"
                title="Notificações e Alertas de SLA"
                aria-label="Ver notificações de SLA"
              >
                <Bell className="w-4 h-4" />
                {pendingPrioritiesCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 font-heading">Alertas de Atendimento</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                      {pendingPrioritiesCount} ativos
                    </span>
                  </div>

                  {pendingPrioritiesCount > 0 ? (
                    <div className="space-y-2">
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-[11px]">SLA de Resposta Crítico</p>
                          <p className="text-[10.5px] text-rose-800">
                            Há {pendingPrioritiesCount} conversas aguardando operador com prazo de resposta em risco.
                          </p>
                          <button
                            onClick={() => {
                              onChangeTab('agora');
                              setNotificationsOpen(false);
                            }}
                            className="mt-1 text-[10.5px] font-bold text-rose-700 hover:underline cursor-pointer"
                          >
                            Ir para o Cockpit Agora →
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-slate-500">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                      <p className="text-[11px] font-medium">Nenhum alerta crítico no momento</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Workspace Main Outlet */}
        <main
          id="app-main-outlet"
          className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative pb-[64px] lg:pb-0"
        >
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (High Touch Ergonomics) */}
        <nav
          id="app-mobile-bottom-nav"
          aria-label="Navegação mobile rápida"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B132B]/95 backdrop-blur-md border-t border-slate-800/90 px-1 py-1 pb-safe flex items-center justify-around shadow-2xl"
        >
          {/* 1. Agora (Cockpit Prioritário) */}
          <button
            onClick={() => handleNavClick('agora')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all relative ${
              activeTab === 'agora'
                ? 'text-[#00A884] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Flame className={`w-5 h-5 transition-transform ${activeTab === 'agora' ? 'scale-110 text-[#00A884]' : ''}`} />
              {pendingPrioritiesCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-[9px] font-extrabold px-1 rounded-full ring-2 ring-[#0B132B]">
                  {pendingPrioritiesCount > 9 ? '9+' : pendingPrioritiesCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">Agora</span>
            {activeTab === 'agora' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] absolute bottom-0.5" />
            )}
          </button>

          {/* 2. Conversas (Chat 1:1) */}
          <button
            onClick={() => handleNavClick('conversas', 'list')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all relative ${
              activeTab === 'conversas' && activeConversationsMode === 'list'
                ? 'text-[#00A884] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className={`w-5 h-5 transition-transform ${activeTab === 'conversas' && activeConversationsMode === 'list' ? 'scale-110 text-[#00A884]' : ''}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Conversas</span>
            {activeTab === 'conversas' && activeConversationsMode === 'list' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] absolute bottom-0.5" />
            )}
          </button>

          {/* 3. Funil Kanban */}
          {showKanban && (
            <button
              onClick={() => handleNavClick('conversas', 'kanban')}
              className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all relative ${
                activeTab === 'conversas' && activeConversationsMode === 'kanban'
                  ? 'text-[#00A884] font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns3 className={`w-5 h-5 transition-transform ${activeTab === 'conversas' && activeConversationsMode === 'kanban' ? 'scale-110 text-[#00A884]' : ''}`} />
              <span className="text-[10px] mt-0.5 tracking-tight">Funil</span>
              {activeTab === 'conversas' && activeConversationsMode === 'kanban' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] absolute bottom-0.5" />
              )}
            </button>
          )}

          {/* 4. IA / Conhecimento (ou Agenda) */}
          <button
            onClick={() => handleNavClick('playbook')}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all relative ${
              activeTab === 'playbook'
                ? 'text-[#00A884] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className={`w-5 h-5 transition-transform ${activeTab === 'playbook' ? 'scale-110 text-[#00A884]' : ''}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">IA</span>
            {activeTab === 'playbook' && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A884] absolute bottom-0.5" />
            )}
          </button>

          {/* 5. Menu Completo (Abre Drawer Lateral) */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 px-2 rounded-xl transition-all ${
              mobileDrawerOpen || activeTab === 'configuracoes' || activeTab === 'clientes' || activeTab === 'resultados'
                ? 'text-[#00A884] font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 tracking-tight">Mais</span>
          </button>
        </nav>
      </div>

      {/* Global Search / Command Palette Modal */}
      {searchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Busca global de rotas e contatos"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por módulo, tela ou comando..."
                className="flex-1 text-sm bg-transparent outline-none text-slate-900 placeholder:text-slate-400 font-sans"
              />
              <button
                onClick={() => setSearchModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded border border-slate-200"
              >
                ESC
              </button>
            </div>

            <div className="p-3 max-h-72 overflow-y-auto space-y-1 text-xs">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading">
                Telas e comandos
              </div>

              {searchableItems.length > 0 ? (
                searchableItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.id}-${item.conversationsMode || item.subTab || 'main'}`}
                      onClick={() => {
                        onChangeTab(item.id);
                        if (item.id === 'conversas' && item.conversationsMode) {
                          onChangeConversationsMode?.(item.conversationsMode);
                        }
                        if (item.subTab && item.id === 'resultados') {
                          onChangeResultsSubTab?.(item.subTab);
                        }
                        setSearchModalOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-slate-500" />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{item.section}</span>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Nenhum resultado encontrado para "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help & Key Shortcuts Modal */}
      {helpModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Atalhos e Guia Operacional"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#00A884]" />
                <h3 className="text-base font-bold text-slate-900 font-heading">
                  Atalhos & Guia Operacional
                </h3>
              </div>
              <button
                onClick={() => setHelpModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="Fechar modal de ajuda"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 font-sans">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Buscar / Command Palette</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">
                  Ctrl + K
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Atalhos de Macros Comerciais</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">
                  / (no composer)
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-700">Enviar Mensagem</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">
                  Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold text-slate-700">Quebra de Linha</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">
                  Shift + Enter
                </kbd>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setHelpModalOpen(false)}
                className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Simulation Modal */}
      {logoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar saída do sistema"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <LogOut className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 font-heading">
                Sair do Workspace
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                Você será desconectado da sessão atual de <strong>{currentWorkspace.name}</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setLogoutModalOpen(false)}
                className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                id="logout-confirm-btn"
                onClick={() => {
                  setLogoutModalOpen(false);
                  onSignOut?.();
                }}
                className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Confirmar Saída
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
