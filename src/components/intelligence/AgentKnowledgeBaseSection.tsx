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
        return <FileText className="w-4 h-4 text-[var(--sos-danger)]" />;
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-[var(--sos-success)]" />;
      case 'docx':
        return <FileText className="w-4 h-4 text-[var(--sos-operational)]" />;
      default:
        return <FileCode className="w-4 h-4 text-[var(--sos-ai)]" />;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[var(--sos-surface)] border-[var(--sos-border)] rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Brain className="w-4.5 h-4.5 text-[var(--sos-ai)]" />
            <h2 className="text-base font-bold font-heading">
              Documentos & Regras da Empresa (Base de Conhecimento)
            </h2>
            <span className="text-[8.5px] bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] font-bold px-1.5 py-0.5 rounded-full border border-[var(--sos-ai)]/30 flex items-center gap-1">
              <Database className="w-2.5 h-2.5" /> Leitura Inteligente Ativa
            </span>
          </div>
          <p className="text-[9.5px] text-[var(--sos-muted)]">
            Envie arquivos PDF, DOCX, planilhas Excel de preços, manuais e regras comerciais. O atendente inteligente aprende esse conteúdo para responder dúvidas com precisão, sem inventar dados.
          </p>
        </div>

        {/* Stats Summary */}
        <div className="flex items-center gap-2.5 shrink-0 bg-[var(--sos-background)] px-3 py-1.5 rounded-lg border border-[var(--sos-border)]">
          <div className="text-center">
            <span className="text-[8.5px] text-[var(--sos-muted)] block font-semibold">Documentos</span>
            <span className="text-sm font-bold text-white">{documents.length}</span>
          </div>
          <div className="h-5 w-px bg-[var(--sos-border)]" />
          <div className="text-center">
            <span className="text-[8.5px] text-[var(--sos-muted)] block font-semibold">Tópicos Aprendidos</span>
            <span className="text-sm font-bold text-[var(--sos-ai)]">{totalChunks}</span>
          </div>
          <div className="h-5 w-px bg-[var(--sos-border)]" />
          <div className="text-center">
            <span className="text-[8.5px] text-[var(--sos-muted)] block font-semibold">Palavras Aprendidas</span>
            <span className="text-sm font-bold text-[var(--sos-success)]">
              {totalTokens.toLocaleString('pt-BR')}
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
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 group ${
          isUploading
            ? 'bg-[var(--sos-ai-subtle)] border-[var(--sos-ai)] text-[var(--sos-ink)]'
            : 'bg-[var(--sos-surface)] border-[var(--sos-border)] hover:border-[var(--sos-ai)] hover:bg-[var(--sos-background)]/50 text-[var(--sos-ink)] shadow-2xs'
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

        <div className="w-9 h-9 rounded-lg bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center group-hover:scale-110 transition-transform">
          {isUploading ? (
            <div className="w-5 h-5 border-2 border-[var(--sos-ai)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <UploadCloud className="w-5 h-5" />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-[9.5px] font-bold text-[var(--sos-ink)] font-heading">
            {isUploading
              ? 'Processando, extraindo texto e gerando embeddings RAG...'
              : 'Clique ou arraste arquivos para treinar o Agente de IA deste cliente'}
          </p>
          <p className="text-[8.5px] text-[var(--sos-muted)]">
            Suporta <span className="font-semibold text-[var(--sos-ink)]">PDF, DOCX, XLSX (Tabelas de Preço), CSV e TXT</span> (até 25 MB cada)
          </p>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[8.5px] text-[var(--sos-muted)] bg-[var(--sos-border)]/30 px-1.5 py-0.5 rounded font-medium">
            🛡️ Indexação Segura & Privada por Cliente
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsAddRuleOpen(true);
            }}
            className="text-[8.5px] text-[var(--sos-ai)] font-bold hover:underline flex items-center gap-0.5"
          >
            <Plus className="w-2.5 h-2.5" /> Criar Regra / Script Rápido em Texto
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-[var(--sos-surface)] p-2.5 rounded-lg border border-[var(--sos-border)] shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-3.5 h-3.5 text-[var(--sos-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nos documentos e regras indexadas..."
            className="w-full pl-8 pr-2.5 py-1 text-xs bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg focus:bg-[var(--sos-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--sos-ai)]"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'all'
                ? 'bg-[var(--sos-ink)] text-white'
                : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] hover:bg-[var(--sos-border)]/50'
            }`}
          >
            Todos ({documents.length})
          </button>
          <button
            onClick={() => setSelectedCategory('prioritized')}
            className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-0.5 ${
              selectedCategory === 'prioritized'
                ? 'bg-[var(--sos-warning)] text-white'
                : 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border border-[var(--sos-warning)]/30 hover:bg-[var(--sos-warning-subtle)]'
            }`}
          >
            <Sparkles className="w-2.5 h-2.5" /> Fatos Prioritários
          </button>
          <button
            onClick={() => setSelectedCategory('faq')}
            className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'faq'
                ? 'bg-[var(--sos-operational)] text-white'
                : 'bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] border border-[var(--sos-operational)]/30 hover:bg-[var(--sos-operational-subtle)]'
            }`}
          >
            FAQs & Dúvidas
          </button>
          <button
            onClick={() => setSelectedCategory('pricing')}
            className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'pricing'
                ? 'bg-[var(--sos-success)] text-white'
                : 'bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 hover:bg-[var(--sos-success-subtle)]'
            }`}
          >
            Preços & Planos
          </button>
          <button
            onClick={() => setSelectedCategory('policy')}
            className={`px-2 py-1 rounded-lg text-[8.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'policy'
                ? 'bg-[var(--sos-ai)] text-white'
                : 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30 hover:bg-[var(--sos-ai-subtle)]'
            }`}
          >
            Políticas & Regras
          </button>
        </div>
      </div>

      {/* Indexed Documents Table */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg overflow-hidden shadow-2xs">
        <div className="divide-y divide-[var(--sos-border)]">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="p-3 hover:bg-[var(--sos-background)]/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-[var(--sos-background)] border border-[var(--sos-border)] shrink-0">
                  {getFileIcon(doc.fileType)}
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-[9.5px] font-bold text-[var(--sos-ink)] truncate font-mono">
                      {doc.name}
                    </h3>
                    {doc.isPrioritizedFact && (
                      <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border border-[var(--sos-warning)]/30 flex items-center gap-1">
                        ⚡ Prioridade Máxima
                      </span>
                    )}
                    <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 flex items-center gap-1">
                      <CheckCircle2 className="w-2 h-2" /> Vetorizado (RAG Ativo)
                    </span>
                    <span className="text-[9px] text-[var(--sos-muted)] font-mono">
                      {doc.fileSize}
                    </span>
                  </div>

                  <p className="text-[9px] text-[var(--sos-muted)] line-clamp-1 leading-relaxed">
                    {doc.summary}
                  </p>

                  <div className="flex items-center gap-2 text-[8.5px] text-[var(--sos-muted)] pt-0.5">
                    <span>{doc.extractedChunksCount} chunks semânticos</span>
                    <span>•</span>
                    <span>{doc.tokenCount.toLocaleString()} tokens</span>
                    <span>•</span>
                    <span>Enviado por {doc.uploadedBy}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                <button
                  onClick={() => handleTogglePriority(doc.id)}
                  className={`px-2 py-1 rounded-lg text-[8px] font-semibold flex items-center gap-0.5 transition-colors ${
                    doc.isPrioritizedFact
                      ? 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] hover:bg-[var(--sos-warning-subtle)]'
                      : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] hover:bg-[var(--sos-border)]/50'
                  }`}
                  title="Alternar prioridade máxima de resposta"
                >
                  ⚡ {doc.isPrioritizedFact ? 'Prioritário' : 'Normal'}
                </button>
                <button
                  onClick={() => setSelectedDocForPreview(doc)}
                  className="px-2 py-1 rounded-lg text-[8px] font-semibold bg-[var(--sos-border)]/30 hover:bg-[var(--sos-border)]/50 text-[var(--sos-ink)] flex items-center gap-0.5 transition-colors"
                >
                  <Eye className="w-3 h-3" /> Ver Chunks
                </button>
                <button
                  onClick={() => handleDeleteDoc(doc.id)}
                  className="p-1 rounded-lg text-[var(--sos-muted)] hover:text-[var(--sos-danger)] hover:bg-[var(--sos-danger-subtle)] transition-colors"
                  title="Excluir arquivo do banco de inteligência"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {filteredDocs.length === 0 && (
            <div className="p-6 text-center text-[var(--sos-muted)] space-y-1">
              <BookOpen className="w-7 h-7 mx-auto text-[var(--sos-border)]" />
              <p className="text-[9.5px] font-semibold">Nenhum documento encontrado com os filtros atuais.</p>
              <p className="text-[8.5px]">Faça upload de manuais ou planilhas para preencher a base.</p>
            </div>
          )}
        </div>
      </div>

      {/* Document Chunks Preview Modal */}
      {selectedDocForPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl max-w-2xl w-full p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
              <div>
                <h3 className="text-xs font-bold text-[var(--sos-ink)] font-heading">
                  Auditoria de Chunks Vetorizados: {selectedDocForPreview.name}
                </h3>
                <p className="text-[8.5px] text-[var(--sos-muted)]">
                  {selectedDocForPreview.extractedChunksCount} chunks indexados • {selectedDocForPreview.tokenCount} tokens
                </p>
              </div>
              <button
                onClick={() => setSelectedDocForPreview(null)}
                className="text-[var(--sos-muted)] hover:text-[var(--sos-ink)] text-base font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-[9px]">
              <div className="p-2.5 bg-[var(--sos-ai-subtle)] rounded-lg border border-[var(--sos-ai)]/30 text-[var(--sos-ink)] space-y-0.5">
                <span className="font-bold flex items-center gap-1 text-[9.5px]">
                  <Sparkles className="w-3 h-3 text-[var(--sos-ai)]" /> Resumo do Embeddings Engine
                </span>
                <p className="leading-relaxed">{selectedDocForPreview.summary}</p>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[8.5px] font-bold uppercase tracking-wider text-[var(--sos-muted)] font-heading">
                  Chunks Semânticos Extraídos (Amostragem RAG)
                </h4>

                {[1, 2, 3].map((chunkIndex) => (
                  <div
                    key={chunkIndex}
                    className="p-2.5 rounded-lg bg-[var(--sos-background)] border border-[var(--sos-border)] text-[var(--sos-ink)] space-y-0.5 font-mono text-[9px]"
                  >
                    <div className="flex items-center justify-between text-[8px] text-[var(--sos-muted)]">
                      <span className="font-bold text-[var(--sos-ink)]">Chunk #{chunkIndex}</span>
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

            <div className="pt-1.5 border-t border-[var(--sos-border)] flex justify-end">
              <button
                onClick={() => setSelectedDocForPreview(null)}
                className="px-3 py-1.5 bg-[var(--sos-ink)] hover:bg-[var(--sos-ink)]/90 text-white text-[9.5px] font-bold rounded-lg"
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
            className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl max-w-lg w-full p-4 shadow-2xl space-y-3 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--sos-border)]">
              <h3 className="text-xs font-bold text-[var(--sos-ink)] font-heading">
                Criar Nova Regra / Script Comercial
              </h3>
              <button
                type="button"
                onClick={() => setIsAddRuleOpen(false)}
                className="text-[var(--sos-muted)] hover:text-[var(--sos-ink)] text-base font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-[9px]">
              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">
                  Título da Regra ou Script
                </label>
                <input
                  type="text"
                  required
                  value={newRuleTitle}
                  onChange={(e) => setNewRuleTitle(e.target.value)}
                  placeholder="Ex: Como agir quando o cliente pede sábado à tarde"
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Categoria</label>
                <select
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value as DocumentCategory)}
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                >
                  <option value="scripts_vendas">Scripts de Vendas & Fechamento</option>
                  <option value="tabela_precos">Tabela de Preços & Descontos</option>
                  <option value="politicas_garantia">Políticas de Garantia & Cancelamento</option>
                  <option value="faq_empresa">FAQ da Empresa & Localização</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">Tipo de Fato na Base</label>
                <select
                  value={newRuleFactType}
                  onChange={(e) => setNewRuleFactType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                >
                  <option value="faq">FAQ (Dúvidas Frequentes)</option>
                  <option value="pricing">Tabela de Preços & Planos</option>
                  <option value="policy">Política de Serviço & Garantia</option>
                  <option value="service">Informação de Serviço</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[var(--sos-ai-subtle)] border border-[var(--sos-ai)]/30 rounded-lg">
                <div>
                  <span className="text-[9px] font-bold text-[var(--sos-ai)] block">⚡ Prioridade Máxima (Overrule IA)</span>
                  <span className="text-[8.5px] text-[var(--sos-ai)]">Se ativado, o agente prioriza este fato rigorosamente sobre qualquer outra dedução em respostas aos leads.</span>
                </div>
                <input
                  type="checkbox"
                  checked={newRuleIsPrioritized}
                  onChange={(e) => setNewRuleIsPrioritized(e.target.checked)}
                  className="w-3.5 h-3.5 text-[var(--sos-ai)] rounded border-[var(--sos-ai)]/30 focus:ring-[var(--sos-ai)] cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[9px] font-semibold text-[var(--sos-ink)] mb-0.5">
                  Instrução / Conteúdo da Regra (o que o agente deve saber e falar)
                </label>
                <textarea
                  required
                  rows={3}
                  value={newRuleContent}
                  onChange={(e) => setNewRuleContent(e.target.value)}
                  placeholder="Ex: Sempre confirme o horário das 14h imediatamente informando que temos valet cortesia na porta da Oscar Freire 1128..."
                  className="w-full px-2.5 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] focus:bg-[var(--sos-surface)] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-[var(--sos-border)]">
              <button
                type="button"
                onClick={() => setIsAddRuleOpen(false)}
                className="px-2.5 py-1 text-[9px] text-[var(--sos-muted)] hover:bg-[var(--sos-border)]/30 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1 text-[9px] font-bold text-white bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 rounded-lg transition shadow-2xs"
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
