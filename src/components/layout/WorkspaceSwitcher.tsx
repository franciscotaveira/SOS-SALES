import React from 'react';
import { Workspace } from '../../types/cockpit';
import { Building2, ChevronDown, Check } from 'lucide-react';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (workspace: Workspace) => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
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

  return (
    <div className="relative" ref={dropdownRef} id="workspace-switcher-container">
      <button
        id="workspace-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-xs"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="w-6 h-6 rounded-md bg-emerald-600/10 text-emerald-700 flex items-center justify-center font-bold text-xs">
          <Building2 className="w-3.5 h-3.5" />
        </div>
        <span className="truncate max-w-[170px] text-left">{currentWorkspace.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div
          id="workspace-dropdown-menu"
          className="absolute left-0 mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Unidades / Negócios
          </div>
          {workspaces.map((ws) => {
            const isSelected = ws.id === currentWorkspace.id;
            return (
              <button
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${
                  isSelected ? 'bg-emerald-50 text-emerald-900 font-medium' : 'text-slate-700'
                }`}
              >
                <div
                  className={`w-7 h-7 mt-0.5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                    isSelected ? 'bg-[#00A884] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ws.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                    {ws.name}
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 inline" />}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{ws.tagline}</div>
                </div>
              </button>
            );
          })}
          <div className="px-3 py-2 mt-1 border-t border-slate-100 text-[11px] text-slate-400">
            {currentWorkspace.channels.length} canais conectados · {currentWorkspace.activeOperatorCount} operadores
          </div>
        </div>
      )}
    </div>
  );
};
