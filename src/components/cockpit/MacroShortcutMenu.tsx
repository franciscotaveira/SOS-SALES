import React from 'react';
import { Journey, MacroShortcut } from '../../types/cockpit';
import { Zap, Tag, Clock, MapPin, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';

interface MacroShortcutMenuProps {
  journey: Journey;
  isOpen: boolean;
  onSelect: (interpolatedText: string) => void;
  onClose: () => void;
  filterQuery?: string;
}

export const MACRO_SHORTCUTS: MacroShortcut[] = [
  {
    id: 'macro-oferta',
    trigger: '/oferta',
    label: 'Validar Oferta do Anúncio',
    category: 'informacao',
    description: 'Confirma a oferta da campanha Meta Ads sem reiniciar a conversa',
    template: 'Confirmando a oferta do anúncio: {{oferta}}! A condição especial continua 100% garantida para você.',
  },
  {
    id: 'macro-endereco',
    trigger: '/endereco',
    label: 'Endereço & Acesso',
    category: 'informacao',
    description: 'Localização, pontos de referência e estacionamento',
    template: 'Posso confirmar o endereço e as condições de acesso cadastradas para este workspace antes de enviar.',
  },
  {
    id: 'macro-garantia',
    trigger: '/garantia',
    label: 'Garantia & Confiança',
    category: 'informacao',
    description: 'Reforço de qualidade e procedência de materiais/serviços',
    template: 'Você conta com nossa garantia de satisfação e atendimento personalizado com produtos originais de primeira linha.',
  },
  {
    id: 'macro-retomada',
    trigger: '/retomada',
    label: 'Retomada de Follow-up',
    category: 'retomada',
    description: 'Retoma o contato preservando o último combinado',
    template: 'Olá, {{nome}}! Passando para dar continuidade ao que combinamos sobre seu agendamento. Conseguiu dar uma olhada na sua disponibilidade?',
  },
];

export const MacroShortcutMenu: React.FC<MacroShortcutMenuProps> = ({
  journey,
  isOpen,
  onSelect,
  onClose,
  filterQuery = '',
}) => {
  if (!isOpen) return null;

  const leadFirstName = journey.leadName.split(' ')[0] || 'Cliente';
  const offerText = journey.acquisition.referralOffer || 'condição promocional de atendimento';
  const campaignName = journey.acquisition.campaignName || 'Meta Ads';

  const interpolate = (tpl: string): string => {
    return tpl
      .replace(/{{nome}}/g, leadFirstName)
      .replace(/{{oferta}}/g, offerText)
      .replace(/{{campanha}}/g, campaignName);
  };

  const filtered = MACRO_SHORTCUTS.filter((m) => {
    const q = filterQuery.toLowerCase().replace('/', '').trim();
    if (!q) return true;
    return (
      m.trigger.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q)
    );
  });

  const getIcon = (cat: string) => {
    switch (cat) {
      case 'fechamento':
        return <CreditCard className="w-3.5 h-3.5 text-emerald-600" />;
      case 'agendamento':
        return <Clock className="w-3.5 h-3.5 text-blue-600" />;
      case 'retomada':
        return <Sparkles className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Tag className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  return (
    <div
      id="macro-shortcuts-popup"
      className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-40 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-100"
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 text-[11px] font-bold text-slate-500 mb-1">
        <span className="flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          Respostas Rápidas & Macros (Digite / para filtrar)
        </span>
        <span className="text-[10px] text-slate-400 font-normal">Esc para fechar</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-4 text-xs text-slate-500">
          Nenhum atalho encontrado para "{filterQuery}"
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((macro) => (
            <button
              key={macro.id}
              onClick={() => {
                onSelect(interpolate(macro.template));
                onClose();
              }}
              className="w-full text-left p-2 rounded-lg hover:bg-blue-50 transition-colors flex items-start justify-between gap-2 group"
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className="mt-0.5">{getIcon(macro.category)}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                      {macro.label}
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1 rounded">
                      {macro.trigger}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{macro.description}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                Inserir ↵
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
