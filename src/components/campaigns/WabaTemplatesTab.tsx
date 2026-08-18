import React, { useState, useEffect, useCallback } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  HelpCircle,
  Eye,
  Check,
  X
} from 'lucide-react';

interface WabaTemplatesTabProps {
  workspace: Workspace;
}

export const WabaTemplatesTab: React.FC<WabaTemplatesTabProps> = ({ workspace }) => {
  const [templates, setTemplates] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  // New Template Form
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'MARKETING' | 'UTILITY' | 'AUTHENTICATION'>('MARKETING');
  const [tplLanguage, setTplLanguage] = useState('pt_BR');
  const [tplHeader, setTplHeader] = useState('');
  const [tplBody, setTplBody] = useState('Olá {{1}}! Passando para confirmar seu atendimento agendado para {{2}}. Podemos confirmar?');
  const [tplFooter, setTplFooter] = useState('');
  const [tplButtonType, setTplButtonType] = useState<'NONE' | 'QUICK_REPLY' | 'URL'>('QUICK_REPLY');
  const [tplButtonText, setTplButtonText] = useState('Confirmar Presença');
  const [tplButtonUrl, setTplButtonUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates`);
      const data = await res.json();
      if (data.templates && Array.isArray(data.templates)) {
        setTemplates(data.templates);
      }
    } catch {
      setErrorFeedback('Não foi possível carregar os templates da Meta.');
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim() || !tplBody.trim()) {
      setTplError('Nome e corpo do template são obrigatórios.');
      return;
    }
    setSubmitting(true);
    setTplError(null);
    try {
      const buttons: Array<any> = [];
      if (tplButtonType === 'QUICK_REPLY' && tplButtonText.trim()) {
        buttons.push({ type: 'QUICK_REPLY', text: tplButtonText.trim() });
      } else if (tplButtonType === 'URL' && tplButtonText.trim() && tplButtonUrl.trim()) {
        buttons.push({ type: 'URL', text: tplButtonText.trim(), url: tplButtonUrl.trim() });
      }

      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/create-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          category: tplCategory,
          language: tplLanguage,
          bodyText: tplBody.trim(),
          headerText: tplHeader.trim() || undefined,
          footerText: tplFooter.trim() || undefined,
          buttons: buttons.length > 0 ? buttons : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback('Modelo enviado com sucesso para aprovação na Meta!');
        setCreateModalOpen(false);
        setTplName('');
        setTplBody('');
        setTplHeader('');
        setTplFooter('');
        setTimeout(() => setActionFeedback(null), 4000);
        fetchTemplates();
      } else {
        setTplError(data.error || 'Erro ao submeter template na Meta.');
      }
    } catch (err: any) {
      setTplError(err.message || 'Falha de rede ao submeter template.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (templateName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o modelo "${templateName}" diretamente da sua conta Meta? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates/${templateName}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback(`Modelo "${templateName}" excluído com sucesso!`);
        setTimeout(() => setActionFeedback(null), 3000);
        fetchTemplates();
      } else {
        setErrorFeedback(data.error || 'Erro ao excluir modelo.');
        setTimeout(() => setErrorFeedback(null), 4000);
      }
    } catch {
      setErrorFeedback('Falha de conexão ao excluir modelo.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 font-heading">
                Modelos de Reativação & Templates WABA (HSM)
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                Oficial Meta
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Crie modelos para reengajar clientes após a janela de 24h ou disparar confirmações automáticas com zero risco de bloqueio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setTplError(null);
              setCreateModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Criar Novo Modelo</span>
          </button>

          <button
            onClick={fetchTemplates}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Sincronizando...' : 'Sincronizar Meta'}</span>
          </button>

          <a
            href="https://business.facebook.com/wa/manage/message-templates/"
            target="_blank"
            rel="noreferrer"
            className="p-2 text-slate-400 hover:text-purple-600 border border-slate-200 rounded-xl hover:bg-purple-50 transition"
            title="Abrir no Gerenciador Meta Business Suite"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Feedbacks */}
      {actionFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {errorFeedback && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>{errorFeedback}</span>
        </div>
      )}

      {/* Educational Guide: 24h window vs HSM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-900 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Janela de 24h Ativa (Conversas em Andamento)</span>
          </div>
          <p className="text-[11.5px] text-emerald-800 leading-relaxed">
            Quando o cliente envia uma mensagem, você tem 24h de mensagens livres e gratuitas. Operadores e IA podem conversar normalmente sem templates.
          </p>
        </div>

        <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-2 text-blue-900 font-bold">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Janela Expirada (+24h) ou Reativação</span>
          </div>
          <p className="text-[11.5px] text-blue-800 leading-relaxed">
            Após 24h sem resposta do lead, o contato só pode ser retomado via <strong>Modelos Aprovados pela Meta</strong>. Assim que o cliente responder ao modelo, a janela de 24h se reabre automaticamente.
          </p>
        </div>
      </div>

      {/* Templates List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Modelos Sincronizados ({templates.length})
          </h3>
          <span className="text-xs text-slate-400">
            Modelos com status "Aprovado" aparecem prontos para uso no Cockpit.
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
            <span>Consultando modelos homologados na Meta Cloud API...</span>
          </div>
        ) : templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl: any) => {
              const isApproved = tpl.status === 'APPROVED';
              const isPending = tpl.status === 'PENDING';
              const isRejected = tpl.status === 'REJECTED';

              const headerComp = tpl.components?.find((c: any) => c.type === 'HEADER');
              const bodyComp = tpl.components?.find((c: any) => c.type === 'BODY');
              const footerComp = tpl.components?.find((c: any) => c.type === 'FOOTER');
              const buttonComp = tpl.components?.find((c: any) => c.type === 'BUTTONS');

              const varMatches = (bodyComp?.text || '').match(/\{\{\d+\}\}/g) || [];

              return (
                <div
                  key={`${tpl.name}-${tpl.language}`}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs hover:shadow-sm transition-all space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">{tpl.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                            {tpl.language || 'pt_BR'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 capitalize">
                          Categoria: {tpl.category?.toLowerCase() || 'marketing'}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
                          isApproved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isPending
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : isRejected
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {isPending && <Clock className="w-3 h-3 text-amber-600" />}
                        {isRejected && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                        <span>{isApproved ? 'Aprovado na Meta' : isPending ? 'Em Análise' : isRejected ? 'Rejeitado' : tpl.status}</span>
                      </span>
                    </div>

                    {/* WhatsApp Preview Bubble */}
                    <div className="bg-[#e5ddd5] rounded-xl p-3.5 shadow-inner">
                      <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 shadow-xs space-y-1 text-xs">
                        {headerComp?.text && (
                          <p className="font-bold text-slate-900 text-[11px]">{headerComp.text}</p>
                        )}
                        <p className="text-slate-800 text-[11.5px] leading-relaxed whitespace-pre-wrap">
                          {bodyComp?.text || '<sem texto no corpo>'}
                        </p>
                        {footerComp?.text && (
                          <p className="text-[10px] text-slate-500 pt-0.5">{footerComp.text}</p>
                        )}
                        {buttonComp?.buttons && (
                          <div className="pt-1.5 border-t border-[#b2dfb0] space-y-1">
                            {buttonComp.buttons.map((btn: any, bi: number) => (
                              <div
                                key={bi}
                                className="text-center text-[11px] font-bold text-[#0084ff] py-0.5"
                              >
                                {btn.text}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-right text-[9px] text-slate-400">18:30 ✓✓</div>
                      </div>
                    </div>

                    {varMatches.length > 0 && (
                      <p className="text-[10.5px] text-slate-500 flex items-center gap-1 font-mono">
                        <span className="font-bold text-purple-700">{varMatches.length} variável(is) dinâmica(s):</span> {varMatches.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[10.5px] text-slate-400">ID Meta: {tpl.id || 'Graph-API'}</span>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.name)}
                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer flex items-center gap-1"
                      title="Excluir modelo na Meta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[11px]">Excluir</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Nenhum modelo cadastrado ainda</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Crie seu primeiro modelo de reativação ou confirmação. Ele será submetido e homologado pela Meta em instantes.
              </p>
            </div>
            <button
              onClick={() => {
                setTplError(null);
                setCreateModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition cursor-pointer"
            >
              + Criar Primeiro Modelo
            </button>
          </div>
        )}
      </div>

      {/* Modal: Create Template */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 font-heading">
                  Novo Modelo de Mensagem WABA (Meta)
                </h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {tplError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{tplError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTemplate} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Modelo (Identificador Técnico)</label>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="ex: reativacao_lead_24h / confirmacao_agenda"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
                <span className="text-[10px] text-slate-400">Apenas letras minúsculas, números e sublinhados (_).</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoria Meta</label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                  >
                    <option value="MARKETING">Marketing (Reengajamento / Oferta)</option>
                    <option value="UTILITY">Utilidade (Lembrete / Agendamento)</option>
                    <option value="AUTHENTICATION">Autenticação (Código / 2FA)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Idioma</label>
                  <select
                    value={tplLanguage}
                    onChange={(e) => setTplLanguage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none bg-white font-mono"
                  >
                    <option value="pt_BR">pt_BR (Português Brasil)</option>
                    <option value="es">es (Espanhol)</option>
                    <option value="en_US">en_US (Inglês EUA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cabeçalho (Opcional)</label>
                <input
                  type="text"
                  value={tplHeader}
                  onChange={(e) => setTplHeader(e.target.value)}
                  placeholder="ex: Confirmação de Horário Especial"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Corpo da Mensagem (Texto Principal)</label>
                <textarea
                  rows={4}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  placeholder="Digite o texto. Use {{1}}, {{2}} para variáveis de nome, serviço, data..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none resize-none leading-relaxed"
                  required
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>Ex: Olá {`{{1}}`}, seu atendimento está marcado para {`{{2}}`}.</span>
                  <span>{tplBody.length} caracteres</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Rodapé (Opcional)</label>
                <input
                  type="text"
                  value={tplFooter}
                  onChange={(e) => setTplFooter(e.target.value)}
                  placeholder="ex: Responda 'SAIR' para cancelar"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              {/* Interactive Buttons */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block font-bold text-slate-700">Botão Interativo (Opcional)</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTplButtonType('NONE')}
                    className={`py-1.5 px-2 rounded-lg border text-center font-bold ${
                      tplButtonType === 'NONE' ? 'bg-white border-purple-500 text-purple-900 shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Sem Botão
                  </button>
                  <button
                    type="button"
                    onClick={() => setTplButtonType('QUICK_REPLY')}
                    className={`py-1.5 px-2 rounded-lg border text-center font-bold ${
                      tplButtonType === 'QUICK_REPLY' ? 'bg-white border-purple-500 text-purple-900 shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Resposta Rápida
                  </button>
                  <button
                    type="button"
                    onClick={() => setTplButtonType('URL')}
                    className={`py-1.5 px-2 rounded-lg border text-center font-bold ${
                      tplButtonType === 'URL' ? 'bg-white border-purple-500 text-purple-900 shadow-xs' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Link Externo
                  </button>
                </div>

                {tplButtonType !== 'NONE' && (
                  <div className="pt-2 space-y-2">
                    <input
                      type="text"
                      value={tplButtonText}
                      onChange={(e) => setTplButtonText(e.target.value)}
                      placeholder="Texto do botão (ex: Confirmar Presença)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    {tplButtonType === 'URL' && (
                      <input
                        type="url"
                        value={tplButtonUrl}
                        onChange={(e) => setTplButtonUrl(e.target.value)}
                        placeholder="URL de destino (https://...)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Submetendo na Meta...' : 'Submeter para Aprovação'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
