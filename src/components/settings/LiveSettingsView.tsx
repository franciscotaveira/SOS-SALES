import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Smartphone,
  Clock,
  Users,
  CheckCircle2,
  Shield,
  QrCode,
  RefreshCw,
  Crown,
  Loader2,
  Wifi,
  WifiOff,
  ShieldCheck,
  Zap,
  Radio,
  UserPlus,
  Trash2,
  FileText,
  Bot,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { EmbeddedSignupModal } from './EmbeddedSignupModal';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { WabaTemplatesTab } from '../campaigns/WabaTemplatesTab';
import { AiRuntimeSettingsView } from './AiRuntimeSettingsView';
import { MetaBusinessAgentSettingsView } from './MetaBusinessAgentSettingsView';

interface LiveSettingsViewProps {
  workspace: Workspace;
  activeSubTab?: string;
  onChangeSubTab?: (subTab: string) => void;
}

interface WorkspaceMember {
  membershipId: string;
  userId: string;
  role: 'owner' | 'operator' | 'viewer';
  createdAt: string;
  isCurrentActor: boolean;
  email?: string | null;
}

function normalizeTab(tab: string): 'canais' | 'ia' | 'sla' | 'membros' {
  if (tab === 'channels' || tab === 'canais') return 'canais';
  if (tab === 'sla') return 'sla';
  if (tab === 'ia') return 'ia';
  if (tab === 'membros') return 'membros';
  return 'canais';
}

const roleLabel: Record<WorkspaceMember['role'], string> = {
  owner: 'Proprietário',
  operator: 'Operador',
  viewer: 'Visualização',
};

export const LiveSettingsView: React.FC<LiveSettingsViewProps> = ({
  workspace,
  activeSubTab = 'canais',
  onChangeSubTab,
}) => {
  const [currentTab, setCurrentTab] = useState(() => normalizeTab(activeSubTab));
  const [firstResponseMins, setFirstResponseMins] = useState<number | null>(null);
  const [slaState, setSlaState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [savedSlaToast, setSavedSlaToast] = useState(false);
  const [slaError, setSlaError] = useState<string | null>(null);
  const [isSavingSla, setIsSavingSla] = useState(false);
  const [isEmbeddedModalOpen, setIsEmbeddedModalOpen] = useState(false);

  // Live QR Code Modal state
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<'INITIAL' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'>('INITIAL');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [showWahaFallback, setShowWahaFallback] = useState(false);
  const [showWabaTemplates, setShowWabaTemplates] = useState(false);
  const [wabaChannel, setWabaChannel] = useState<{
    state: 'loading' | 'connected' | 'unconfigured' | 'error';
    phoneNumber?: string | null;
    verifiedName?: string | null;
  }>({ state: 'loading' });
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersState, setMembersState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'operator' | 'viewer'>('operator');
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ code: string; email: string; expiresAt: string } | null>(null);

  const handleTabChange = (tab: string) => {
    const normalized = normalizeTab(tab);
    setCurrentTab(normalized);
    onChangeSubTab?.(normalized);
  };

  useEffect(() => {
    setCurrentTab(normalizeTab(activeSubTab));
  }, [activeSubTab]);

  const handleSaveSla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (firstResponseMins === null || !Number.isFinite(firstResponseMins) || firstResponseMins < 1) {
      setSlaError('Informe um tempo de SLA válido antes de salvar.');
      return;
    }
    setIsSavingSla(true);
    setSlaError(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/operational-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slaPolicy: { firstResponseMinutes: firstResponseMins } }),
      });
      if (!response.ok) throw new Error('Não foi possível salvar a política de SLA.');
      const payload = await response.json();
      const persistedValue = payload?.data?.slaPolicy?.firstResponseMinutes;
      if (typeof persistedValue !== 'number') throw new Error('O servidor não devolveu a política de SLA persistida.');
      setFirstResponseMins(persistedValue);
      setSlaState('ready');
      setSavedSlaToast(true);
      setTimeout(() => setSavedSlaToast(false), 3000);
    } catch (error) {
      setSlaError(error instanceof Error ? error.message : 'Não foi possível salvar a política de SLA.');
    } finally {
      setIsSavingSla(false);
    }
  };

  useEffect(() => {
    setSlaState('loading');
    setSlaError(null);
    authenticatedFetch(`/api/v1/workspaces/${workspace.id}/operational-settings`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Não foi possível consultar a política de SLA.');
        return payload;
      })
      .then((payload) => {
        const value = payload?.data?.slaPolicy?.firstResponseMinutes;
        if (typeof value !== 'number') throw new Error('A política de SLA ainda não foi configurada neste workspace.');
        setFirstResponseMins(value);
        setSlaState('ready');
      })
      .catch((error) => {
        setFirstResponseMins(null);
        setSlaState('error');
        setSlaError(error instanceof Error ? error.message : 'Não foi possível consultar a política de SLA.');
      });
  }, [workspace.id]);

  const loadMembers = useCallback(async () => {
    setMembersState('loading');
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/members`);
      if (!response.ok) throw new Error('Não foi possível consultar os membros do workspace.');
      const payload = await response.json();
      setMembers(Array.isArray(payload?.data) ? payload.data : []);
      setMembersState('ready');
    } catch {
      setMembersState('error');
    }
  }, [workspace.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setMemberActionError(null);
    setIsSavingMember(true);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/member-invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Não foi possível adicionar este operador.');
      }
      const payload = await response.json();
      setCreatedInvite({ code: payload.data.code, email: payload.data.email, expiresAt: payload.data.expiresAt });
      setMemberEmail('');
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Não foi possível adicionar este operador.');
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!window.confirm(`Remover o acesso de ${member.email || 'este operador'}?`)) return;
    setMemberActionError(null);
    setRemovingMembershipId(member.membershipId);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/members/${member.membershipId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Não foi possível remover este operador.');
      }
      await loadMembers();
    } catch (error) {
      setMemberActionError(error instanceof Error ? error.message : 'Não foi possível remover este operador.');
    } finally {
      setRemovingMembershipId(null);
    }
  };

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/channel-info`)
      .then(async (res) => {
        if (res.status === 404) return { configured: false };
        if (!res.ok) throw new Error('Não foi possível consultar o canal oficial.');
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setWabaChannel(data?.configured && data?.credentialsAvailable === true
          ? { state: 'connected', phoneNumber: data.phoneNumber, verifiedName: data.verifiedName }
          : { state: 'unconfigured' });
      })
      .catch(() => {
        if (active) setWabaChannel({ state: 'error' });
      });
    return () => { active = false; };
  }, [workspace.id]);

  useEffect(() => {
    if (!showWahaFallback) return;
    authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/status`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status) {
          setQrStatus(data.status);
        }
      })
      .catch(() => undefined);
  }, [workspace.id, showWahaFallback]);

  const fetchQrCode = async () => {
    setIsQrLoading(true);
    setQrError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/qr`);
      if (!res.ok) {
        throw new Error('Não foi possível obter o QR Code do canal.');
      }
      const data = await res.json();
      setQrStatus(data.status || data.engineStatus || 'INITIAL');
      if (data.qr || data.qrCodeDataUrl) {
        setQrCodeDataUrl(data.qr || data.qrCodeDataUrl);
      }
    } catch (err: any) {
      setQrError(err.message || 'Falha ao conectar com o serviço de WhatsApp.');
    } finally {
      setIsQrLoading(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isQrModalOpen) {
      fetchQrCode();
      interval = setInterval(() => {
        if (qrStatus !== 'WORKING') {
          fetchQrCode();
        }
      }, 5000);
    } else {
      setQrCodeDataUrl(null);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isQrModalOpen]);

  return (
    <div className="flex flex-col h-full bg-slate-50/50 text-slate-900 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-950 font-heading tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-600" /> Configurações Soberanas
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            WhatsApp, IA, tempo de resposta e equipe em uma única configuração essencial.
          </p>
        </div>

        {/* Sub-tabs pills */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
          <button
            onClick={() => handleTabChange('canais')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'canais'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> Canais WhatsApp
          </button>
          <button
            onClick={() => handleTabChange('ia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'ia'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> Atendimento com IA
          </button>
          <button
            onClick={() => handleTabChange('sla')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'sla'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Regras de SLA
          </button>
          <button
            onClick={() => handleTabChange('membros')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'membros'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Operadores & Time
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-5 flex-1">
        {currentTab === 'ia' && <AiRuntimeSettingsView workspaceId={workspace.id} />}
        {currentTab === 'canais' && (
          <div className="max-w-4xl space-y-4">
            {/* Meta WABA Official Cloud API Card */}
            <div className="p-5 bg-white border-2 border-emerald-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#00a884] to-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">WhatsApp Oficial Meta · Cloud API (WABA)</h3>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold border flex items-center gap-1 ${
                      wabaChannel.state === 'connected'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : wabaChannel.state === 'error'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {wabaChannel.state === 'connected' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3" />}
                      {wabaChannel.state === 'connected' ? 'Configuração registrada' : wabaChannel.state === 'loading' ? 'Consultando...' : wabaChannel.state === 'error' ? 'Status indisponível' : 'Configuração pendente'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {wabaChannel.state === 'connected'
                      ? `Credenciais registradas no backend: ${wabaChannel.phoneNumber || 'número não informado'}${wabaChannel.verifiedName ? ` · ${wabaChannel.verifiedName}` : ''}. A conectividade atual deve ser validada por uma consulta Meta.`
                      : <>Onboarding via <strong>Embedded Signup</strong>. Conecte o número oficial para começar a receber e responder conversas.</>}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEmbeddedModalOpen(true)}
                className="px-4 py-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Zap className="w-4 h-4 text-white" />
                {wabaChannel.state === 'connected' ? 'Gerenciar conexão oficial' : 'Conectar WhatsApp oficial'}
              </button>
            </div>

            {wabaChannel.state === 'connected' && (
              <button
                type="button"
                onClick={() => setShowWabaTemplates((visible) => !visible)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs text-slate-600 transition hover:bg-slate-50"
                aria-expanded={showWabaTemplates}
              >
                <span className="inline-flex items-center gap-2 font-bold text-slate-900"><FileText size={14} /> Modelos aprovados da Meta</span>
                <span className="ml-2">{showWabaTemplates ? 'Ocultar' : 'Gerenciar templates para mensagens fora da janela de 24 horas'}</span>
              </button>
            )}

            {showWabaTemplates && wabaChannel.state === 'connected' && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <WabaTemplatesTab workspace={workspace} />
              </div>
            )}

            <MetaBusinessAgentSettingsView workspaceId={workspace.id} canManage={workspace.operatorRole === 'owner'} />

            {!showWahaFallback ? (
              <button
                type="button"
                onClick={() => setShowWahaFallback(true)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs text-slate-600 hover:bg-slate-50 transition"
              >
                Precisa usar WhatsApp Web como alternativa? <span className="font-bold text-slate-900">Abrir conexão WAHA</span>
              </button>
            ) : (
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Canal Secundário · WhatsApp Web (WAHA)</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border flex items-center gap-1 ${
                      qrStatus === 'WORKING'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {qrStatus === 'WORKING' ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3 text-amber-600" />}
                      {qrStatus === 'WORKING' ? 'Conectado / Online' : 'Aguardando Pareamento'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Instância multi-device para o workspace <strong className="text-slate-800">{workspace.name}</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsQrModalOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <QrCode className="w-4 h-4" />
                {qrStatus === 'WORKING' ? 'Reconectar / QR Code' : 'Conectar via QR Code'}
              </button>
            </div>
            )}
          </div>
        )}

        {currentTab === 'sla' && (
          <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-0.5 font-heading">Metas de Tempo de Resposta e Conversão</h2>
            <p className="text-xs text-slate-500 mb-5">
              Gatilhos automáticos para alertar e acionar handoff se o lead aguardar sem resposta.
            </p>

            {savedSlaToast && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">Políticas de SLA salvas com sucesso no banco de dados!</span>
              </div>
            )}
            {slaError && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{slaError}</p>}

            <form onSubmit={handleSaveSla} className="space-y-4">
              {slaState === 'loading' && <p className="text-xs text-slate-500">Consultando a política persistida...</p>}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Tempo Máximo para Primeiro Atendimento (Minutos)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={firstResponseMins ?? ''}
                  onChange={(e) => setFirstResponseMins(e.target.value ? Number(e.target.value) : null)}
                  disabled={slaState === 'loading'}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-2xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Recomendado para CTWA (Click to WhatsApp Ads): 5 a 15 minutos.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingSla || slaState === 'loading' || firstResponseMins === null}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  {isSavingSla ? 'Salvando...' : 'Salvar SLA de primeira resposta'}
                </button>
              </div>
            </form>
          </div>
        )}

        {currentTab === 'membros' && (
          <div className="max-w-4xl space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Acessos do workspace</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Papéis e acessos persistidos para esta empresa. Status online e perfis pessoais não são inferidos.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {membersState === 'ready' ? `${members.length} ${members.length === 1 ? 'membro' : 'membros'}` : 'Consultando...'}
                </span>
              </div>

              <form onSubmit={handleAddMember} className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="E-mail de quem receberá o acesso"
                  className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'operator' | 'viewer')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500">
                  <option value="operator">Operador</option>
                  <option value="viewer">Visualização</option>
                </select>
                <button type="submit" disabled={isSavingMember} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
                  <UserPlus className="h-3.5 w-3.5" />{isSavingMember ? 'Gerando...' : 'Gerar acesso'}
                </button>
                <p className="sm:col-span-3 text-[11px] text-slate-500">Você compartilhará um código de uso único. A pessoa precisa entrar com este mesmo e-mail para aceitar.</p>
              </form>
              {memberActionError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{memberActionError}</p>}
              {createdInvite && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="font-bold">Acesso gerado para {createdInvite.email}</p>
                  <p className="mt-1">Compartilhe este código uma única vez. Ele expira em {new Date(createdInvite.expiresAt).toLocaleDateString('pt-BR')}.</p>
                  <code className="mt-2 block select-all break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-800">{createdInvite.code}</code>
                </div>
              )}

              <div className="mt-4 divide-y divide-slate-100">
                {membersState === 'loading' && <p className="py-4 text-xs text-slate-500">Carregando acessos reais...</p>}
                {membersState === 'error' && <p className="py-4 text-xs text-rose-700">Não foi possível carregar os acessos. Tente atualizar a página.</p>}
                {membersState === 'ready' && members.length === 0 && <p className="py-4 text-xs text-slate-500">Nenhum vínculo de acesso encontrado para este workspace.</p>}
                {members.map((member) => (
                  <div key={member.membershipId} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                        {member.isCurrentActor ? 'EU' : 'OP'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{member.isCurrentActor ? 'Você' : 'Operador vinculado'}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{member.email || `ID ${member.userId}`}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${member.role === 'owner' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        {member.role === 'owner' && <Crown className="mr-1 inline h-3 w-3 text-amber-600" />}{roleLabel[member.role]}
                      </span>
                      {member.role !== 'owner' && (
                        <button type="button" onClick={() => void handleRemoveMember(member)} disabled={removingMembershipId === member.membershipId} aria-label={`Remover ${member.email || 'operador'}`} className="rounded-md border border-rose-200 p-1.5 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="px-1 text-[11px] text-slate-500">O proprietário é protegido contra remoção nesta tela. Para trocar propriedade, use um processo administrativo auditado.</p>
          </div>
        )}
      </div>

      {/* Real Live QR Code Pairing Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl text-center relative">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mx-auto mb-3 shadow-2xs">
              <QrCode className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-bold text-slate-950 font-heading">Conectar WhatsApp Web (WAHA)</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Abra o WhatsApp no celular &gt; Aparelhos Conectados &gt; Conectar Aparelho.
            </p>

            {/* Live QR Box */}
            <div className="w-56 h-56 bg-slate-50 p-3 rounded-2xl mx-auto flex items-center justify-center border border-slate-200 relative overflow-hidden">
              {isQrLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-700">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-xs font-semibold">Gerando QR Code...</span>
                </div>
              ) : qrStatus === 'WORKING' ? (
                <div className="flex flex-col items-center justify-center gap-2 text-emerald-700 p-4">
                  <CheckCircle2 className="w-14 h-14 text-emerald-600 animate-bounce" />
                  <span className="text-sm font-bold text-slate-900">WhatsApp Conectado!</span>
                  <span className="text-[11px] text-slate-500">Instância ativa e pronta para operar.</span>
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code WhatsApp"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 p-4">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs">Iniciando sessão do WhatsApp...</span>
                </div>
              )}
            </div>

            {qrError && (
              <p className="text-xs text-rose-600 mt-3 font-medium">{qrError}</p>
            )}

            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={fetchQrCode}
                disabled={isQrLoading}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQrLoading ? 'animate-spin' : ''}`} />
                Atualizar QR Code
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              Conexão 100% direta e soberana na sua VPS com o WAHA.
            </p>

            <div className="mt-5">
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta WABA Embedded Signup v4 Modal */}
      <EmbeddedSignupModal
        isOpen={isEmbeddedModalOpen}
        onClose={() => setIsEmbeddedModalOpen(false)}
        workspace={workspace}
        canManage={workspace.operatorRole === 'owner'}
        onSuccess={(data) => {
          setWabaChannel({
            state: 'connected',
            phoneNumber: data.verifiedPhone,
          });
          setIsEmbeddedModalOpen(false);
        }}
      />
    </div>
  );
};
