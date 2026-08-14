import React from 'react';
import { Journey, MemoryNote } from '../../types/cockpit';
import {
  Brain,
  Sparkles,
  Plus,
  Pin,
  Check,
  Trash2,
  Tag,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface MemoryNotesPanelProps {
  journey: Journey;
  onUpdateJourney?: (updated: Journey) => void;
}

export const MemoryNotesPanel: React.FC<MemoryNotesPanelProps> = ({
  journey,
  onUpdateJourney,
}) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [isAddingNote, setIsAddingNote] = React.useState(false);
  const [newContent, setNewContent] = React.useState('');
  const [newCategory, setNewCategory] = React.useState<MemoryNote['category']>('preference');

  // Default initial memory notes if not defined yet
  const defaultNotes: MemoryNote[] = React.useMemo(() => {
    if (journey.memoryNotes && journey.memoryNotes.length > 0) {
      return journey.memoryNotes;
    }
    // Generated based on journey context
    const leadFirstName = journey.leadName.split(' ')[0] || 'Cliente';
    return [
      {
        id: `mem-${journey.id}-1`,
        category: 'preference',
        content: `Prefere atendimento rápido pelo WhatsApp e horários no período da tarde (14h-17h).`,
        learnedAt: 'Hoje às 11:32',
        source: 'ai_extracted',
        confidence: 'high',
        isPinned: true,
      },
      {
        id: `mem-${journey.id}-2`,
        category: 'budget',
        content: `Veio atraído pela oferta de entrada (${journey.acquisition.referralOffer || 'Campanha Meta'}), valoriza parcelamento sem juros.`,
        learnedAt: 'Hoje às 11:20',
        source: 'ai_extracted',
        confidence: 'high',
      },
      {
        id: `mem-${journey.id}-3`,
        category: 'decision_maker',
        content: `${leadFirstName} é o próprio tomador de decisão final sobre a contratação.`,
        learnedAt: 'Hoje às 11:21',
        source: 'ai_extracted',
        confidence: 'medium',
      },
    ];
  }, [journey]);

  const [notes, setNotes] = React.useState<MemoryNote[]>(defaultNotes);

  // Sync state if journey changes
  React.useEffect(() => {
    if (journey.memoryNotes && journey.memoryNotes.length > 0) {
      setNotes(journey.memoryNotes);
    }
  }, [journey.id, journey.memoryNotes]);

  // AI Pending Suggestions (extracted from current chat)
  const aiSuggestion: MemoryNote = React.useMemo(() => {
    return {
      id: `sug-${Date.now()}`,
      category: 'objection',
      content: `Preocupação com pontualidade: possui compromisso importante logo após o serviço.`,
      learnedAt: 'Agora (Detectado no chat)',
      source: 'ai_extracted',
      confidence: 'high',
    };
  }, [journey.id]);

  const [hasAcceptedSuggestion, setHasAcceptedSuggestion] = React.useState(false);

  const handleAddNote = () => {
    if (!newContent.trim()) return;
    const note: MemoryNote = {
      id: `mem-${Date.now()}`,
      category: newCategory,
      content: newContent.trim(),
      learnedAt: 'Agora',
      source: 'operator_manual',
      confidence: 'high',
    };

    const updatedNotes = [note, ...notes];
    setNotes(updatedNotes);
    setNewContent('');
    setIsAddingNote(false);

    if (onUpdateJourney) {
      onUpdateJourney({
        ...journey,
        memoryNotes: updatedNotes,
      });
    }
  };

  const handleAcceptAiSuggestion = () => {
    const updatedNotes = [aiSuggestion, ...notes];
    setNotes(updatedNotes);
    setHasAcceptedSuggestion(true);

    if (onUpdateJourney) {
      onUpdateJourney({
        ...journey,
        memoryNotes: updatedNotes,
      });
    }
  };

  const handleDeleteNote = (noteId: string) => {
    const updatedNotes = notes.filter((n) => n.id !== noteId);
    setNotes(updatedNotes);

    if (onUpdateJourney) {
      onUpdateJourney({
        ...journey,
        memoryNotes: updatedNotes,
      });
    }
  };

  const handleTogglePin = (noteId: string) => {
    const updatedNotes = notes.map((n) =>
      n.id === noteId ? { ...n, isPinned: !n.isPinned } : n
    );
    setNotes(updatedNotes);

    if (onUpdateJourney) {
      onUpdateJourney({
        ...journey,
        memoryNotes: updatedNotes,
      });
    }
  };

  const getCategoryBadge = (cat: MemoryNote['category']) => {
    switch (cat) {
      case 'preference':
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Preferência</span>;
      case 'budget':
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Ticket & Preço</span>;
      case 'decision_maker':
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Decisor</span>;
      case 'objection':
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Objeção / Risco</span>;
      case 'past_history':
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Histórico</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700">Geral</span>;
    }
  };

  return (
    <div id="memory-notes-panel" className="border border-indigo-200 rounded-xl overflow-hidden bg-white shadow-2xs">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/60 hover:from-indigo-100/70 hover:to-purple-100/60 flex items-center justify-between text-left transition-colors border-b border-indigo-100"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Brain className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-indigo-950">
                Notas de Memória da IA
              </span>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded-full">
                {notes.length}
              </span>
            </div>
            <p className="text-[10px] text-indigo-700/80">
              Fatos e preferências aprendidos sobre o cliente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-indigo-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-indigo-500 shrink-0" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 space-y-2.5 bg-white">
          {/* AI Suggestion Box if not accepted yet */}
          {!hasAcceptedSuggestion && (
            <div className="p-2.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px] font-bold text-purple-950">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Fato detectado nesta conversa:
                </span>
                <span className="text-[9.5px] bg-purple-200/80 text-purple-900 px-1.5 py-0.2 rounded">
                  IA Copilot
                </span>
              </div>
              <p className="text-[11.5px] text-purple-900 leading-snug">
                "{aiSuggestion.content}"
              </p>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  onClick={() => setHasAcceptedSuggestion(true)}
                  className="px-2 py-0.5 text-[10.5px] text-slate-500 hover:text-slate-700 font-semibold"
                >
                  Dispensar
                </button>
                <button
                  onClick={handleAcceptAiSuggestion}
                  className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold shadow-2xs flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>Fixar na Memória</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Add Form */}
          {isAddingNote ? (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#111b21]">
                <span>Novo Fato de Memória:</span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5"
                >
                  <option value="preference">Preferência</option>
                  <option value="budget">Ticket & Preço</option>
                  <option value="decision_maker">Decisor</option>
                  <option value="objection">Objeção</option>
                  <option value="past_history">Histórico</option>
                </select>
              </div>

              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Ex: Cliente prefere ser atendido após 18h e exige nota fiscal com CNPJ..."
                rows={2}
                className="w-full text-xs p-2 bg-white rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setIsAddingNote(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!newContent.trim()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs disabled:opacity-50"
                >
                  Salvar Nota
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingNote(true)}
              className="w-full py-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl text-xs font-bold text-indigo-700 hover:bg-indigo-50/50 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Fato de Memória</span>
            </button>
          )}

          {/* List of notes */}
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`p-2.5 rounded-xl border text-xs space-y-1 transition-all ${
                  note.isPinned
                    ? 'bg-indigo-50/40 border-indigo-200'
                    : 'bg-[#f8fafc] border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {getCategoryBadge(note.category)}
                    {note.source === 'ai_extracted' ? (
                      <span className="text-[9.5px] text-indigo-600 font-mono flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> IA
                      </span>
                    ) : (
                      <span className="text-[9.5px] text-emerald-700 font-mono flex items-center gap-0.5">
                        <ShieldCheck className="w-2.5 h-2.5" /> Operador
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-slate-400">
                    <button
                      onClick={() => handleTogglePin(note.id)}
                      className={`p-1 rounded hover:bg-slate-200 ${
                        note.isPinned ? 'text-indigo-600' : 'text-slate-400'
                      }`}
                      title={note.isPinned ? 'Desafixar' : 'Fixar no topo'}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded hover:bg-rose-100 hover:text-rose-600"
                      title="Excluir nota"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#111b21] leading-relaxed">
                  {note.content}
                </p>

                <div className="text-[9.5px] text-[#667781] font-mono pt-0.5 flex items-center justify-between">
                  <span>{note.learnedAt}</span>
                  <span className="text-emerald-700">Alta Confiança</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
