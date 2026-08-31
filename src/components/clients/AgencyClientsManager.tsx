import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Users,
  Sparkles,
  ArrowRight,
  Shield,
  ShieldCheck,
  ExternalLink,
  Sliders,
  Bot,
  Zap,
  Filter,
  Layers,
  Flame,
  Check,
  X,
  Loader2,
  Copy,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { Workspace, Channel } from '../../types/cockpit';

interface AgencyClientsManagerProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (ws: Workspace) => void;
  onCreateWorkspace?: (workspaceData: {
    name: string;
    businessType: 'hair_salon' | 'auto_film' | 'general_services';
    tagline: string;
    ownerEmail: string;
    whatsappNumber: string;
    provider: 'waba' | 'waha';
  }) => Promise<void>;
  onNavigateTab?: (tab: any, subTab?: string) => void;
  onDeactivateWorkspace?: (workspace: Workspace) => Promise<void>;
}

export const AgencyClientsManager: React.FC<AgencyClientsManagerProps> = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onCreateWorkspace,
  onNavigateTab,
  onDeactivateWorkspace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'hair_salon' | 'auto_film' | 'general_services'>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'connected' | 'disconnected'>('all');
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State for New Client
  const [newName, setNewName] = useState('');
  const [newBusinessType, setNewBusinessType] = useState<'hair_salon' | 'auto_film' | 'general_services'>('general_services');
  const [newTagline, setNewTagline] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newWhatsappNumber, setNewWhatsappNumber] = useState('');
  const [newProvider, setNewProvider] = useState<'waba' | 'waha'>('waba');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [workspacePendingDeactivation, setWorkspacePendingDeactivation] = useState<Workspace | null>(null);
  const [deactivationConfirmation, setDeactivationConfirmation] = useState('');
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Filtered Workspaces
  const filteredWorkspaces = useMemo(() => {
    return workspaces.filter((ws) => {
      const matchesSearch =
        ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ws.tagline && ws.tagline.toLowerCase().includes(searchQuery.toLowerCase())) ||
        ws.channels.some((c) => c.phoneNumber.includes(searchQuery));

      const matchesType =
        selectedTypeFilter === 'all' || ws.businessType === selectedTypeFilter;

      const hasConnectedChannel = ws.channels.some((c) => c.health === 'connected' || c.health === 'healthy');
      const matchesStatus =
        selectedStatusFilter === 'all' ||
        (selectedStatusFilter === 'connected' && hasConnectedChannel) ||
        (selectedStatusFilter === 'disconnected' && !hasConnectedChannel);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [workspaces, searchQuery, selectedTypeFilter, selectedStatusFilter]);

  // Aggregate Stats
  const totalClients = workspaces.length;
  const connectedChannelsCount = workspaces.reduce(
    (acc, ws) => acc + ws.channels.filter((c) => c.health === 'connected' || c.health === 'healthy').length,
    0
  );
  const totalOperatorsCount = workspaces.reduce((acc, ws) => acc + (ws.activeOperatorCount || 1), 0);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setSubmitError('Por favor, informe o nome da empresa.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (onCreateWorkspace) {
        await onCreateWorkspace({
          name: newName.trim(),
          businessType: newBusinessType,
          tagline: newTagline.trim() || `Operação comercial dedicada para ${newName.trim()}`,
          ownerEmail: newOwnerEmail.trim(),
          whatsappNumber: newWhatsappNumber.trim(),
          provider: newProvider,
        });
      }
      setSubmitSuccess(true);
      setTimeout(() => {
        setIsNewClientModalOpen(false);
        setSubmitSuccess(false);
        // Reset form
        setNewName('');
        setNewTagline('');
        setNewOwnerEmail('');
        setNewWhatsappNumber('');
      }, 1200);
    } catch (err: any) {
      setSubmitError(err?.message || 'Falha ao provisionar nova conta de cliente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeactivation = async () => {
    const workspace = workspacePendingDeactivation;
    if (!workspace || !onDeactivateWorkspace) return;
    if (deactivationConfirmation.trim() !== workspace.name) {
      setDeactivationError('Digite o nome completo da empresa para confirmar.');
      return;
    }
    setIsDeactivating(true);
    setDeactivationError(null);
    try {
      await onDeactivateWorkspace(workspace);
      setWorkspacePendingDeactivation(null);
      setDeactivationConfirmation('');
    } catch (error) {
      setDeactivationError(error instanceof Error ? error.message : 'Não foi possível desativar esta conta.');
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div id="agency-clients-manager" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00a884]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-4 z-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#00a884] to-emerald-500 text-white flex items-center justify-center font-bold text-xl shadow-lg shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white font-heading tracking-tight">
                Gestão de Clientes & Sub-contas
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/40 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Matriz SOS Sales Sovereign
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Painel central para visualizar workspaces confirmados pelo backend. Criação de subcontas e conexão de WhatsApp exigem contratos operacionais próprios.
            </p>
          </div>
        </div>

        {/* Primary Action: New Client Button */}
        <div className="z-10 shrink-0">
          <button
            id="btn-open-new-client-modal"
            onClick={() => setIsNewClientModalOpen(true)}
            className="w-full sm:w-auto px-5 py-3 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#00a884]/20 flex items-center justify-center gap-2 cursor-pointer group"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
            <span>Criar Nova Conta de Cliente</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Empresas</span>
            <div className="text-2xl font-extrabold text-white font-mono">{totalClients}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Canais WhatsApp Conectados</span>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">{connectedChannelsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Smartphone className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Operadores Ativos</span>
            <div className="text-2xl font-extrabold text-purple-400 font-mono">{totalOperatorsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, telefone ou nicho..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-start md:justify-end">
          {/* Segment Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedTypeFilter === 'all' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos os Nichos
            </button>
            <button
              onClick={() => setSelectedTypeFilter('hair_salon')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedTypeFilter === 'hair_salon' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Beleza & Spa
            </button>
            <button
              onClick={() => setSelectedTypeFilter('auto_film')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedTypeFilter === 'auto_film' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Automotivo
            </button>
            <button
              onClick={() => setSelectedTypeFilter('general_services')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedTypeFilter === 'general_services' ? 'bg-[#00a884] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Serviços B2B
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedStatusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Status: Todos
            </button>
            <button
              onClick={() => setSelectedStatusFilter('connected')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedStatusFilter === 'connected' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Online
            </button>
            <button
              onClick={() => setSelectedStatusFilter('disconnected')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                selectedStatusFilter === 'disconnected' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Offline
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Client Workspaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWorkspaces.map((ws) => {
          const isSelected = ws.id === currentWorkspace.id;
          const mainChannel = ws.channels[0];
          const isOnline = mainChannel && (mainChannel.health === 'connected' || mainChannel.health === 'healthy');
          const isMatriz = ws.id === 'ws-sos-sales-official' || ws.slug?.includes('sos-sales') || ws.tier === 'agency';

          const segmentLabel =
            ws.businessType === 'hair_salon'
              ? '💅 Salão, Esmalteria & Spa'
              : ws.businessType === 'auto_film'
              ? '🚗 Películas & Estética Automotiva'
              : '🏢 Serviços Gerais & Clínicas';

          return (
            <div
              key={ws.id}
              className={`bg-slate-900 border rounded-2xl p-5 shadow-md flex flex-col justify-between transition-all group relative overflow-hidden ${
                isSelected
                  ? 'border-[#00a884] ring-1 ring-[#00a884]/40 bg-slate-900/95'
                  : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
              }`}
            >
              {/* Active Workspace Banner */}
              {isSelected && (
                <div className="absolute top-0 right-0 px-3 py-0.5 bg-[#00a884] text-white text-[9.5px] font-bold rounded-bl-lg tracking-wider uppercase flex items-center gap-1 shadow-sm">
                  <Check className="w-2.5 h-2.5" /> Workspace Ativo no Cockpit
                </div>
              )}

              {/* Card Header */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base shadow-sm shrink-0 ${
                      isMatriz
                        ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                        : isSelected
                        ? 'bg-[#00a884] text-white'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {ws.name.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-[#00a884] transition-colors">
                        {ws.name}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                      {segmentLabel}
                    </p>
                  </div>
                </div>

                {/* Tagline / Positioning */}
                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                  {ws.tagline || 'Operação comercial de alta performance com IA especialista.'}
                </p>

                {/* Meta details list */}
                <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
                  {/* WhatsApp Channel Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-slate-500" /> WhatsApp:
                    </span>
                    {mainChannel ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                          }`}
                        />
                        <span className="font-mono text-[11px] text-slate-200">
                          {mainChannel.phoneNumber}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber-400">Pendente de Conexão</span>
                    )}
                  </div>

                  {/* Engine & Operators */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" /> Time & Licenças:
                    </span>
                    <span className="text-slate-300 font-medium">
                      {ws.activeOperatorCount || 1} atendentes
                    </span>
                  </div>

                  {/* Slug / Identifier */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-500" /> ID do Workspace:
                    </span>
                    <button
                      onClick={() => handleCopy(ws.id, ws.id)}
                      className="font-mono text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      title="Copiar ID"
                    >
                      <span>{ws.id.substring(0, 14)}...</span>
                      {copiedId === ws.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Footer / Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                {isSelected ? (
                  <button
                    onClick={() => onNavigateTab?.('agora')}
                    className="flex-1 py-2 px-3 bg-[#00a884]/20 hover:bg-[#00a884]/30 text-[#00a884] border border-[#00a884]/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Flame className="w-3.5 h-3.5 text-[#00a884]" />
                    <span>Ir para Cockpit Agora</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectWorkspace(ws)}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-[#00a884] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer group-hover:bg-[#00a884]"
                  >
                    <span>Acessar Este Cliente</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => {
                    onSelectWorkspace(ws);
                    onNavigateTab?.('playbook', 'company');
                  }}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
                  title="Calibrar Dados & IA do Cliente"
                >
                  <Bot className="w-4 h-4 text-purple-400" />
                </button>
                {!isSelected && onDeactivateWorkspace && (
                  <button
                    onClick={() => {
                      setWorkspacePendingDeactivation(ws);
                      setDeactivationConfirmation('');
                      setDeactivationError(null);
                    }}
                    className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-800/70 transition-colors cursor-pointer"
                    title="Desativar cliente sem apagar histórico"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Criação de Novo Cliente / Empresa */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00a884]/20 border border-[#00a884]/30 flex items-center justify-center text-[#00a884]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Criar Nova Conta de Cliente</h2>
                  <p className="text-xs text-slate-400">Provisione uma nova empresa vinculada à agência</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewClientModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error / Success Toast */}
            {submitError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Workspace confirmado pelo backend.</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
              {/* Nome da Empresa */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome da Empresa / Fantasia *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Clínica Sorriso VIP ou Estética Bella"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884]"
                  autoFocus
                />
              </div>

              {/* Nicho / Segmento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Segmento de Atuação
                  </label>
                  <select
                    value={newBusinessType}
                    onChange={(e) => setNewBusinessType(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#00a884]"
                  >
                    <option value="hair_salon">💅 Salão, Esmalteria & Spa</option>
                    <option value="auto_film">🚗 Películas & Estética Automotiva</option>
                    <option value="general_services">🏢 Serviços Gerais, Clínicas & B2B</option>
                  </select>
                </div>

                {/* WhatsApp Engine */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Motor de WhatsApp
                  </label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#00a884]"
                  >
                    <option value="waba">Meta WABA Oficial (Cloud API v23.0)</option>
                    <option value="waha">WhatsApp Web (WAHA Local)</option>
                  </select>
                </div>
              </div>

              {/* WhatsApp Number & Owner Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Telefone WhatsApp do Cliente
                  </label>
                  <input
                    type="text"
                    value={newWhatsappNumber}
                    onChange={(e) => setNewWhatsappNumber(e.target.value)}
                    placeholder="+55 49 98800-0000"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    E-mail de referência do cliente
                  </label>
                  <input
                    type="email"
                    value={newOwnerEmail}
                    onChange={(e) => setNewOwnerEmail(e.target.value)}
                    placeholder="contato@empresa.com.br"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884]"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">A agência continua proprietária até o convite de acesso ser concluído.</p>
                </div>
              </div>

              {/* Tagline / Posicionamento */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Posicionamento / Tagline Resumida
                </label>
                <input
                  type="text"
                  value={newTagline}
                  onChange={(e) => setNewTagline(e.target.value)}
                  placeholder="Ex: Referência em implantes e estética dental em Chapecó."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00a884]"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold shadow-lg shadow-[#00a884]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Provisionando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Criar Conta de Cliente</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {workspacePendingDeactivation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <section className="w-full max-w-md rounded-2xl border border-rose-900/70 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300"><AlertCircle className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-bold text-white">Desativar cliente?</h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">A conta sairá da operação ativa e não poderá receber ou disparar mensagens. Jornadas, mensagens e evidências permanecem preservadas.</p>
              </div>
            </div>
            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-slate-300">Digite <span className="normal-case text-rose-300">{workspacePendingDeactivation.name}</span> para confirmar</label>
            <input
              value={deactivationConfirmation}
              onChange={(event) => setDeactivationConfirmation(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-rose-500"
              autoFocus
            />
            {deactivationError && <p className="mt-2 text-xs text-rose-300">{deactivationError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setWorkspacePendingDeactivation(null)} disabled={isDeactivating} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">Cancelar</button>
              <button onClick={() => void confirmDeactivation()} disabled={isDeactivating} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{isDeactivating ? 'Desativando…' : 'Desativar conta'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
