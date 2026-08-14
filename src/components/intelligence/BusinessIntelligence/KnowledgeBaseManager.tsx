import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  ShieldAlert,
  Search,
  Sparkles,
  HelpCircle,
  DollarSign,
  BookOpen,
} from 'lucide-react';
import { KnowledgeDocument, DocumentCategory } from '../../../types/intelligence';
import { businessIntelligenceService } from '../../../services/businessIntelligenceService';

export const KnowledgeBaseManager: React.FC = () => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFactType, setSelectedFactType] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [factType, setFactType] = useState<'faq' | 'policy' | 'pricing' | 'service'>('faq');
  const [category, setCategory] = useState<DocumentCategory>('faq_empresa');
  const [content, setContent] = useState('');
  const [isPrioritizedFact, setIsPrioritizedFact] = useState(true);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = () => {
    setDocuments(businessIntelligenceService.getKnowledgeDocuments());
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setFactType('faq');
    setCategory('faq_empresa');
    setContent('');
    setIsPrioritizedFact(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (doc: KnowledgeDocument) => {
    setEditingId(doc.id);
    setName(doc.name);
    setFactType(doc.factType || 'faq');
    setCategory(doc.category || 'faq_empresa');
    setContent(doc.rawContentSnippet || '');
    setIsPrioritizedFact(doc.isPrioritizedFact ?? true);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;

    if (editingId) {
      businessIntelligenceService.updateKnowledgeDocument(editingId, {
        name,
        factType,
        category,
        summary: name,
        rawContentSnippet: content,
        isPrioritizedFact,
      });
    } else {
      businessIntelligenceService.addKnowledgeDocument({
        name,
        factType,
        category,
        fileType: 'txt',
        fileSize: `${Math.round((content.length / 1024) * 10) / 10} KB`,
        uploadedBy: 'Operador',
        summary: name,
        rawContentSnippet: content,
        isPrioritizedFact,
      });
    }

    loadDocs();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja remover este item da base de conhecimento?')) {
      businessIntelligenceService.deleteKnowledgeDocument(id);
      loadDocs();
    }
  };

  const handleTogglePriority = (id: string) => {
    const doc = documents.find((d) => d.id === id);
    if (doc) {
      businessIntelligenceService.updateKnowledgeDocument(id, {
        isPrioritizedFact: !doc.isPrioritizedFact,
      });
      loadDocs();
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.rawContentSnippet && doc.rawContentSnippet.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = selectedFactType === 'all' || doc.factType === selectedFactType;
    return matchesSearch && matchesType;
  });

  const getFactTypeBadge = (type?: string) => {
    switch (type) {
      case 'faq':
        return { label: 'FAQ', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: HelpCircle };
      case 'pricing':
        return { label: 'Preços & Planos', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: DollarSign };
      case 'policy':
        return { label: 'Política / Regra', bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: ShieldAlert };
      default:
        return { label: 'Serviço', bg: 'bg-amber-50 text-amber-700 border-amber-200', icon: BookOpen };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#00A884]" />
            Gerenciador de Base de Conhecimento (Knowledge Base)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Defina FAQs, políticas e tabelas de preços que a IA consultará com prioridade máxima (RAG).
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2.5 bg-[#00A884] hover:bg-[#009273] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo Fato / Regra
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar na base de conhecimento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00A884]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['all', 'faq', 'pricing', 'policy', 'service'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedFactType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer ${
                selectedFactType === type
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {type === 'all' ? 'Todos' : type === 'pricing' ? 'Preços' : type === 'policy' ? 'Políticas' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Document/Fact List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredDocs.map((doc) => {
          const badge = getFactTypeBadge(doc.factType);
          const BadgeIcon = badge.icon;
          return (
            <div
              key={doc.id}
              className={`bg-white rounded-2xl p-5 border transition-all shadow-sm hover:shadow-md flex flex-col justify-between ${
                doc.isPrioritizedFact ? 'border-amber-300/80 bg-gradient-to-br from-amber-50/20 to-white' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                      <BadgeIcon className="w-3 h-3" /> {badge.label}
                    </span>
                    {doc.isPrioritizedFact && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-amber-700" /> Prioridade Máxima
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTogglePriority(doc.id)}
                      className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        doc.isPrioritizedFact ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title="Alternar prioridade"
                    >
                      ⚡
                    </button>
                    <button
                      onClick={() => handleOpenEdit(doc)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-slate-900 mb-1">{doc.name}</h3>
                <p className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono">
                  {doc.rawContentSnippet || doc.summary}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Vetorizado ({doc.tokenCount || 100} tokens)
                </span>
                <span>Atualizado recentemente</span>
              </div>
            </div>
          );
        })}

        {filteredDocs.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Nenhum fato encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Adicione novas regras, FAQs ou políticas para alimentar a IA do agente.</p>
          </div>
        )}
      </div>

      {/* Modal Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00A884]" />
                {editingId ? 'Editar Fato ou Regra da Base' : 'Adicionar Novo Fato / Regra'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título / Assunto</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Política de Reembolso, Preço do Corte, FAQ Estacionamento"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Fato</label>
                  <select
                    value={factType}
                    onChange={(e) => setFactType(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  >
                    <option value="faq">FAQ (Dúvidas)</option>
                    <option value="pricing">Preço & Planos</option>
                    <option value="policy">Política / Regra</option>
                    <option value="service">Serviço</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoria RAG</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                  >
                    <option value="faq_empresa">FAQ Empresa</option>
                    <option value="tabela_precos">Tabela de Preços</option>
                    <option value="politicas_garantia">Políticas & Garantia</option>
                    <option value="scripts_vendas">Scripts de Vendas</option>
                    <option value="manual_tecnico">Manual Técnico</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-amber-950 block">⚡ Prioridade Máxima (Overrule IA)</span>
                  <span className="text-[11px] text-amber-800">Se ativado, o agente prioriza este fato sobre qualquer inferência geral.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isPrioritizedFact}
                  onChange={(e) => setIsPrioritizedFact(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Conteúdo / Regra exata</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Escreva claramente o fato, preço ou política que o agente deve responder aos clientes..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00A884] hover:bg-[#009273] text-white shadow-sm cursor-pointer"
                >
                  Salvar Fato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
