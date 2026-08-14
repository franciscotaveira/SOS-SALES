import React from 'react';
import { KnowledgeDocument, DocumentCategory } from '../../types/intelligence';
import {
  Brain,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileCode,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Eye,
  Plus,
  Search,
  Layers,
  Database,
  ShieldAlert,
  HelpCircle,
  BookOpen,
} from 'lucide-react';

interface AgentKnowledgeBaseSectionProps {
  documents: KnowledgeDocument[];
  onUpdateDocuments?: (docs: KnowledgeDocument[]) => void;
}

export const AgentKnowledgeBaseSection: React.FC<AgentKnowledgeBaseSectionProps> = ({
  documents: initialDocs,
  onUpdateDocuments,
}) => {
  const [documents, setDocuments] = React.useState<KnowledgeDocument[]>(initialDocs);
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [isUploading, setIsUploading] = React.useState(false);
  const [selectedDocForPreview, setSelectedDocForPreview] = React.useState<KnowledgeDocument | null>(null);
  const [isAddRuleOpen, setIsAddRuleOpen] = React.useState(false);
  const [newRuleTitle, setNewRuleTitle] = React.useState('');
  const [newRuleCategory, setNewRuleCategory] = React.useState<DocumentCategory>('scripts_vendas');
  const [newRuleContent, setNewRuleContent] = React.useState('');
  const [newRuleIsPrioritized, setNewRuleIsPrioritized] = React.useState(true);
  const [newRuleFactType, setNewRuleFactType] = React.useState<'faq' | 'policy' | 'pricing' | 'service'>('faq');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDocuments(initialDocs);
  }, [initialDocs]);

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    const newDocs: KnowledgeDocument[] = Array.from(files).map((file, idx) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const fileType =
        ext === 'pdf'
          ? 'pdf'
          : ext === 'xlsx' || ext === 'xls'
          ? 'xlsx'
          : ext === 'docx' || ext === 'doc'
          ? 'docx'
          : ext === 'csv'
          ? 'csv'
          : 'txt';

      const category: DocumentCategory =
        fileType === 'xlsx' || fileType === 'csv'
          ? 'tabela_precos'
          : ext === 'pdf'
          ? 'manual_tecnico'
          : 'scripts_vendas';

      return {
        id: `doc-${Date.now()}-${idx}`,
        name: file.name,
        fileType,
        fileSize: `${(file.size / 1024).toFixed(0)} KB`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'Você (Gestor)',
        category,
        status: 'indexed',
        extractedChunksCount: Math.floor(12 + Math.random() * 30),
        tokenCount: Math.floor(2500 + Math.random() * 5000),
        summary: `Documento "${file.name}" processado e vetorizado no Vector Store RAG com sucesso.`,
        rawContentSnippet: `Conteúdo extraído com sucesso do arquivo ${file.name}. Regras, tabelas e parâmetros de atendimento indexados no banco de inteligência do cliente.`,
        isPrioritizedFact: false,
        factType: 'faq',
      };
    });

    setTimeout(() => {
      const updated = [...newDocs, ...documents];
      setDocuments(updated);
      if (onUpdateDocuments) onUpdateDocuments(updated);
      setIsUploading(false);
    }, 1200);
  };

  const handleCreateRuleDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTitle || !newRuleContent) return;

    const newDoc: KnowledgeDocument = {
      id: `doc-rule-${Date.now()}`,
      name: `${newRuleTitle}.txt`,
      fileType: 'txt',
      fileSize: `${(newRuleContent.length / 1024).toFixed(1)} KB`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Você (Gestor)',
      category: newRuleCategory,
      status: 'indexed',
      extractedChunksCount: Math.max(1, Math.ceil(newRuleContent.length / 400)),
      tokenCount: Math.floor(newRuleContent.length / 4),
      summary: newRuleTitle,
      rawContentSnippet: newRuleContent,
      isPrioritizedFact: newRuleIsPrioritized,
      factType: newRuleFactType,
    };

    const updated = [newDoc, ...documents];
    setDocuments(updated);
    if (onUpdateDocuments) onUpdateDocuments(updated);

    setNewRuleTitle('');
    setNewRuleContent('');
    setNewRuleIsPrioritized(true);
    setIsAddRuleOpen(false);
  };

  const handleTogglePriority = (id: string) => {
    const updated = documents.map((d) =>
      d.id === id ? { ...d, isPrioritizedFact: !d.isPrioritizedFact } : d
    );
    setDocuments(updated);
    if (onUpdateDocuments) onUpdateDocuments(updated);
  };

  const handleDeleteDoc = (id: string) => {
    const updated = documents.filter((d) => d.id !== id);
    setDocuments(updated);
    if (onUpdateDocuments) onUpdateDocuments(updated);
  };

  const filteredDocs = React.useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.name.toLowerCase().includes(search.toLowerCase()) ||
        doc.summary.toLowerCase().includes(search.toLowerCase()) ||
        (doc.rawContentSnippet && doc.rawContentSnippet.toLowerCase().includes(search.toLowerCase()));
      if (!matchesSearch) return false;

      if (selectedCategory === 'prioritized') {
        return doc.isPrioritizedFact === true;
      }
      if (selectedCategory === 'faq') {
        return doc.factType === 'faq' || doc.category === 'faq_empresa';
      }
      if (selectedCategory === 'pricing') {
        return doc.factType === 'pricing' || doc.category === 'tabela_precos';
      }
      if (selectedCategory === 'policy') {
        return doc.factType === 'policy' || doc.category === 'politicas_garantia';
      }
      if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
      return true;
    });
  }, [documents, search, selectedCategory]);

  const totalTokens = React.useMemo(
    () => documents.reduce((acc, d) => acc + d.tokenCount, 0),
    [documents]
  );
  const totalChunks = React.useMemo(
    () => documents.reduce((acc, d) => acc + d.extractedChunksCount, 0),
    [documents]
  );

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-rose-500" />;
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
      case 'docx':
        return <FileText className="w-5 h-5 text-blue-500" />;
      default:
        return <FileCode className="w-5 h-5 text-purple-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold font-heading">
              Banco de Inteligência do Agente (RAG & Base de Conhecimento)
            </h2>
            <span className="text-[10px] bg-purple-950 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-800 flex items-center gap-1">
              <Database className="w-3 h-3" /> Vector RAG Ativo
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Envie arquivos PDF, DOCX, planilhas Excel de preços, manuais técnicos e regras comerciais. O motor de IA vetoriza o conteúdo para responder dúvidas sem inventar ou alucinar.
          </p>
        </div>

        {/* Stats Summary */}
        <div className="flex items-center gap-3 shrink-0 bg-slate-800/80 px-3.5 py-2 rounded-lg border border-slate-700">
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Docs Indexados</span>
            <span className="text-sm font-bold text-white">{documents.length}</span>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Chunks RAG</span>
            <span className="text-sm font-bold text-purple-300">{totalChunks}</span>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Tokens</span>
            <span className="text-sm font-bold text-emerald-300">
              {(totalTokens / 1000).toFixed(1)}k
            </span>
          </div>
        </div>
      </div>

      {/* Drag & Drop File Upload Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group ${
          isUploading
            ? 'bg-purple-50/50 border-purple-400 text-purple-900'
            : 'bg-white border-slate-300 hover:border-[#00A884] hover:bg-slate-50/50 text-slate-700 shadow-2xs'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-2xl bg-purple-100/80 text-purple-700 flex items-center justify-center group-hover:scale-110 transition-transform">
          {isUploading ? (
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <UploadCloud className="w-6 h-6" />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-bold text-slate-900 font-heading">
            {isUploading
              ? 'Processando, extraindo texto e gerando embeddings RAG...'
              : 'Clique ou arraste arquivos para treinar o Agente de IA deste cliente'}
          </p>
          <p className="text-xs text-slate-500">
            Suporta <span className="font-semibold text-slate-700">PDF, DOCX, XLSX (Tabelas de Preço), CSV e TXT</span> (até 25 MB cada)
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium">
            🛡️ Indexação Segura & Privada por Cliente
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAddRuleOpen(true);
            }}
            className="text-[11px] text-purple-700 font-bold hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Criar Regra / Script Rápido em Texto
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nos documentos e regras indexadas..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00A884]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({documents.length})
          </button>
          <button
            onClick={() => setSelectedCategory('prioritized')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
              selectedCategory === 'prioritized'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Sparkles className="w-3 h-3" /> Fatos Prioritários
          </button>
          <button
            onClick={() => setSelectedCategory('faq')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'faq'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            FAQs & Dúvidas
          </button>
          <button
            onClick={() => setSelectedCategory('pricing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'pricing'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Preços & Planos
          </button>
          <button
            onClick={() => setSelectedCategory('policy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'policy'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            Políticas & Regras
          </button>
        </div>
      </div>

      {/* Indexed Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="divide-y divide-slate-100">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 shrink-0">
                  {getFileIcon(doc.fileType)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-slate-900 truncate font-mono">
                      {doc.name}
                    </h3>
                    {doc.isPrioritizedFact && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                        ⚡ Prioridade Máxima
                      </span>
                    )}
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Vetorizado (RAG Ativo)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {doc.fileSize}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-1 leading-relaxed">
                    {doc.summary}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                    <span>{doc.extractedChunksCount} chunks semânticos</span>
                    <span>•</span>
                    <span>{doc.tokenCount.toLocaleString()} tokens</span>
                    <span>•</span>
                    <span>Enviado por {doc.uploadedBy}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => handleTogglePriority(doc.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                    doc.isPrioritizedFact
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Alternar prioridade máxima de resposta"
                >
                  ⚡ {doc.isPrioritizedFact ? 'Prioritário' : 'Normal'}
                </button>
                <button
                  onClick={() => setSelectedDocForPreview(doc)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver Chunks
                </button>
                <button
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Excluir arquivo do banco de inteligência"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {filteredDocs.length === 0 && (
            <div className="p-8 text-center text-slate-400 space-y-1">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-semibold">Nenhum documento encontrado com os filtros atuais.</p>
              <p className="text-[11px]">Faça upload de manuais ou planilhas para preencher a base.</p>
            </div>
          )}
        </div>
      </div>

      {/* Document Chunks Preview Modal */}
      {selectedDocForPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-heading">
                  Auditoria de Chunks Vetorizados: {selectedDocForPreview.name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {selectedDocForPreview.extractedChunksCount} chunks indexados • {selectedDocForPreview.tokenCount} tokens
                </p>
              </div>
              <button
                onClick={() => setSelectedDocForPreview(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-950 space-y-1">
                <span className="font-bold flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Resumo do Embeddings Engine
                </span>
                <p className="leading-relaxed">{selectedDocForPreview.summary}</p>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                  Chunks Semânticos Extraídos (Amostragem RAG)
                </h4>

                {[1, 2, 3].map((chunkIndex) => (
                  <div
                    key={chunkIndex}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 space-y-1 font-mono text-[11px]"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-slate-600">Chunk #{chunkIndex}</span>
                      <span>Score de Similaridade: 0.94</span>
                    </div>
                    <p className="leading-relaxed">
                      {selectedDocForPreview.rawContentSnippet ||
                        `Extração do chunk ${chunkIndex} contendo regras de precificação, condições comerciais, alçadas e procedimentos de atendimento para ${selectedDocForPreview.name}.`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedDocForPreview(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg"
              >
                Fechar Visualizador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Text Rule Modal */}
      {isAddRuleOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRuleDoc}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 font-heading">
                Criar Nova Regra / Script Comercial
              </h3>
              <button
                type="button"
                onClick={() => setIsAddRuleOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Título da Regra ou Script
                </label>
                <input
                  type="text"
                  required
                  value={newRuleTitle}
                  onChange={(e) => setNewRuleTitle(e.target.value)}
                  placeholder="Ex: Como agir quando o cliente pede sábado à tarde"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Categoria</label>
                <select
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value as DocumentCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                >
                  <option value="scripts_vendas">Scripts de Vendas & Fechamento</option>
                  <option value="tabela_precos">Tabela de Preços & Descontos</option>
                  <option value="politicas_garantia">Políticas de Garantia & Cancelamento</option>
                  <option value="faq_empresa">FAQ da Empresa & Localização</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipo de Fato na Base</label>
                <select
                  value={newRuleFactType}
                  onChange={(e) => setNewRuleFactType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                >
                  <option value="faq">FAQ (Dúvidas Frequentes)</option>
                  <option value="pricing">Tabela de Preços & Planos</option>
                  <option value="policy">Política de Serviço & Garantia</option>
                  <option value="service">Informação de Serviço</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-purple-950 block">⚡ Prioridade Máxima (Overrule IA)</span>
                  <span className="text-[11px] text-purple-800">Se ativado, o agente prioriza este fato rigorosamente sobre qualquer outra dedução em respostas aos leads.</span>
                </div>
                <input
                  type="checkbox"
                  checked={newRuleIsPrioritized}
                  onChange={(e) => setNewRuleIsPrioritized(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-purple-300 focus:ring-purple-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Instrução / Conteúdo da Regra (o que o agente deve saber e falar)
                </label>
                <textarea
                  required
                  rows={4}
                  value={newRuleContent}
                  onChange={(e) => setNewRuleContent(e.target.value)}
                  placeholder="Ex: Sempre confirme o horário das 14h imediatamente informando que temos valet cortesia na porta da Oscar Freire 1128..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddRuleOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-sm"
              >
                Indexar no Agente
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
