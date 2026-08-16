import React, { useState, useMemo } from 'react';
import { Workspace } from '../../types/cockpit';
import { OperationalNote, NoteCategory } from '../../types/agendaAndNotes';
import { mockOperationalNotes } from '../../data/agendaAndNotesFixtures';
import {
  FileText,
  Plus,
  Search,
  Pin,
  Tag,
  Copy,
  Check,
  Trash2,
  Edit3,
  Bookmark,
  Sparkles,
  BookOpen,
  Target,
  Users,
  MessageSquare,
  Flame,
} from 'lucide-react';

import { SalesOsGateway } from '../../services/salesOsGateway';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { getSupabaseClient } from '../../services/supabaseAuth';

interface NotesViewProps {
  workspace: Workspace;
  gateway?: SalesOsGateway;
}

export const NotesView: React.FC<NotesViewProps> = ({ workspace, gateway }) => {
  const [notes, setNotes] = useState<OperationalNote[]>(() =>
    salesOsRuntimeConfig.mode === 'api' ? [] : mockOperationalNotes
  );
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // New Note Modal / Drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<NoteCategory>('script');
  const [newTags, setNewTags] = useState('');
  const [newColor, setNewColor] = useState<'emerald' | 'purple' | 'amber' | 'blue'>('emerald');

  const fetchNotes = React.useCallback(async () => {
    if (!gateway?.listNotes) return;
    try {
      const data = await gateway.listNotes(workspace.id);
      setNotes(data || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }, [workspace.id, gateway]);

  React.useEffect(() => {
    setLoading(true);
    fetchNotes().finally(() => setLoading(false));

    const client = getSupabaseClient();
    let channel: any;
    if (client) {
      channel = client
        .channel(`live-notes-${workspace.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'workspace_notes',
            filter: `workspace_id=eq.${workspace.id}`,
          },
          () => {
            void fetchNotes();
          }
        )
        .subscribe();
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetchNotes();
    }, 10000);

    return () => {
      if (client && channel) void client.removeChannel(channel);
      clearInterval(timer);
    };
  }, [workspace.id, fetchNotes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchesSearch =
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        n.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || n.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [notes, search, selectedCategory]);

  const handleCopyContent = (note: OperationalNote) => {
    navigator.clipboard.writeText(note.content);
    setCopiedNoteId(note.id);
    setTimeout(() => setCopiedNoteId(null), 2000);
  };

  const handleTogglePin = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const newPinned = !note.pinned;
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, pinned: newPinned } : n))
    );
    if (gateway?.updateNote) {
      try {
        await gateway.updateNote(workspace.id, noteId, { pinned: newPinned });
      } catch {
        // revert on failure
      }
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (gateway?.deleteNote) {
      try {
        await gateway.deleteNote(workspace.id, noteId);
      } catch {
        // revert on failure
      }
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const tagsArray = newTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Partial<OperationalNote> = {
      workspaceId: workspace.id,
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      tags: tagsArray.length > 0 ? tagsArray : ['Geral'],
      pinned: false,
      color: newColor,
      authorName: 'Você (Gestor)',
    };

    if (gateway?.createNote) {
      try {
        const created = await gateway.createNote(workspace.id, payload);
        setNotes((prev) => [created, ...prev]);
      } catch {
        const fallbackNote: OperationalNote = {
          id: `note-${Date.now()}`,
          workspaceId: workspace.id,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          tags: tagsArray.length > 0 ? tagsArray : ['Geral'],
          pinned: false,
          color: newColor,
          authorName: 'Você (Gestor)',
          createdAt: 'Agora',
          updatedAt: 'Agora',
        };
        setNotes((prev) => [fallbackNote, ...prev]);
      }
    } else {
      const fallbackNote: OperationalNote = {
        id: `note-${Date.now()}`,
        workspaceId: workspace.id,
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        tags: tagsArray.length > 0 ? tagsArray : ['Geral'],
        pinned: false,
        color: newColor,
        authorName: 'Você (Gestor)',
        createdAt: 'Agora',
        updatedAt: 'Agora',
      };
      setNotes((prev) => [fallbackNote, ...prev]);
    }

    setIsModalOpen(false);
    setNewTitle('');
    setNewContent('');
    setNewTags('');
  };

  const getColorClasses = (color?: string) => {
    switch (color) {
      case 'emerald':
        return 'border-emerald-200 bg-emerald-50/40 text-emerald-950';
      case 'purple':
        return 'border-purple-200 bg-purple-50/40 text-purple-950';
      case 'amber':
        return 'border-amber-200 bg-amber-50/40 text-amber-950';
      case 'blue':
        return 'border-blue-200 bg-blue-50/40 text-blue-950';
      default:
        return 'border-slate-200 bg-white text-slate-900';
    }
  };

  return (
    <div id="notes-view-container" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 font-heading">
              Anotações & Scripts da Operação
            </h1>
            <span className="bg-purple-50 text-purple-700 font-bold text-xs px-2.5 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
              <BookOpen className="w-3 h-3 text-purple-600" /> Caderno de Fechamento
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Scripts de contorno de objeções, atas de alinhamento, metas do time e memórias rápidas para {workspace.name}.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Nova Anotação / Script</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              selectedCategory === 'all'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Todas ({notes.length})
          </button>
          <button
            onClick={() => setSelectedCategory('script')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              selectedCategory === 'script'
                ? 'bg-white text-emerald-800 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Scripts Rápidos
          </button>
          <button
            onClick={() => setSelectedCategory('goal')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              selectedCategory === 'goal'
                ? 'bg-white text-purple-800 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Metas do Dia
          </button>
          <button
            onClick={() => setSelectedCategory('meeting')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              selectedCategory === 'meeting'
                ? 'bg-white text-blue-800 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Alinhamentos
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por termo, objeção ou tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
          Nenhuma anotação encontrada para os critérios de busca.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredNotes.map((note) => {
            const isCopied = copiedNoteId === note.id;

            return (
              <div
                key={note.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-2xs ${getColorClasses(
                  note.color
                )}`}
              >
                <div>
                  {/* Note Top Bar */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {note.pinned && (
                        <span className="p-1 rounded bg-amber-500 text-white shadow-2xs" title="Fixado no topo">
                          <Pin className="w-2.5 h-2.5 fill-current" />
                        </span>
                      )}
                      <h3 className="font-bold text-xs sm:text-sm text-slate-900 font-heading leading-tight">
                        {note.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleTogglePin(note.id)}
                        className={`p-1 rounded text-slate-400 hover:text-amber-600 transition-colors ${
                          note.pinned ? 'text-amber-500' : ''
                        }`}
                        title={note.pinned ? 'Desafixar' : 'Fixar no topo'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                        title="Excluir anotação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Note Body */}
                  <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-sans bg-white/70 p-3 rounded-xl border border-black/5">
                    {note.content}
                  </div>
                </div>

                {/* Footer Info & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-black/5 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-600 font-mono text-[10px]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[10px]">
                      {note.authorName} · {note.createdAt}
                    </span>
                    <button
                      onClick={() => handleCopyContent(note)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 shadow-2xs ${
                        isCopied
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      title="Copiar script para área de transferência"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Nova Anotação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  Nova Anotação / Script de Fechamento
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Título da Anotação:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Script de Contorno: Preço Alto vs Salão Vizinho"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Categoria:
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as NoteCategory)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="script">Script Rápido</option>
                    <option value="goal">Metas & Capacidade</option>
                    <option value="meeting">Ata de Alinhamento</option>
                    <option value="lead_vip">Dossiê VIP</option>
                    <option value="general">Geral</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Cor de Destaque:
                  </label>
                  <select
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="emerald">Verde (Sucesso / Conversão)</option>
                    <option value="purple">Roxo (Metas / IA)</option>
                    <option value="amber">Âmbar (Atenção / Sinal)</option>
                    <option value="blue">Azul (Alinhamento / Reunião)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Conteúdo do Script ou Anotação:
                </label>
                <textarea
                  rows={5}
                  required
                  placeholder="Escreva o script passo a passo ou os pontos combinados..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Tags (separadas por vírgula):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Script, Objeção, Preço, Sábado"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Salvar Anotação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
