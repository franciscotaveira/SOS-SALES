import React from 'react';
import {
  CreditCard,
  Calendar,
  MapPin,
  Tag,
  LayoutGrid,
  Mic,
  Sparkles,
  ChevronRight,
  X,
  FileText,
  Zap,
} from 'lucide-react';

export interface QuickToolItem {
  id: string;
  category: 'financeiro' | 'agenda' | 'localizacao' | 'waba' | 'midia' | 'objecoes';
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  action: () => void;
}

interface QuickToolsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  tools: QuickToolItem[];
}

export const QuickToolsPopover: React.FC<QuickToolsPopoverProps> = ({
  isOpen,
  onClose,
  tools,
}) => {
  const [activeCategory, setActiveCategory] = React.useState<'todos' | 'financeiro' | 'agenda' | 'waba' | 'localizacao' | 'objecoes'>('todos');
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories = [
    { id: 'todos', label: 'Todas as Ferramentas' },
    { id: 'objecoes', label: '🛡️ Objeções' },
    { id: 'financeiro', label: '💰 Pagamento & Pix' },
    { id: 'agenda', label: '📅 Agenda & Horários' },
    { id: 'waba', label: '⚡ WABA Oficial' },
    { id: 'localizacao', label: '📍 Informações' },
  ] as const;

  const filteredTools = tools.filter((tool) => {
    if (activeCategory === 'todos') return true;
    return tool.category === activeCategory;
  });

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full mb-2 left-0 z-50 w-80 sm:w-96 rounded-2xl border border-slate-300 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header da Caixinha de Atalhos */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-3.5 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <Zap size={14} className="text-emerald-400" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider font-heading">Caixa de Ações Rápidas</h4>
            <p className="text-[10px] text-slate-300 font-medium">Ferramentas comerciais e atalhos de envio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      {/* Seletor de Categorias */}
      <div className="flex items-center gap-1 overflow-x-auto p-1.5 bg-slate-100/80 border-b border-slate-200 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap transition cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Lista de Ferramentas / Ações */}
      <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
        {filteredTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              tool.action();
              onClose();
            }}
            className="w-full flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50/60 hover:border-emerald-300 text-left transition group cursor-pointer shadow-2xs"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-emerald-100 group-hover:text-emerald-700 transition shrink-0 mt-0.5">
                {tool.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900 transition truncate">
                    {tool.label}
                  </span>
                  {tool.badge && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-mono text-[9px] font-bold shrink-0">
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 line-clamp-1 mt-0.5 leading-snug">
                  {tool.description}
                </p>
              </div>
            </div>
            <ChevronRight size={14} className="text-slate-400 group-hover:text-emerald-600 transition shrink-0 ml-1" />
          </button>
        ))}
      </div>

      {/* Rodapé Informativo */}
      <div className="p-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span>💡 Dica: Você também pode digitar <strong>/pix</strong> ou <strong>/horarios</strong></span>
        <span className="font-mono text-slate-400">ESC fecha</span>
      </div>
    </div>
  );
};
