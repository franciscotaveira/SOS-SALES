import React from 'react';
import { Workspace, OperatorRole } from '../../types/cockpit';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useFeatureFlags } from '../../contexts/FeatureFlagContext';
import { salesOsRuntimeConfig } from '../../config/runtime';
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
  ArrowRight,
  Lock,
  PieChart,
} from 'lucide-react';

export type NavigationTab =
  | 'agora'
  | 'conversas'
  | 'kanban'
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
  activeSettingsSubTab = 'engines',
  onChangeSettingsSubTab,
  activeGroupSubTab = 'conversations',
  onChangeGroupSubTab,
  children,
}) => {
  const { isFeatureEnabled } = useFeatureFlags();

  // Persistent sidebar state saved in localStorage
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
  const showGroups = isFeatureEnabled('agency_groups');
  const showTrafficProof = isFeatureEnabled('traffic_proof');
  const showQaSimulator = isFeatureEnabled('qa_simulator');

  // RBAC permissions based on role
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || role === 'owner';

  // Primary channel health
  const primaryChannel = currentWorkspace.channels[0];
  const isChannelOnline = primaryChannel?.health === 'healthy';
  const isChannelPaused = primaryChannel?.health === 'paused';
  const channelEngine = (primaryChannel as any)?.engine ? (primaryChannel as any).engine.toUpperCase() : 'WABA';

  // Domain Navigation Group Definitions
  interface NavItem {
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
    roleRequired?: 'owner' | 'admin' | 'operator';
    visible?: boolean;
    tag?: string;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  const navSections: NavSection[] = [
    {
      title: 'OPERAÇÃO',
      items: [
        {
          id: 'agora',
          label: 'Agora',
          icon: Flame,
          badge: pendingPrioritiesCount > 0 ? pendingPrioritiesCount : undefined,
          badgeColor: 'bg-rose-500 text-white',
          visible: true,
        },
        {
          id: 'conversas',
          label: 'Conversas',
          icon: MessageSquare,
          visible: true,
        },
        {
          id: 'kanban',
          label: 'Funil',
          icon: Columns3,
          visible: showKanban,
        },
      ],
    },
    {
      title: 'GESTÃO',
      items: [
        {
          id: 'analytics',
          label: 'Analytics & ROI',
          icon: PieChart,
          visible: true,
          tag: 'Novo',
        },
        {
          id: 'resultados',
          label: 'Resultados',
          icon: BarChart3,
          visible: showTrafficProof,
          tag: !isOwner ? 'ROAS' : undefined,
        },
        {
          id: 'grupos',
          label: 'Grupos',
          icon: Users,
          badge: pendingGroupsCount > 0 ? pendingGroupsCount : undefined,
          badgeColor: 'bg-amber-500 text-white',
          visible: showGroups,
        },
      ],
    },
    {
      title: 'INTELIGÊNCIA',
      items: [
        {
          id: 'playbook',
          label: 'Inteligência',
          icon: Bot,
          visible: true,
          tag: !isAdmin ? 'Leitura' : undefined,
        },
        {
          id: 'simulador',
          label: 'Simulador',
          icon: Zap,
          visible: salesOsRuntimeConfig.mode !== 'api' && (showQaSimulator || isAdmin),
        },
      ],
    },
    {
      title: 'SISTEMA',
      items: [
        {
          id: 'configuracoes',
          label: 'Configurações',
          icon: Settings,
          visible: true,
        },
      ],
    },
  ];

  const handleNavClick = (tabId: NavigationTab) => {
    onChangeTab(tabId);
    setMobileDrawerOpen(false);
  };

  // Filter items for search palette
  const searchableItems = [
    { id: 'agora' as NavigationTab, label: 'Cockpit Agora (Prioridades)', icon: Flame, section: 'Operação' },
    { id: 'conversas' as NavigationTab, label: 'Todas as Conversas 1:1', icon: MessageSquare, section: 'Operação' },
    { id: 'kanban' as NavigationTab, label: 'Funil Kanban Comercial', icon: Columns3, section: 'Operação' },
    { id: 'analytics' as NavigationTab, label: 'Analytics & ROI da IA', icon: PieChart, section: 'Gestão' },
    { id: 'resultados' as NavigationTab, label: 'Resultados & Proof of Traffic', icon: BarChart3, section: 'Gestão' },
    { id: 'grupos' as NavigationTab, label: 'Grupos', icon: Users, section: 'Gestão' },
    { id: 'playbook' as NavigationTab, label: 'Sales AI Playbook & Políticas', icon: Bot, section: 'Inteligência' },
    { id: 'simulador' as NavigationTab, label: 'Simulador de QA & Estresse', icon: Zap, section: 'Inteligência' },
    { id: 'configuracoes' as NavigationTab, label: 'Configurações do Workspace', icon: Settings, section: 'Sistema' },
  ].filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.section.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderNavContent = (isMobile = false) => {
    const collapsed = isMobile ? false : isCollapsed;

    return (
      <div className="flex flex-col h-full justify-between select-none">
        {/* Brand Header */}
        <div className="p-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#00A884] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs tracking-tighter">
              SOS
            </div>
            {!collapsed && (
              <div className="min-w-0 transition-opacity duration-200">
                <div className="font-bold text-sm leading-tight text-white tracking-tight flex items-center gap-1.5 font-heading">
                  <span className="truncate">SOS SALES</span>
                  <span className="text-[9px] font-bold bg-[#00A884]/20 text-[#00A884] px-1 py-0.2 rounded border border-[#00A884]/30">
                    OS
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate font-sans">
                  Destravar vendas & grupos
                </div>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          {!isMobile && (
            <button
              onClick={toggleCollapse}
              className="hidden lg:flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-[#00A884]"
              title={collapsed ? 'Expandir barra lateral (232px)' : 'Recolher barra lateral (72px)'}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Mobile Drawer Close Button */}
          {isMobile && (
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Sections List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section) => {
            const visibleItems = section.items.filter((item) => item.visible !== false);
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-1">
                {!collapsed ? (
                  <div className="px-2.5 py-1 text-[9.5px] font-bold tracking-wider text-slate-400 uppercase font-heading">
                    {section.title}
                  </div>
                ) : (
                  <div className="h-px bg-slate-800 my-2 mx-1" />
                )}

                {visibleItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <React.Fragment key={item.id}>
                      <button
                        id={`sidebar-nav-${item.id}`}
                        onClick={() => handleNavClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors group relative focus-visible:ring-2 focus-visible:ring-[#00A884] ${
                          isActive
                            ? 'bg-[#00A884] text-white shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
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
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {item.tag}
                          </span>
                        )}

                        {/* Numeric Notification Badge */}
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                              item.badgeColor || 'bg-slate-700 text-slate-200'
                            } ${collapsed ? 'absolute -top-1 -right-1 ring-2 ring-[#0F172A]' : ''}`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {/* Subcategories for Playbook / Inteligencia */}
                      {item.id === 'playbook' && isActive && !collapsed && (
                        <div className="ml-4 mt-1 pl-2 border-l border-slate-800 space-y-1">
                          {[
                            { id: 'knowledge', label: 'Banco de Inteligência' },
                            { id: 'catalog', label: 'Catálogo & Serviços' },
                            { id: 'dataflow', label: 'De Onde Vem ➔ Para Onde' },
                            { id: 'learning', label: 'Aprendizado Contínuo' },
                            { id: 'company', label: 'Empresa & WABA' },
                            { id: 'agent', label: 'Persona & Alçadas' },
                            { id: 'benchmark', label: 'Meta AI Benchmark' },
                          ].map((sub) => {
                            const isSubActive = activeIntelligenceSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('playbook');
                                  onChangeIntelligenceSubTab?.(sub.id);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
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
                        <div className="ml-4 mt-1 pl-2 border-l border-slate-800 space-y-1">
                          {[
                            { id: 'conversations', label: 'Conversas nos Grupos' },
                            { id: 'monitor', label: 'Monitor de Saúde & Alertas' },
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
                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
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
                        <div className="ml-4 mt-1 pl-2 border-l border-slate-800 space-y-1">
                          {[
                            { id: 'engines', label: 'Infraestrutura & Transição' },
                            { id: 'ai_thesis', label: 'IA Vendedora 24/7' },
                            { id: 'channels', label: 'Canais' },
                            { id: 'ads_tracking', label: 'Atribuição & Ads' },
                            { id: 'governance', label: 'Governança & SLA' },
                            { id: 'feature_flags', label: 'Feature Flags & Módulos' },
                          ].map((sub) => {
                            const isSubActive = activeSettingsSubTab === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeTab('configuracoes');
                                  onChangeSettingsSubTab?.(sub.id);
                                }}
                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
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

        {/* Sidebar Footer: Workspace, Profile, Shortcuts, Logout */}
        <div className="p-2 border-t border-slate-800 space-y-1.5 shrink-0 bg-[#0B1120]">
          {/* Workspace Active Indicator */}
          {!collapsed && (
            <div className="px-2 py-1.5 bg-slate-800/60 rounded-lg flex items-center justify-between text-[11px] mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2">
                  {isChannelOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isChannelPaused
                        ? 'bg-amber-500'
                        : isChannelOnline
                        ? 'bg-emerald-500'
                        : 'bg-rose-500'
                    }`}
                  />
                </span>
                <span className="text-slate-200 font-medium truncate">
                  {currentWorkspace.name}
                </span>
              </div>
              <span className="text-[9.5px] text-slate-400 font-mono">
                {channelEngine}
              </span>
            </div>
          )}

          {/* User Profile & Role Indicator */}
          <div className="relative">
            <button
              onClick={() => {
                if (salesOsRuntimeConfig.mode !== 'api') {
                  setRoleMenuOpen(!roleMenuOpen);
                }
              }}
              className={`w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors focus-visible:ring-2 focus-visible:ring-[#00A884] ${
                collapsed ? 'justify-center' : ''
              } ${salesOsRuntimeConfig.mode === 'api' ? 'cursor-default' : ''}`}
              title={
                salesOsRuntimeConfig.mode === 'api'
                  ? 'Papel governado pela sessão autenticada do Supabase'
                  : 'Alternar Papel de Acesso (Modo Demo)'
              }
            >
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
                {role === 'owner' ? 'OW' : role === 'admin' ? 'AD' : 'OP'}
              </div>

              {!collapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1">
                    <span>Você</span>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-indigo-900/60 text-indigo-300 uppercase">
                      {role === 'owner' ? 'Owner' : role === 'admin' ? 'Supervisor' : 'Operador'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {currentWorkspace.name}
                  </div>
                </div>
              )}
            </button>

            {/* Role Switcher Popover (Demo Mode Only) */}
            {roleMenuOpen && salesOsRuntimeConfig.mode !== 'api' && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 text-xs space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
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

          {/* Footer Actions: Help & Logout */}
          <div className="flex items-center gap-1 pt-1">
            <button
              onClick={() => setHelpModalOpen(true)}
              className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-[#00A884] ${
                collapsed ? 'justify-center' : ''
              }`}
              title="Central de Ajuda & Atalhos"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && <span>Ajuda & Atalhos</span>}
            </button>

            {!collapsed && (
              <button
                onClick={() => setLogoutModalOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Sair do Workspace"
                aria-label="Sair do Workspace"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden flex bg-[#F5F7FA] text-[#101828]">
      {/* Desktop Persistent Sidebar (232px expanded / 72px collapsed) */}
      <aside
        id="app-persistent-sidebar"
        className={`hidden lg:flex flex-col h-full max-h-screen bg-[#0F172A] border-r border-slate-800 transition-all duration-200 ease-in-out shrink-0 z-30 overflow-hidden ${
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
          <div className="relative flex flex-col w-[260px] bg-[#0F172A] text-white h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200 overflow-hidden">
            {renderNavContent(true)}
          </div>
        </div>
      )}

      {/* Main App Workspace */}
      <div className="flex-1 h-full max-h-screen flex flex-col min-w-0 overflow-hidden">
        {/* Simplified Clean TopBar */}
        <header
          id="app-topbar"
          className="h-13 bg-white border-b border-slate-200 shrink-0 px-3 sm:px-5 flex items-center justify-between z-20 shadow-2xs"
        >
          {/* Left: Mobile Drawer Trigger + Workspace Switcher */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#00A884]"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="w-5 h-5" />
            </button>

            <WorkspaceSwitcher
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              onSelectWorkspace={onSelectWorkspace}
            />
          </div>

          {/* Center: Global Search / Command Palette Trigger (Ctrl+K) */}
          <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
            <button
              onClick={() => setSearchModalOpen(true)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs text-slate-500 transition-colors shadow-2xs focus-visible:ring-2 focus-visible:ring-[#00A884]"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>Buscar conversas, grupos...</span>
              </div>
              <kbd className="text-[10px] font-mono bg-white border border-slate-300 rounded px-1.5 py-0.2 text-slate-500 font-semibold shadow-2xs">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: WhatsApp Channel Health, Notifications Popover, Role Badge */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* WhatsApp Channel Health Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isChannelPaused
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : isChannelOnline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
              title={`Canal: ${primaryChannel?.name || 'WhatsApp'} (${channelEngine}) · Latência: 42ms`}
            >
              <span className="relative flex h-2 w-2">
                {isChannelOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isChannelPaused
                      ? 'bg-amber-500'
                      : isChannelOnline
                      ? 'bg-emerald-500'
                      : 'bg-rose-500'
                  }`}
                />
              </span>
              <span className="hidden sm:inline">
                {isChannelPaused ? 'Pausado' : isChannelOnline ? 'WhatsApp Online' : 'Desconectado'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                (42ms)
              </span>
            </div>

            {/* Notifications Popover */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#00A884]"
                title="Notificações e Alertas de SLA"
                aria-label="Ver notificações de SLA"
              >
                <Bell className="w-4 h-4" />
                {pendingPrioritiesCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 font-heading">Alertas de Atendimento</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
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
                            className="mt-1 text-[10.5px] font-bold text-rose-700 hover:underline"
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

            {/* Role Switcher Pill in Topbar */}
            <div className="relative">
              <button
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-[#00A884]"
                title="Alternar Papel de Acesso"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span className="capitalize">{role === 'owner' ? 'Owner' : role === 'admin' ? 'Supervisor' : 'Operador'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Workspace Main Outlet */}
        <main id="app-main-outlet" className="flex-1 min-h-0 h-[calc(100vh-3.25rem)] w-full flex flex-col overflow-hidden relative">
          {children}
        </main>
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
                placeholder="Buscar por módulo, tela, lead ou comando..."
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
                Navegação Rápida
              </div>

              {searchableItems.length > 0 ? (
                searchableItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onChangeTab(item.id);
                        setSearchModalOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700 font-medium transition-colors"
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
                onClick={() => {
                  setLogoutModalOpen(false);
                }}
                className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
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
