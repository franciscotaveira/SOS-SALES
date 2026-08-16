import React, { useState, useEffect } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Key,
  Webhook,
  Plus,
  Copy,
  Check,
  Trash2,
  Play,
  Code2,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Lock,
  Layers,
  ArrowRight,
  Globe,
  Radio,
  CheckCircle2,
} from 'lucide-react';

export interface ApiKeyItem {
  id: string;
  name: string;
  tokenPrefix: string;
  fullToken: string;
  scopes: string[];
  environment: 'production' | 'test';
  createdAt: string;
  lastUsedAt: string;
}

export interface OutboundWebhookItem {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  status: 'active' | 'paused' | 'failed';
  successRate: string;
  lastDelivery: string;
}

interface ApiWebhooksManagerProps {
  workspace: Workspace;
}

const DEFAULT_API_KEYS: Record<string, ApiKeyItem[]> = {
  'ws-haven-beauty': [
    {
      id: 'key-haven-01',
      name: 'Integração ERP Trinks & Make',
      tokenPrefix: 'sos_live_haven_98a...',
      fullToken: 'sos_live_haven_98a72b14e590f11ac89d44e019a',
      scopes: ['read:conversations', 'write:messages', 'read:contacts'],
      environment: 'production',
      createdAt: '2026-02-15T10:00:00Z',
      lastUsedAt: 'Hoje às 08:30',
    },
  ],
  'ws-sos-sales-official': [
    {
      id: 'key-sos-01',
      name: 'AbacatePay & Data Pipeline',
      tokenPrefix: 'sos_live_mct_24x...',
      fullToken: 'sos_live_mct_24xf8912e741c900bb341e9981a',
      scopes: ['read:conversations', 'write:deals', 'read:metrics', 'export:analytics'],
      environment: 'production',
      createdAt: '2026-01-10T08:00:00Z',
      lastUsedAt: 'Hoje às 08:44',
    },
  ],
};

const DEFAULT_WEBHOOKS: Record<string, OutboundWebhookItem[]> = {
  'ws-haven-beauty': [
    {
      id: 'wh-haven-01',
      name: 'Webhook de Novos Agendamentos & Sinal Pix',
      url: 'https://webhook.site/haven-live-dispatch',
      secret: 'whsec_haven_secret_9921',
      events: ['deal.won', 'order.paid', 'message.received'],
      status: 'active',
      successRate: '99.8%',
      lastDelivery: '200 OK (Há 4 min)',
    },
  ],
  'ws-sos-sales-official': [
    {
      id: 'wh-sos-01',
      name: 'Pipeline de Leads Meta CAPI & Fechamentos',
      url: 'https://webhook.site/sos-sales-live-events',
      secret: 'whsec_sos_master_2026',
      events: ['lead.created', 'deal.won', 'sla.breached', 'message.sent'],
      status: 'active',
      successRate: '100%',
      lastDelivery: '200 OK (Há 1 min)',
    },
  ],
};

export const ApiWebhooksManager: React.FC<ApiWebhooksManagerProps> = ({ workspace }) => {
  const keysStorageKey = `sos_sales_apikeys_${workspace.id}`;
  const webhooksStorageKey = `sos_sales_webhooks_${workspace.id}`;

  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(() => {
    try {
      const saved = localStorage.getItem(keysStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_API_KEYS[workspace.id] || DEFAULT_API_KEYS['ws-haven-beauty'];
  });

  const [webhooks, setWebhooks] = useState<OutboundWebhookItem[]>(() => {
    try {
      const saved = localStorage.getItem(webhooksStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_WEBHOOKS[workspace.id] || DEFAULT_WEBHOOKS['ws-haven-beauty'];
  });

  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);

  // New Key Form State
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnv, setNewKeyEnv] = useState<'production' | 'test'>('production');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read:conversations', 'read:contacts']);

  // New Webhook Form State
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([
    'lead.created',
    'deal.won',
    'message.received',
  ]);

  // Test Dispatch state
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    statusCode: number;
    latencyMs: number;
    payloadSnippet: string;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(keysStorageKey, JSON.stringify(apiKeys));
    } catch {}
  }, [apiKeys, keysStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(webhooksStorageKey, JSON.stringify(webhooks));
    } catch {}
  }, [webhooks, webhooksStorageKey]);

  const handleCopyToken = (id: string, token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const fullToken = `sos_${newKeyEnv === 'production' ? 'live' : 'test'}_${workspace.id.replace('ws-', '')}_${randomSuffix}`;
    const tokenPrefix = `${fullToken.substring(0, 16)}...`;

    const newKey: ApiKeyItem = {
      id: `key-${Date.now()}`,
      name: newKeyName.trim(),
      tokenPrefix,
      fullToken,
      scopes: newKeyScopes,
      environment: newKeyEnv,
      createdAt: new Date().toISOString(),
      lastUsedAt: 'Nunca utilizada',
    };

    setApiKeys((prev) => [newKey, ...prev]);
    setIsKeyModalOpen(false);
    setNewKeyName('');
  };

  const handleDeleteKey = (id: string) => {
    if (confirm('Tem certeza que deseja revogar esta chave de API? Qualquer integração que use este token será interrompida.')) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    }
  };

  const handleCreateWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookName.trim() || !newWebhookUrl.trim()) return;

    const newWh: OutboundWebhookItem = {
      id: `wh-${Date.now()}`,
      name: newWebhookName.trim(),
      url: newWebhookUrl.trim(),
      secret: `whsec_${Math.random().toString(36).substring(2, 12)}`,
      events: newWebhookEvents,
      status: 'active',
      successRate: '100%',
      lastDelivery: 'Criado agora (Aguardando eventos)',
    };

    setWebhooks((prev) => [newWh, ...prev]);
    setIsWebhookModalOpen(false);
    setNewWebhookName('');
    setNewWebhookUrl('');
  };

  const handleDeleteWebhook = (id: string) => {
    if (confirm('Tem certeza que deseja remover este Webhook?')) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    }
  };

  const handleTestWebhook = (wh: OutboundWebhookItem) => {
    setTestingWebhookId(wh.id);
    setTestResult(null);

    setTimeout(() => {
      setTestingWebhookId(null);
      setTestResult({
        id: wh.id,
        statusCode: 200,
        latencyMs: Math.floor(Math.random() * 80) + 45,
        payloadSnippet: JSON.stringify(
          {
            event: 'lead.created',
            timestamp: new Date().toISOString(),
            workspace_id: workspace.id,
            data: {
              contact: {
                name: 'Cliente Exemplo',
                phone: '+55 49 98844-7562',
                origin: 'Meta Ads CTWA',
              },
              deal: {
                estimated_value: 150.0,
                status: 'in_negotiation',
              },
            },
          },
          null,
          2
        ),
      });
    }, 600);
  };

  return (
    <div id="api-webhooks-manager-view" className="space-y-8">
      {/* Top Overview Banner */}
      <div className="bg-slate-950 text-white border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Code2 className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-white font-heading">
              API REST & Webhooks de Integração Externa
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Conecte o SOS Sales com ERPs, CRMs externos, automações e extraia conversas, contatos e métricas em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsKeyModalOpen(true)}
            className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Gerar Chave de API</span>
          </button>

          <button
            onClick={() => setIsWebhookModalOpen(true)}
            className="py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Novo Webhook</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: API KEYS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-sm text-slate-900 font-heading">
              Chaves de Acesso à API (API Keys)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {apiKeys.length} {apiKeys.length === 1 ? 'chave ativa' : 'chaves ativas'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-3 px-4">Nome da Aplicação</th>
                  <th className="py-3 px-4">Token Secreto</th>
                  <th className="py-3 px-4">Ambiente</th>
                  <th className="py-3 px-4">Permissões (Scopes)</th>
                  <th className="py-3 px-4">Último Uso</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      Nenhuma chave de API gerada para este workspace.
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{k.name}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] text-slate-800 border border-slate-200">
                            {k.tokenPrefix}
                          </code>
                          <button
                            onClick={() => handleCopyToken(k.id, k.fullToken)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
                            title="Copiar token completo"
                          >
                            {copiedTokenId === k.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          k.environment === 'production'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {k.environment === 'production' ? 'PROD' : 'TEST'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {k.scopes.map((s, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500">{k.lastUsedAt}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteKey(k.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          title="Revogar chave"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 2: OUTBOUND WEBHOOKS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900 font-heading">
              Webhooks de Saída (Eventos em Tempo Real)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {webhooks.length} {webhooks.length === 1 ? 'webhook cadastrado' : 'webhooks cadastrados'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {webhooks.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs italic">
              Nenhum webhook cadastrado ainda. Cadastre um webhook para receber eventos de conversas e pedidos.
            </div>
          ) : (
            webhooks.map((wh) => (
              <div
                key={wh.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{wh.name}</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {wh.status.toUpperCase()}
                      </span>
                    </div>
                    <code className="text-[11px] text-slate-600 font-mono flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" /> {wh.url}
                    </code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTestWebhook(wh)}
                      disabled={testingWebhookId === wh.id}
                      className="py-1.5 px-3 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1.5"
                    >
                      <Play className={`w-3 h-3 ${testingWebhookId === wh.id ? 'animate-spin' : 'text-emerald-600'}`} />
                      <span>{testingWebhookId === wh.id ? 'Disparando...' : 'Testar Disparo'}</span>
                    </button>

                    <button
                      onClick={() => handleDeleteWebhook(wh.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      title="Excluir Webhook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500">Eventos Inscritos:</span>
                    {wh.events.map((ev, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span>Taxa de Entrega: <strong className="text-emerald-700">{wh.successRate}</strong></span>
                    <span>·</span>
                    <span>{wh.lastDelivery}</span>
                  </div>
                </div>

                {/* Test Result Box if tested */}
                {testResult && testResult.id === wh.id && (
                  <div className="mt-3 bg-slate-900 text-white rounded-xl p-3.5 font-mono text-xs space-y-2 border border-slate-800 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-slate-800">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Disparo Concluído: {testResult.statusCode} OK
                      </span>
                      <span>Latência: {testResult.latencyMs}ms</span>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Payload JSON Enviado:</div>
                      <pre className="text-[11px] text-slate-300 overflow-x-auto p-2 bg-slate-950 rounded-lg">
                        {testResult.payloadSnippet}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* SECTION 3: QUICK REST EXTRACTION DOCS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-600" />
          <h3 className="font-bold text-sm text-slate-900 font-heading">
            Guia Rápido de Extração de Dados (REST API & cURL)
          </h3>
        </div>

        <p className="text-xs text-slate-600">
          Você pode extrair dados programaticamente para planilhas, BI, banco de dados ou pipelines com uma simples requisição HTTP:
        </p>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-bold text-slate-700 mb-1">1. Extrair Conversas & Funil de Vendas</div>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-xs font-mono overflow-x-auto select-all">
{`curl -X GET "https://crm.iaparavendas.tech/api/v1/cockpit/conversations" \\
  -H "Authorization: Bearer ${apiKeys[0]?.fullToken || 'sos_live_token'}" \\
  -H "Content-Type: application/json"`}
            </pre>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-700 mb-1">2. Extrair Métricas de Faturamento & Meta CAPI</div>
            <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl text-xs font-mono overflow-x-auto select-all">
{`curl -X GET "https://crm.iaparavendas.tech/api/v1/metrics/traffic-proof" \\
  -H "Authorization: Bearer ${apiKeys[0]?.fullToken || 'sos_live_token'}" \\
  -H "Content-Type: application/json"`}
            </pre>
          </div>
        </div>
      </div>

      {/* MODAL: Criar Chave de API */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 font-heading">
                  Gerar Nova Chave de API
                </h3>
              </div>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome / Aplicação de Uso</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Ex: Integração PowerBI / Zapier"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Ambiente</label>
                <select
                  value={newKeyEnv}
                  onChange={(e) => setNewKeyEnv(e.target.value as 'production' | 'test')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="production">Produção (Live Data)</option>
                  <option value="test">Testes / Sandbox</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Permissões (Scopes)</label>
                <div className="space-y-1.5 text-xs text-slate-700">
                  {['read:conversations', 'write:messages', 'read:contacts', 'read:metrics', 'export:analytics'].map((scope) => (
                    <label key={scope} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) setNewKeyScopes([...newKeyScopes, scope]);
                          else setNewKeyScopes(newKeyScopes.filter((s) => s !== scope));
                        }}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-mono text-[11px]">{scope}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-2xs"
                >
                  Criar Chave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Criar Webhook */}
      {isWebhookModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Webhook className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 font-heading">
                  Cadastrar Webhook de Saída
                </h3>
              </div>
              <button onClick={() => setIsWebhookModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome de Identificação</label>
                <input
                  type="text"
                  required
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  placeholder="Ex: Disparo para ERP de Vendas"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">URL do Endpoint de Destino</label>
                <input
                  type="url"
                  required
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://seu-sistema.com/api/webhooks/sos"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Eventos para Notificar</label>
                <div className="space-y-1.5 text-xs text-slate-700">
                  {['lead.created', 'message.received', 'message.sent', 'deal.won', 'order.paid', 'sla.breached'].map((ev) => (
                    <label key={ev} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newWebhookEvents.includes(ev)}
                        onChange={(e) => {
                          if (e.target.checked) setNewWebhookEvents([...newWebhookEvents, ev]);
                          else setNewWebhookEvents(newWebhookEvents.filter((item) => item !== ev));
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-mono text-[11px]">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWebhookModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs"
                >
                  Salvar Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
