import React from 'react';
import { Workspace, OperatorRole, Journey } from '../../types/cockpit';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
  Flame,
  MessageSquare,
  BarChart3,
  Settings,
  Shield,
  UserCheck,
  Zap,
  Menu,
  X,
  Play,
  RotateCcw,
  AlertTriangle,
  Users,
} from 'lucide-react';

export type NavigationTab = 'agora' | 'conversas' | 'grupos' | 'resultados' | 'configuracoes';

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
  onSimulateIncomingLeadMessage,
  onSimulateNetworkErrorToggle,
  isNetworkErrorForced,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showSimMenu, setShowSimMenu] = React.useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-[#e2e8f0] shrink-0 px-3 sm:px-5 flex items-center justify-between sticky top-0 z-40">
        {/* Left: Brand + Workspace Switcher */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            {/* SOS Sales Brand Emblem */}
            <div className="w-8 h-8 rounded-lg bg-[#00a884] text-white flex items-center justify-center font-black text-xs shadow-xs tracking-tighter">
              SOS
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-sm leading-tight text-[#111b21] tracking-tight flex items-center gap-1.5">
                <span className="tracking-wide">SOS SALES</span>
                <span className="text-[9.5px] font-semibold bg-[#e7f8e8] text-[#00a884] px-1.5 py-0.2 rounded border border-[#00a884]/20">
                  Sales OS
                </span>
              </div>
              <div className="text-[10px] text-[#667781] leading-none">
                Destravar vendas & Gestão de grupos
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          <WorkspaceSwitcher
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            onSelectWorkspace={onSelectWorkspace}
          />
        </div>

        {/* Center: Primary Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-xl border border-[#e2e8f0]">
          {/* 1. Agora (Prioridades & Atendimento) */}
          <button
            id="nav-agora-btn"
            onClick={() => onChangeTab('agora')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'agora'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-slate-200/50'
            }`}
          >
            <Flame className={`w-3.5 h-3.5 ${activeTab === 'agora' ? 'text-[#00a884]' : 'text-slate-500'}`} />
            <span>Agora</span>
            {pendingPrioritiesCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
                {pendingPrioritiesCount}
              </span>
            )}
          </button>

          {/* 2. Conversas 1:1 */}
          <button
            id="nav-conversas-btn"
            onClick={() => onChangeTab('conversas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'conversas'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-slate-200/50'
            }`}
          >
            <MessageSquare className={`w-3.5 h-3.5 ${activeTab === 'conversas' ? 'text-[#00a884]' : 'text-slate-500'}`} />
            <span>Conversas</span>
          </button>

          {/* 3. Grupos WhatsApp (Agência & Clientes) */}
          <button
            id="nav-grupos-btn"
            onClick={() => onChangeTab('grupos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'grupos'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-slate-200/50'
            }`}
          >
            <Users className={`w-3.5 h-3.5 ${activeTab === 'grupos' ? 'text-[#00a884]' : 'text-slate-500'}`} />
            <span>Grupos WhatsApp</span>
            {pendingGroupsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                {pendingGroupsCount}
              </span>
            )}
          </button>

          {/* 4. Resultados & Prova de Tráfego */}
          <button
            id="nav-resultados-btn"
            onClick={() => onChangeTab('resultados')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'resultados'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-slate-200/50'
            }`}
          >
            <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'resultados' ? 'text-[#00a884]' : 'text-slate-500'}`} />
            <span>Resultados</span>
          </button>

          {/* 5. Configurações & WABA/WAHA */}
          <button
            id="nav-config-btn"
            onClick={() => onChangeTab('configuracoes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'configuracoes'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21] hover:bg-slate-200/50'
            }`}
          >
            <Settings className={`w-3.5 h-3.5 ${activeTab === 'configuracoes' ? 'text-[#00a884]' : 'text-slate-500'}`} />
            <span>WABA / WAHA</span>
          </button>
        </nav>

        {/* Right: Role Switcher + Simulator Helpers */}
        <div className="flex items-center gap-2">
          {/* Simulator quick trigger button */}
          <div className="relative">
            <button
              id="simulator-tools-btn"
              onClick={() => setShowSimMenu(!showSimMenu)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              title="Ferramentas de Simulação & Testes"
            >
              <Zap className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden lg:inline">Simulador QA</span>
            </button>

            {showSimMenu && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 text-xs space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-slate-400 px-2 pt-1">
                  Cenários de Teste (Golden Path)
                </div>
                {onSimulateIncomingLeadMessage && (
                  <button
                    onClick={() => {
                      onSimulateIncomingLeadMessage();
                      setShowSimMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-purple-50 text-slate-700 hover:text-purple-900 flex items-center gap-2"
                  >
                    <Play className="w-3.5 h-3.5 text-purple-600" />
                    <span>Simular nova mensagem do Lead</span>
                  </button>
                )}
                {onSimulateNetworkErrorToggle && (
                  <button
                    onClick={() => {
                      onSimulateNetworkErrorToggle();
                      setShowSimMenu(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-rose-50 text-slate-700 hover:text-rose-900 flex items-center gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>{isNetworkErrorForced ? 'Desativar falha de rede' : 'Forçar erro no próximo envio'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Role selector */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => onChangeRole('operator')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                role === 'operator'
                  ? 'bg-[#00a884] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3 h-3" />
              <span className="hidden sm:inline">Operador</span>
            </button>
            <button
              onClick={() => onChangeRole('viewer')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                role === 'viewer'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span className="hidden sm:inline">Viewer</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Dropdown Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 p-3 space-y-1 z-30">
          <button
            onClick={() => {
              onChangeTab('agora');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold ${
              activeTab === 'agora' ? 'bg-[#e7f8e8] text-[#00a884]' : 'text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Flame className="w-4 h-4" /> Agora
            </span>
            {pendingPrioritiesCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px]">
                {pendingPrioritiesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onChangeTab('conversas');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold ${
              activeTab === 'conversas' ? 'bg-[#e7f8e8] text-[#00a884]' : 'text-slate-700'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Conversas
          </button>

          <button
            onClick={() => {
              onChangeTab('grupos');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold ${
              activeTab === 'grupos' ? 'bg-[#e7f8e8] text-[#00a884]' : 'text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Grupos WhatsApp
            </span>
            {pendingGroupsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                {pendingGroupsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              onChangeTab('resultados');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold ${
              activeTab === 'resultados' ? 'bg-[#e7f8e8] text-[#00a884]' : 'text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Resultados
          </button>

          <button
            onClick={() => {
              onChangeTab('configuracoes');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-bold ${
              activeTab === 'configuracoes' ? 'bg-[#e7f8e8] text-[#00a884]' : 'text-slate-700'
            }`}
          >
            <Settings className="w-4 h-4" /> WABA / WAHA
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
};
