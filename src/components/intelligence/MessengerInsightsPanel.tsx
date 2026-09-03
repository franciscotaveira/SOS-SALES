import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Instagram,
  Share2,
  TrendingUp,
  ShieldCheck,
  Zap,
  Sparkles,
  Link2,
  Copy,
  Check,
  QrCode,
  Eye,
  Bot,
  Brain,
  MessageCircle,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface MessengerInsightsPanelProps {
  workspace: Workspace;
}

interface MmeLink {
  id: string;
  pageName: string;
  refCode: string;
  fullUrl: string;
  label?: string;
  clickCount: number;
  createdAt: string;
}

interface InsightMetric {
  metricName: string;
  date: string;
  value: number;
}

export const MessengerInsightsPanel: React.FC<MessengerInsightsPanelProps> = ({ workspace }) => {
  const [links, setLinks] = useState<MmeLink[]>([]);
  const [metrics, setMetrics] = useState<InsightMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Link Form State
  const [pageName, setPageName] = useState('');
  const [refCode, setRefCode] = useState('');
  const [label, setLabel] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // NLP State
  const [nlpEnabled, setNlpEnabled] = useState<boolean | null>(null);
  const [isTogglingNlp, setIsTogglingNlp] = useState(false);

  // Private Reply Keywords State
  const [privateReplyEnabled, setPrivateReplyEnabled] = useState<boolean | null>(null);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [replyTemplate, setReplyTemplate] = useState('');
  const [isSavingPrivateReply, setIsSavingPrivateReply] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadLinks();
    loadInsights();
    loadChannelConfig();
  }, [workspace.id]);

  const loadChannelConfig = async (): Promise<boolean> => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/messenger/config`);
      if (!res.ok) throw new Error(`Configuração Meta indisponível (HTTP ${res.status})`);
      const data = await res.json();
      const nlp = data?.nlp;
      const privateReply = data?.privateReply;
      setNlpEnabled(typeof nlp?.enabled === 'boolean' ? nlp.enabled : false);
      setPrivateReplyEnabled(typeof privateReply?.enabled === 'boolean' ? privateReply.enabled : false);
      setKeywordsInput(Array.isArray(privateReply?.keywords) ? privateReply.keywords.join(', ') : '');
      setReplyTemplate(typeof privateReply?.replyTemplate === 'string' ? privateReply.replyTemplate : '');
      return true;
    } catch (error) {
      // Fail closed: unknown provider state is never presented as active.
      setNlpEnabled(null);
      setPrivateReplyEnabled(null);
      setKeywordsInput('');
      setReplyTemplate('');
      setConfigError(error instanceof Error ? error.message : 'Não foi possível consultar a configuração Meta.');
      return false;
    } finally {
      setConfigLoading(false);
    }
  };

  const loadLinks = async () => {
    setLinksError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/messenger/links`);
      if (!res.ok) throw new Error(`Links m.me indisponíveis (HTTP ${res.status})`);
      const data = await res.json();
      setLinks(Array.isArray(data) ? data : []);
    } catch (error) {
      setLinks([]);
      setLinksError(error instanceof Error ? error.message : 'Não foi possível carregar os links m.me.');
    }
  };

  const loadInsights = async () => {
    setIsLoading(true);
    setInsightsError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/messenger/insights`);
      if (!res.ok) throw new Error(`Insights Meta indisponíveis (HTTP ${res.status})`);
      const data = await res.json();
      setMetrics(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      setMetrics([]);
      setInsightsError(error instanceof Error ? error.message : 'Não foi possível carregar os insights Meta.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refCode) return;
    setIsCreatingLink(true);
    setActionError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/messenger/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageName, refCode, label }),
      });
      if (!res.ok) throw new Error(`Não foi possível criar o link (HTTP ${res.status})`);
      setRefCode('');
      setLabel('');
      await loadLinks();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível criar o link m.me.');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleToggleNlp = async () => {
    if (nlpEnabled === null) return;
    setIsTogglingNlp(true);
    setActionError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/messenger/nlp/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !nlpEnabled }),
      });
      if (!res.ok) throw new Error(`Não foi possível alterar o NLP (HTTP ${res.status})`);
      const data = await res.json().catch(() => null);
      setNlpEnabled(typeof data?.enabled === 'boolean' ? data.enabled : !nlpEnabled);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível alterar o NLP.');
    } finally {
      setIsTogglingNlp(false);
    }
  };

  const handleSavePrivateReplyConfig = async () => {
    if (privateReplyEnabled === null) return;
    setIsSavingPrivateReply(true);
    setActionError(null);
    setSaveSuccess(false);
    try {
      const keywords = keywordsInput.split(',').map((k) => k.trim()).filter(Boolean);
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/comments/private-reply-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: privateReplyEnabled,
          keywords,
          replyTemplate,
        }),
      });
      if (!res.ok) throw new Error(`Não foi possível salvar Private Reply (HTTP ${res.status})`);
      const refreshed = await loadChannelConfig();
      if (!refreshed) throw new Error('O servidor aceitou a alteração, mas a confirmação da configuração falhou.');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível salvar Private Reply.');
    } finally {
      setIsSavingPrivateReply(false);
    }
  };

  const copyLink = async (url: string, id: string) => {
    setActionError(null);
    try {
      if (!navigator.clipboard) throw new Error('A área de transferência não está disponível neste navegador.');
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível copiar a URL.');
    }
  };

  // Aggregated totals
  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);
  const metaConfigStatus = configLoading ? 'CONSULTANDO' : configError ? 'NÃO CONFIRMADO' : 'CONFIRMADO';
  const nlpStatus = configLoading
    ? 'CONSULTANDO'
    : nlpEnabled === null
      ? 'NÃO CONFIRMADO'
      : nlpEnabled
        ? 'ATIVO'
        : 'PAUSADO';
  const panelError = actionError || configError || linksError || insightsError;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/30 via-purple-900/20 to-slate-900/40 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Meta Messaging
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" /> Wit.ai: {nlpStatus}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Meta Messaging Ecosystem (Messenger & Instagram Direct)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Rastreamento omnicanal, conversão de comentários em DMs privadas, extração semântica com NLP e links <code className="text-blue-400 font-mono">m.me</code>.
            </p>
          </div>
          <button
            onClick={loadInsights}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Sincronizar Insights
          </button>
        </div>
      </div>

      {panelError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{panelError}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Links m.me Ativos</span>
            <Link2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{linksError ? 'NÃO CONSULTADO' : links.length}</div>
          <p className="text-xs text-slate-500 mt-1">{linksError ? 'Falha na leitura do backend' : `${totalClicks} cliques totais registrados`}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Built-in NLP (Wit.ai)</span>
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${nlpEnabled === true ? 'text-emerald-400' : 'text-slate-400'}`}>
              {nlpStatus}
            </span>
            <span className={`w-2 h-2 rounded-full ${nlpEnabled === true ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Extração automática de data, valor e intenção</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Private Replies</span>
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {configLoading ? 'CONSULTANDO' : privateReplyEnabled === null ? 'NÃO CONFIRMADO' : privateReplyEnabled ? 'AUTOMÁTICO' : 'DESATIVADO'}
          </div>
          <p className="text-xs text-slate-500 mt-1">Comentários → DM no Messenger/IG</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Configuração Meta</span>
            <ShieldCheck className={`w-4 h-4 ${configError ? 'text-rose-400' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-bold ${!configLoading && !configError ? 'text-emerald-400' : 'text-slate-400'}`}>
            {metaConfigStatus}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {configError ? 'O backend não confirmou esta configuração.' : 'Configuração lida do backend; saúde do webhook é verificada na tela de Canais.'}
          </p>
        </div>
      </div>

      {/* Main Grid: Left = m.me Links & QR, Right = NLP & Private Replies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: m.me Link Builder & List */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-400" />
              <h3 className="text-base font-semibold text-white">Gerador de Links m.me Rastreáveis</h3>
            </div>
            <span className="text-xs text-slate-400">Atribuição de Criativo & Canal</span>
          </div>

          <form onSubmit={handleCreateLink} className="space-y-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Nome de Usuário da Page</label>
                <input
                  type="text"
                  value={pageName}
                  onChange={(e) => setPageName(e.target.value)}
                  placeholder="ex: haven.escovaria"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Código de Referência (ref)</label>
                <input
                  type="text"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  placeholder="ex: PROMO_INSTA_STORY"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">Rótulo / Descrição da Campanha</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex: Anúncio Stories - Escova Modelada R$ 59"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isCreatingLink || !refCode}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" /> Criar Link Rastreável m.me
            </button>
          </form>

          {/* Links List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Links Ativos ({links.length})</h4>
            {links.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Nenhum link gerado ainda. Crie seu primeiro link acima.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {links.map((link) => (
                  <div key={link.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{link.label || link.refCode}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {link.refCode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{link.fullUrl}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-slate-300 bg-slate-800 px-2 py-1 rounded-md">
                        {link.clickCount} clicks
                      </span>
                      <button
                        onClick={() => void copyLink(link.fullUrl, link.id)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                        title="Copiar URL"
                      >
                        {copiedId === link.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Private Replies & NLP Config */}
        <div className="space-y-6">
          {/* Private Replies Settings */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-white">Private Replies (Comentários → Direct)</h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={privateReplyEnabled === true}
                  onChange={(e) => setPrivateReplyEnabled(e.target.checked)}
                  disabled={configLoading}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Quando alguém comenta palavras de intenção de compra nas suas publicações ou anúncios do Facebook/Instagram, o SOS-SALES inicia imediatamente uma conversa privada no Messenger ou DM.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Palavras-chave Gatilho (separadas por vírgula)</label>
                <input
                  type="text"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Template da Mensagem Privada</label>
                <textarea
                  rows={2}
                  value={replyTemplate}
                  onChange={(e) => setReplyTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-500">Use {'{{name}}'} para personalizar com o nome do usuário.</span>
              </div>
              <button
                onClick={handleSavePrivateReplyConfig}
                disabled={isSavingPrivateReply || configLoading || privateReplyEnabled === null}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                {saveSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <Zap className="w-4 h-4" />}
                {saveSuccess ? 'Configuração Salva!' : 'Salvar Gatilhos de Resposta Privada'}
              </button>
            </div>
          </div>

          {/* Built-in NLP Wit.ai Card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-semibold text-white">Meta Built-in NLP (Wit.ai)</h3>
              </div>
              <button
                onClick={handleToggleNlp}
                disabled={isTogglingNlp || configLoading || nlpEnabled === null}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  nlpEnabled === true
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {nlpEnabled === null ? 'Estado não confirmado pela API' : nlpEnabled ? 'Ativado no Meta' : 'Desativado'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              O modelo de linguagem da Meta pré-processa mensagens recebidas no Messenger/Instagram sem custo adicional de LLM, identificando horários, valores em dinheiro e sentimentos.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-purple-400 font-mono font-semibold">wit$datetime</span>
                <p className="text-slate-400 text-[11px] mt-0.5">Identifica agendamentos: "amanhã às 14h"</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-emerald-400 font-mono font-semibold">wit$amount_of_money</span>
                <p className="text-slate-400 text-[11px] mt-0.5">Extrai orçamentos: "posso pagar R$ 150"</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-blue-400 font-mono font-semibold">wit$sentiment</span>
                <p className="text-slate-400 text-[11px] mt-0.5">Mede humor do cliente: positivo/negativo</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-amber-400 font-mono font-semibold">wit$greetings</span>
                <p className="text-slate-400 text-[11px] mt-0.5">Detecta saudações e encerramentos</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
