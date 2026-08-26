import React, { useState, useEffect, useCallback } from 'react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
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
  X,
  Sparkles,
  Zap,
  Smartphone,
  Layers,
} from 'lucide-react';

interface WabaTemplatesTabProps {
  workspace: Workspace;
}

export interface OfficialTemplatePreset {
  id: string;
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  header: string;
  body: string;
  buttonType: 'QUICK_REPLY' | 'URL';
  buttonText: string;
  buttonUrl?: string;
  badge: string;
  description: string;
}

export const OFFICIAL_WABA_PRESETS: OfficialTemplatePreset[] = [
  {
    id: 'confirmacao_agenda_v1',
    name: 'confirmacao_agenda_v1',
    category: 'UTILITY',
    header: 'Confirmação de Atendimento',
    body: 'Olá {{1}}! Passando para confirmar seu atendimento agendado para {{2}} às {{3}}. Podemos confirmar sua presença?',
    buttonType: 'QUICK_REPLY',
    buttonText: 'Confirmar Presença',
    badge: '📅 Agendamento (Modelo Sugerido)',
    description: 'Utility: confirmação rápida com botão interativo para blindar a agenda e evitar no-show.',
  },
  {
    id: 'lembrete_2h_atendimento_v1',
    name: 'lembrete_2h_atendimento_v1',
    category: 'UTILITY',
    header: 'Seu Horário é Hoje',
    body: 'Olá {{1}}! Lembramos que seu atendimento está marcado para hoje às {{2}} na unidade {{3}}. Estamos prontos para te receber!',
    buttonType: 'QUICK_REPLY',
    buttonText: 'Estou a Caminho',
    badge: '⏰ Lembrete 2h (Modelo Sugerido)',
    description: 'Utility: aviso prévio no dia do atendimento com confirmação de deslocamento.',
  },
  {
    id: 'reativacao_lead_esfriado_v1',
    name: 'reativacao_lead_esfriado_v1',
    category: 'MARKETING',
    header: 'Condição Especial VIP',
    body: 'Olá {{1}}, tudo bem? Notamos seu interesse recente em nossos serviços. Preparamos uma condição exclusiva com vagas limitadas para esta semana. Deseja conferir os horários disponíveis?',
    buttonType: 'QUICK_REPLY',
    buttonText: 'Quero Ver Horários',
    badge: '🔥 Reativação 24h (Modelo Sugerido)',
    description: 'Marketing: reabre janela de 24h com oferta exclusiva e personalizada.',
  },
  {
    id: 'oferta_relampago_vip_v1',
    name: 'oferta_relampago_vip_v1',
    category: 'MARKETING',
    header: 'Apenas Hoje',
    body: 'Olá {{1}}! Liberamos 3 vagas promocionais com 20% de desconto para atendimentos agendados ainda hoje. Deseja garantir sua vaga?',
    buttonType: 'QUICK_REPLY',
    buttonText: 'Garantir com Desconto',
    badge: '🏷️ Oferta VIP (Modelo Sugerido)',
    description: 'Marketing: ativação imediata com gatilho de escassez e urgência.',
  },
  {
    id: 'pesquisa_satisfacao_nps_v2',
    name: 'pesquisa_satisfacao_nps_v2',
    category: 'MARKETING',
    header: 'Como foi sua Experiência?',
    body: 'Olá {{1}}, tudo bem? Agradecemos sua visita hoje na Haven! Como você avalia o atendimento no seu procedimento de {{2}} realizado com a nossa equipe?',
    buttonType: 'QUICK_REPLY',
    buttonText: 'Excelente Atendimento',
    badge: '⭐ Pesquisa NPS (Modelo Sugerido)',
    description: 'Marketing: coleta de satisfação pós-venda em 1 clique.',
  },
];

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

  const handleApplyPreset = (preset: OfficialTemplatePreset) => {
    setTplName(preset.name);
    setTplCategory(preset.category);
    setTplLanguage('pt_BR');
    setTplHeader(preset.header);
    setTplBody(preset.body);
    setTplFooter('');
    setTplButtonType(preset.buttonType);
    setTplButtonText(preset.buttonText);
    setTplButtonUrl(preset.buttonUrl || '');
    setTplError(null);
    setCreateModalOpen(true);
  };

  const [wabaConnected, setWabaConnected] = useState<boolean | null>(null);
  const [wabaPhone, setWabaPhone] = useState<string>('');

  const checkWabaStatus = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/channel-info`);
      if (res.ok) {
        const data = await res.json();
        setWabaConnected(Boolean(data.configured && data.accountStatus === 'CONNECTED'));
        setWabaPhone(data.phoneNumber || data.phone || '');
      } else {
        setWabaConnected(false);
      }
    } catch {
      setWabaConnected(false);
    }
  }, [workspace.id]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates`);
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
    checkWabaStatus();
    fetchTemplates();
  }, [checkWabaStatus, fetchTemplates]);

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

      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/create-template`, {
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
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates/${templateName}`, {
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
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      {/* Top Header */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center border border-[var(--sos-ai)]/20 shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-[var(--sos-ink)]">
                Modelos de Reativação & Templates WABA (HSM)
              </h2>
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30">
                Oficial Meta
              </span>
            </div>
            <p className="text-[9.5px] text-[var(--sos-muted)] mt-0.5">
              Crie modelos para reengajar clientes após a janela de 24h ou disparar confirmações automáticas com zero risco de bloqueio.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setTplError(null);
              setCreateModalOpen(true);
            }}
            className="px-3 py-1.5 text-[9.5px] font-bold text-white bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>+ Criar Novo Modelo</span>
          </button>

          <button
            onClick={fetchTemplates}
            disabled={loading}
            className="px-3 py-1.5 text-[9.5px] font-bold text-[var(--sos-ink)] bg-[var(--sos-border)]/30 hover:bg-[var(--sos-border)]/50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Sincronizando...' : 'Sincronizar Meta'}</span>
          </button>

          <a
            href="https://business.facebook.com/wa/manage/message-templates/"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 text-[var(--sos-muted)] hover:text-[var(--sos-ai)] border border-[var(--sos-border)] rounded-lg hover:bg-[var(--sos-ai-subtle)] transition"
            title="Abrir no Gerenciador Meta Business Suite"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* WABA Integrity Status Banner */}
      {wabaConnected === false && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Canal WhatsApp Oficial (WABA) Desconectado</p>
            <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
              Para criar, sincronizar e aprovar modelos de mensagem (HSM) diretamente na Meta, conecte seu número oficial em <span className="font-bold">Configurações &gt; Canais</span>. As instâncias via WhatsApp Web (WAHA) não exigem aprovação de modelos HSM.
            </p>
          </div>
        </div>
      )}

      {wabaConnected === true && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-300/60 rounded-xl text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold text-[11px]">Canal WABA Conectado: {wabaPhone || 'Meta Cloud API Ativa'}</span>
          </div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md">Templates sincronizados em tempo real</span>
        </div>
      )}

      {/* Feedbacks */}
      {actionFeedback && (
        <div className="p-2.5 bg-[var(--sos-success-subtle)] border border-[var(--sos-success)]/30 rounded-lg text-[9.5px] font-bold text-[var(--sos-success)] flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--sos-success)]" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {errorFeedback && (
        <div className="p-2.5 bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 rounded-lg text-[9.5px] font-bold text-[var(--sos-danger)] flex items-center gap-1.5 animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--sos-danger)]" />
          <span>{errorFeedback}</span>
        </div>
      )}

      {/* Educational Guide: 24h window vs HSM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-3 bg-[var(--sos-success-subtle)] border border-[var(--sos-success)]/30 rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--sos-success)] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--sos-success)]" />
            <span>Janela de 24h Ativa (Conversas em Andamento)</span>
          </div>
          <p className="text-[9.5px] text-[var(--sos-success)] leading-relaxed">
            Quando o cliente envia uma mensagem, você tem 24h de mensagens livres e gratuitas. Operadores e IA podem conversar normalmente sem templates.
          </p>
        </div>

        <div className="p-3 bg-[var(--sos-operational-subtle)] border border-[var(--sos-operational)]/30 rounded-lg space-y-1">
          <div className="flex items-center gap-1.5 text-[var(--sos-operational)] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--sos-operational)]" />
            <span>Janela Expirada (+24h) ou Reativação</span>
          </div>
          <p className="text-[9.5px] text-[var(--sos-operational)] leading-relaxed">
            Após 24h sem resposta do lead, o contato só pode ser retomado via <strong>Modelos Aprovados pela Meta</strong>. Assim que o cliente responder ao modelo, a janela de 24h se reabre automaticamente.
          </p>
        </div>
      </div>

      {/* Presets Gallery: Modelos Prontos para Homologação e Teste */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
              <Sparkles className="w-3 h-3" />
            </div>
            <h3 className="text-xs font-bold text-[var(--sos-ink)]">
              Biblioteca de Modelos Prontos para Validação na Meta (1-Clique)
            </h3>
          </div>
          <span className="text-[9px] text-[var(--sos-muted)]">
            Clique para carregar e submeter diretamente para homologação
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {OFFICIAL_WABA_PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="p-3 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg hover:border-[var(--sos-ai)]/40 hover:shadow-2xs transition flex flex-col justify-between gap-2"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--sos-ink)] flex items-center gap-1">
                    {preset.badge}
                  </span>
                  <span
                    className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      preset.category === 'UTILITY'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {preset.category}
                  </span>
                </div>
                <p className="text-[9px] text-[var(--sos-muted)] leading-tight">
                  {preset.description}
                </p>
                <div className="bg-[var(--sos-surface)] p-2 rounded border border-[var(--sos-border)] text-[8.5px] text-[var(--sos-ink)] font-mono leading-tight line-clamp-2">
                  {preset.body}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="w-full py-1 text-[9.5px] font-bold text-[var(--sos-ai)] bg-[var(--sos-ai-subtle)] hover:bg-[var(--sos-ai)] hover:text-white rounded-md transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Usar este Modelo</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Templates List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[var(--sos-ink)]">
            Modelos Sincronizados ({templates.length})
          </h3>
          <span className="text-[9px] text-[var(--sos-muted)]">
            Modelos com status "Aprovado" aparecem prontos para uso no Cockpit.
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-[var(--sos-surface)] rounded-xl border border-[var(--sos-border)] text-[var(--sos-muted)] text-xs flex flex-col items-center justify-center gap-1.5">
            <RefreshCw className="w-4.5 h-4.5 animate-spin text-[var(--sos-ai)]" />
            <span>Consultando modelos homologados na Meta Cloud API...</span>
          </div>
        ) : templates.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg p-4 shadow-2xs hover:shadow-sm transition-all space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9.5px] font-bold text-[var(--sos-ink)]">{tpl.name}</span>
                          <span className="text-[8.5px] font-mono text-[var(--sos-muted)] px-1.5 py-0.5 bg-[var(--sos-border)]/30 rounded">
                            {tpl.language || 'pt_BR'}
                          </span>
                        </div>
                        <p className="text-[9px] text-[var(--sos-muted)] mt-0.5 capitalize">
                          Categoria: {tpl.category?.toLowerCase() || 'marketing'}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 ${
                          isApproved
                            ? 'bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border-[var(--sos-success)]/30'
                            : isPending
                            ? 'bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border-[var(--sos-warning)]/30'
                            : isRejected
                            ? 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border-[var(--sos-danger)]/30'
                            : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)] border-[var(--sos-border)]'
                        }`}
                      >
                        {isApproved && <CheckCircle2 className="w-2.5 h-2.5 text-[var(--sos-success)]" />}
                        {isPending && <Clock className="w-2.5 h-2.5 text-[var(--sos-warning)]" />}
                        {isRejected && <AlertTriangle className="w-2.5 h-2.5 text-[var(--sos-danger)]" />}
                        <span>{isApproved ? 'Aprovado na Meta' : isPending ? 'Em Análise' : isRejected ? 'Rejeitado' : tpl.status}</span>
                      </span>
                    </div>

                    {/* WhatsApp Preview Bubble */}
                    <div className="bg-[var(--sos-canvas)] rounded-lg p-2.5 shadow-inner">
                      <div className="bg-[var(--sos-success-subtle)] rounded-lg rounded-tl-none p-2.5 shadow-2xs space-y-1 text-[9.5px]">
                        {headerComp?.text && (
                          <p className="font-bold text-[var(--sos-ink)] text-[10px]">{headerComp.text}</p>
                        )}
                        <p className="text-[var(--sos-ink)] text-[10px] leading-relaxed whitespace-pre-wrap">
                          {bodyComp?.text || '<sem texto no corpo>'}
                        </p>
                        {footerComp?.text && (
                          <p className="text-[9px] text-[var(--sos-muted)] pt-0.5">{footerComp.text}</p>
                        )}
                        {buttonComp?.buttons && (
                          <div className="pt-1 border-t border-[var(--sos-success)]/30 space-y-0.5">
                            {buttonComp.buttons.map((btn: any, bi: number) => (
                              <div
                                key={bi}
                                className="text-center text-[10px] font-bold text-[var(--sos-action)] py-0.5"
                              >
                                {btn.text}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-right text-[8.5px] text-[var(--sos-muted)]">18:30 ✓✓</div>
                      </div>
                    </div>

                    {varMatches.length > 0 && (
                      <p className="text-[9px] text-[var(--sos-muted)] flex items-center gap-0.5 font-mono">
                        <span className="font-bold text-[var(--sos-ai)]">{varMatches.length} variável(is) dinâmica(s):</span> {varMatches.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-[var(--sos-border)] text-xs">
                    <span className="text-[9px] text-[var(--sos-muted)]">ID Meta: {tpl.id || 'Graph-API'}</span>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.name)}
                      className="text-[var(--sos-muted)] hover:text-[var(--sos-danger)] p-1 rounded-lg hover:bg-[var(--sos-danger-subtle)] transition cursor-pointer flex items-center gap-0.5"
                      title="Excluir modelo na Meta"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="text-[9.5px]">Excluir</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-[var(--sos-surface)] rounded-xl border border-dashed border-[var(--sos-border)] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center mx-auto">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--sos-ink)]">Nenhum modelo cadastrado ainda</h4>
              <p className="text-[9.5px] text-[var(--sos-muted)] max-w-md mx-auto mt-0.5">
                Crie seu primeiro modelo de reativação ou confirmação. Ele será submetido e homologado pela Meta em instantes.
              </p>
            </div>
            <button
              onClick={() => {
                setTplError(null);
                setCreateModalOpen(true);
              }}
              className="px-3 py-1.5 text-[9.5px] font-bold text-white bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 rounded-lg transition cursor-pointer"
            >
              + Criar Primeiro Modelo
            </button>
          </div>
        )}
      </div>

      {/* Modal: Create Template */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-[var(--sos-surface)] rounded-xl max-w-lg w-full p-5 shadow-2xl border border-[var(--sos-border)] max-h-[90vh] overflow-y-auto space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-bold text-[var(--sos-ink)]">
                  Novo Modelo de Mensagem WABA (Meta)
                </h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-[var(--sos-muted)] hover:text-[var(--sos-ink)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {tplError && (
              <div className="p-2.5 bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 text-[var(--sos-danger)] rounded-lg text-[9.5px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--sos-danger)] shrink-0" />
                <span>{tplError}</span>
              </div>
            )}

            {/* Preset Selector inside Create Modal */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
              <span className="text-[9.5px] font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Preencher a partir de um Modelo Pronto Oficial:
              </span>
              <div className="flex flex-wrap gap-1">
                {OFFICIAL_WABA_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setTplName(p.name);
                      setTplCategory(p.category);
                      setTplHeader(p.header);
                      setTplBody(p.body);
                      setTplButtonType(p.buttonType);
                      setTplButtonText(p.buttonText);
                      setTplButtonUrl(p.buttonUrl || '');
                    }}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 rounded text-[9px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>{p.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCreateTemplate} className="space-y-3 text-[9.5px]">
              <div>
                <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Nome do Modelo (Identificador Técnico)</label>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="ex: reativacao_lead_24h / confirmacao_agenda"
                  className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 font-mono text-xs focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                  required
                />
                <span className="text-[8.5px] text-[var(--sos-muted)]">Apenas letras minúsculas, números e sublinhados (_).</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Categoria Meta</label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                  >
                    <option value="MARKETING">Marketing (Reengajamento / Oferta)</option>
                    <option value="UTILITY">Utilidade (Lembrete / Agendamento)</option>
                    <option value="AUTHENTICATION">Autenticação (Código / 2FA)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Idioma</label>
                  <select
                    value={tplLanguage}
                    onChange={(e) => setTplLanguage(e.target.value)}
                    className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none font-mono"
                  >
                    <option value="pt_BR">pt_BR (Português Brasil)</option>
                    <option value="es">es (Espanhol)</option>
                    <option value="en_US">en_US (Inglês EUA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Cabeçalho (Opcional)</label>
                <input
                  type="text"
                  value={tplHeader}
                  onChange={(e) => setTplHeader(e.target.value)}
                  placeholder="ex: Confirmação de Horário Especial"
                  className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Corpo da Mensagem (Texto Principal)</label>
                <textarea
                  rows={4}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  placeholder="Digite o texto. Use {{1}}, {{2}} para variáveis de nome, serviço, data..."
                  className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none resize-none leading-relaxed"
                  required
                />
                <div className="flex items-center justify-between text-[8.5px] text-[var(--sos-muted)] mt-0.5">
                  <span>Ex: Olá {`{{1}}`}, seu atendimento está marcado para {`{{2}}`}.</span>
                  <span>{tplBody.length} caracteres</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--sos-ink)] mb-0.5">Rodapé (Opcional)</label>
                <input
                  type="text"
                  value={tplFooter}
                  onChange={(e) => setTplFooter(e.target.value)}
                  placeholder="ex: Responda 'SAIR' para cancelar"
                  className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                />
              </div>

              {/* Interactive Buttons */}
              <div className="p-2.5 bg-[var(--sos-border)]/30 border border-[var(--sos-border)] rounded-lg space-y-2">
                <label className="block font-bold text-[var(--sos-ink)]">Botão Interativo (Opcional)</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTplButtonType('NONE')}
                    className={`py-1 px-1.5 rounded-lg border text-center font-bold text-[9px] ${
                      tplButtonType === 'NONE'
                        ? 'bg-[var(--sos-surface)] border-[var(--sos-ai)]/30 text-[var(--sos-ai)] shadow-2xs'
                        : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)]'
                    }`}
                  >
                    Sem Botão
                  </button>
                  <button
                    type="button"
                    onClick={() => setTplButtonType('QUICK_REPLY')}
                    className={`py-1 px-1.5 rounded-lg border text-center font-bold text-[9px] ${
                      tplButtonType === 'QUICK_REPLY'
                        ? 'bg-[var(--sos-surface)] border-[var(--sos-ai)]/30 text-[var(--sos-ai)] shadow-2xs'
                        : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)]'
                    }`}
                  >
                    Resposta Rápida
                  </button>
                  <button
                    type="button"
                    onClick={() => setTplButtonType('URL')}
                    className={`py-1 px-1.5 rounded-lg border text-center font-bold text-[9px] ${
                      tplButtonType === 'URL'
                        ? 'bg-[var(--sos-surface)] border-[var(--sos-ai)]/30 text-[var(--sos-ai)] shadow-2xs'
                        : 'bg-[var(--sos-border)]/30 text-[var(--sos-muted)]'
                    }`}
                  >
                    Link Externo
                  </button>
                </div>

                {tplButtonType !== 'NONE' && (
                  <div className="pt-1.5 space-y-1.5">
                    <input
                      type="text"
                      value={tplButtonText}
                      onChange={(e) => setTplButtonText(e.target.value)}
                      placeholder="Texto do botão (ex: Confirmar Presença)"
                      className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                    />
                    {tplButtonType === 'URL' && (
                      <input
                        type="url"
                        value={tplButtonUrl}
                        onChange={(e) => setTplButtonUrl(e.target.value)}
                        placeholder="URL de destino (https://...)"
                        className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-ai)] outline-none"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-1.5 pt-2 border-t border-[var(--sos-border)]">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 text-[9.5px] font-bold text-[var(--sos-ink)] bg-[var(--sos-border)]/30 hover:bg-[var(--sos-border)]/50 rounded-lg transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-1.5 text-[9.5px] font-bold text-white bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 rounded-lg transition flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
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