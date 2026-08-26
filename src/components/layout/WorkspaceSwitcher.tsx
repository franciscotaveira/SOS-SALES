import React from 'react';
import { Workspace } from '../../types/cockpit';
import { Building2, ChevronDown, Check, Plus } from 'lucide-react';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (workspace: Workspace) => void;
  variant?: 'dark' | 'light';
  collapsed?: boolean;
  onNavigateToClients?: () => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  variant = 'light',
  collapsed = false,
  onNavigateToClients,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isDark = variant === 'dark';

  return (
    <div className="relative" ref={dropdownRef} id="workspace-switcher-container">
      <button
        id="workspace-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        title={currentWorkspace.name}
        className={`flex items-center gap-2 rounded-xl transition-all ${
          collapsed
            ? 'w-10 h-10 p-0 justify-center'
            : isDark
            ? 'w-full px-2.5 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-white'
            : 'px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-800 shadow-xs'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
            isDark ? 'bg-[#00A884]/20 text-[#00A884]' : 'bg-emerald-600/10 text-emerald-700'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <span className="block truncate text-xs font-bold text-slate-200">{currentWorkspace.name}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </>
        )}
      </button>

      {isOpen && (
        <div
          id="workspace-dropdown-menu"
          className={`absolute left-0 ${
            isDark ? 'bottom-full mb-2 bg-[#0F172A] border-slate-700 text-white shadow-2xl' : 'mt-1.5 bg-white border-slate-200 text-slate-800 shadow-xl'
          } w-72 rounded-2xl border p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150`}
        >
          <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
            Unidades / Negócios
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {workspaces.map((ws) => {
              const isSelected = ws.id === currentWorkspace.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                    isSelected
                      ? isDark
                        ? 'bg-[#00A884]/20 text-white border border-[#00A884]/40 font-bold'
                        : 'bg-emerald-50 text-emerald-900 font-medium'
                      : isDark
                      ? 'text-slate-300 hover:bg-slate-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? 'bg-[#00A884] text-white' : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ws.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate flex items-center justify-between">
                      <span>{ws.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#00A884] inline shrink-0" />}
                    </div>
                    <div className={`text-[10.5px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{ws.tagline}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className={`px-3 py-2 mt-1 border-t ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'} text-[10px] flex items-center justify-between`}>
            <span>{currentWorkspace.channels.length} canais · {currentWorkspace.activeOperatorCount} operadores</span>
            {onNavigateToClients && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToClients();
                }}
                className="text-[#00A884] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Gerenciar Clientes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
