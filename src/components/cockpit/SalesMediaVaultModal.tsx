import React from 'react';
import {
  X,
  Mic,
  Play,
  Pause,
  Send,
  FileText,
  Image as ImageIcon,
  Film,
  Sparkles,
  Plus,
  Search,
  Volume2,
  Check,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import {
  SalesMediaResource,
  getSalesMediaForWorkspace,
  defaultSalesMediaVault,
} from '../../data/salesMediaVault';

interface SalesMediaVaultModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMediaResource: (resource: SalesMediaResource) => void;
}

export const SalesMediaVaultModal: React.FC<SalesMediaVaultModalProps> = ({
  workspaceId,
  isOpen,
  onClose,
  onSendMediaResource,
}) => {
  const isLiveApi = salesOsRuntimeConfig.mode === 'api';
  const [resources, setResources] = React.useState<SalesMediaResource[]>(() => {
    if (isLiveApi) return [];
    try {
      const saved = localStorage.getItem(`sos_sales_media_vault_${workspaceId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return getSalesMediaForWorkspace(workspaceId);
  });

  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newSpeaker, setNewSpeaker] = React.useState('Suzana');
  const [newCategory, setNewCategory] = React.useState('Sobrancelhas & Estética Facial');
  const [newType, setNewType] = React.useState<'audio' | 'image' | 'pdf' | 'video'>('audio');
  const [newCaption, setNewCaption] = React.useState('');
  const [mediaError, setMediaError] = React.useState<string | null>(null);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    if (isLiveApi) return;
    try {
      localStorage.setItem(`sos_sales_media_vault_${workspaceId}`, JSON.stringify(resources));
    } catch {}
  }, [isLiveApi, resources, workspaceId]);

  if (!isOpen) return null;

  if (isLiveApi) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-amber-200 shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold">Vault de mídia indisponível</h3>
                <p className="text-[11px] text-slate-300">Nenhum recurso local será usado em produção.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800" aria-label="Fechar Vault">
              <X size={18} />
            </button>
          </div>
          <div className="p-6 space-y-3 text-center">
            <p className="text-sm font-semibold text-slate-900">Upload persistido ainda não está conectado ao backend.</p>
            <p className="text-xs leading-relaxed text-slate-600">
              Para liberar este recurso, é necessário armazenar o arquivo, validar o canal (WAHA ou WABA), registrar o envio e confirmar o resultado após recarregar a conversa.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-[11px] text-amber-900">
              O botão de mídia permanece bloqueado para impedir envio de URLs ou arquivos de demonstração.
            </div>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800">
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const togglePlayAudio = (resource: SalesMediaResource) => {
    if (playingId === resource.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(resource.url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.play().catch(() => {});
      setPlayingId(resource.id);
    }
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    onClose();
  };

  const handleSend = (res: SalesMediaResource) => {
    if (isLiveApi) {
      setMediaError('O envio de mídia está bloqueado até o Vault persistido e o upload do provedor serem homologados.');
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    onSendMediaResource(res);
    onClose();
  };

  const handleAddNewResource = () => {
    if (isLiveApi) {
      setMediaError('O cadastro de mídia exige um contrato de upload no backend. Nenhum recurso local foi criado.');
      return;
    }
    if (!newTitle.trim()) return;

    const created: SalesMediaResource = {
      id: `vault-custom-${Date.now()}`,
      workspaceId,
      type: newType,
      title: newTitle.trim(),
      authorOrSpeaker: newSpeaker,
      category: newCategory,
      description: newCaption || 'Material de apoio para conversão de vendas.',
      url: newType === 'audio' ? 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3' : 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=800&auto=format&fit=crop&q=80',
      durationSeconds: newType === 'audio' ? 45 : undefined,
      fileSizeFormatted: '680 KB',
      captionText: newCaption ? `🎙️ *${newTitle}:* ${newCaption}` : undefined,
      uploadedAt: new Date().toISOString(),
    };

    setResources([created, ...resources]);
    setIsAddingNew(false);
    setNewTitle('');
    setNewCaption('');
  };

  const filtered = resources.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      (r.authorOrSpeaker && r.authorOrSpeaker.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (activeCategory === 'audio' && r.type !== 'audio') return false;
    if (activeCategory === 'image' && r.type !== 'image') return false;
    if (activeCategory === 'pdf' && r.type !== 'pdf') return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <Mic size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold font-heading flex items-center gap-2">
                Vault de Recursos & Áudios Gravados
                <span className="bg-emerald-950 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-800 font-mono">
                  Pronto para Disparo 1-Clique
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                Envie áudios de especialistas (ex: Suzana), fotos de antes & depois e catálogos em PDF direto na conversa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Search, Filters & Add */}
        <div className="p-3.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por especialista, serviço ou palavra-chave..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todos ({resources.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('audio')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeCategory === 'audio'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Mic size={12} /> Áudios
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('pdf')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeCategory === 'pdf'
                  ? 'bg-rose-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText size={12} /> PDFs
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory('image')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeCategory === 'image'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ImageIcon size={12} /> Fotos
            </button>

            <button
              type="button"
              onClick={() => setIsAddingNew((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer ml-1"
            >
              <Plus size={13} /> {isAddingNew ? 'Cancelar' : 'Novo Recurso'}
            </button>
          </div>
        </div>

        {/* Add New Resource Form */}
        {isAddingNew && (
          <div className="p-3.5 bg-emerald-50/70 border-b border-emerald-200 space-y-2 animate-in fade-in shrink-0">
            <p className="text-xs font-bold text-emerald-950 font-heading flex items-center gap-1">
              <Sparkles size={13} className="text-emerald-700" /> Cadastrar Novo Áudio ou Mídia na Biblioteca
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Título do recurso (ex: Áudio da Suzana sobre Micropigmentação)..."
                className="col-span-2 rounded-lg border border-emerald-200 bg-white p-2 text-xs text-slate-900 outline-none"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="rounded-lg border border-emerald-200 bg-white p-2 text-xs text-slate-900 font-medium"
              >
                <option value="audio">🎙️ Áudio de Voz</option>
                <option value="pdf">📄 Catálogo em PDF</option>
                <option value="image">🖼️ Foto / Antes & Depois</option>
                <option value="video">🎥 Vídeo</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={newSpeaker}
                onChange={(e) => setNewSpeaker(e.target.value)}
                placeholder="Especialista / Autor (ex: Suzana, Dra. Camila, Francisco)..."
                className="rounded-lg border border-emerald-200 bg-white p-2 text-xs text-slate-900 outline-none"
              />
              <input
                type="text"
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                placeholder="Legenda / Mensagem de acompanhamento no WhatsApp..."
                className="rounded-lg border border-emerald-200 bg-white p-2 text-xs text-slate-900 outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddNewResource}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                Salvar no Vault
              </button>
            </div>
          </div>
        )}

        {/* Resources Grid List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Nenhum recurso encontrado nesta categoria.</p>
              <p>Cadastre novos áudios gravados ou catálogos para enriquecer o atendimento.</p>
            </div>
          ) : (
            filtered.map((res) => {
              const isAudio = res.type === 'audio';
              const isPlayingThis = playingId === res.id;

              return (
                <div
                  key={res.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-emerald-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Icon Badge */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        res.type === 'audio'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : res.type === 'pdf'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {res.type === 'audio' ? (
                        <Mic size={18} />
                      ) : res.type === 'pdf' ? (
                        <FileText size={18} />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-xs text-slate-950 truncate">{res.title}</p>
                        {res.authorOrSpeaker && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[9.5px] font-bold text-slate-700">
                            {res.authorOrSpeaker}
                          </span>
                        )}
                        <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                          {res.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                        {res.description}
                      </p>
                      {res.captionText && (
                        <p className="text-[10px] text-slate-500 italic truncate max-w-md">
                          "{res.captionText}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isAudio && (
                      <button
                        type="button"
                        onClick={() => togglePlayAudio(res)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isPlayingThis
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        {isPlayingThis ? <Pause size={13} /> : <Play size={13} />}
                        {isPlayingThis ? 'Pausar' : 'Ouvir Prévia'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSend(res)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
                    >
                      <Send size={12} /> Enviar no WhatsApp
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>{filtered.length} recurso(s) disponível(is) para o time comercial</span>
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
