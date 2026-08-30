import React, { useState, useEffect, useMemo } from 'react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import {
  Send,
  Users,
  MessageSquare,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  Flame,
  Radio,
  Zap,
  Sparkles,
  PhoneCall,
  Check,
  X
} from 'lucide-react';

interface MassBroadcastViewProps {
  workspace: Workspace;
}

export const MassBroadcastView: React.FC<MassBroadcastViewProps> = ({ workspace }) => {
  // Step 1: Target Audience
  const [audienceType, setAudienceType] = useState<'all_leads' | 'stage_leads' | 'ghosting_leads' | 'manual_numbers'>('all_leads');
  const [selectedStage, setSelectedStage] = useState<string>('NEW');
  const [manualPhoneInput, setManualPhoneInput] = useState<string>('');
  const [contacts, setContacts] = useState<Array<any>>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Step 2: Channel & Engine
  const [engine, setEngine] = useState<'waha' | 'waba'>('waha');
  const [delaySeconds, setDelaySeconds] = useState<number>(10);
  const [wabaTemplates, setWabaTemplates] = useState<Array<any>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Step 3: Message Content
  const [messageText, setMessageText] = useState<string>(
    'Olá {{nome}}! Tudo bem? Passando para avisar que temos condições especiais exclusivas para você esta semana. Podemos conversar rapidinho?'
  );

  // Step 4: Execution State
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<{
    total: number;
    sent: number;
    failed: number;
    status: 'idle' | 'running' | 'completed' | 'paused';
    currentContact?: string;
  }>({
    total: 0,
    sent: 0,
    failed: 0,
    status: 'idle',
  });
  const [logs, setLogs] = useState<Array<{ time: string; text: string; status: 'ok' | 'err' }>>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load Contacts for Target
  useEffect(() => {
    const fetchContacts = async () => {
      setLoadingContacts(true);
      try {
        const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/contacts?limit=100`);
        const data = await res.json();
        const contactsList = data.contacts || data.journeys || data.items || [];
        setContacts(contactsList);
      } catch {
        // ignore
      } finally {
        setLoadingContacts(false);
      }
    };
    fetchContacts();
  }, [workspace.id]);

  // Load WABA Templates if engine is WABA
  useEffect(() => {
    if (engine === 'waba') {
      authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates`)
        .then((r) => r.json())
        .then((data) => {
          if (data.templates && Array.isArray(data.templates)) {
            setWabaTemplates(data.templates.filter((t: any) => t.status === 'APPROVED'));
          }
        })
        .catch(() => undefined);
    }
  }, [workspace.id, engine]);

  // Filter Target List
  const targetList = useMemo(() => {
    if (audienceType === 'manual_numbers') {
      const numbers = manualPhoneInput
        .split(/[\n,;]+/)
        .map((n) => n.trim().replace(/\D/g, ''))
        .filter((n) => n.length >= 10);
      return numbers.map((num, idx) => ({
        id: `manual-${idx}`,
        name: `Cliente ${idx + 1}`,
        phone: num,
      }));
    }

    if (audienceType === 'stage_leads') {
      return contacts
        .filter((c) => c.pipelineStage === selectedStage || c.stage === selectedStage)
        .map((c) => ({
          id: c.id,
          name: c.contactName || c.contact?.name || 'Cliente',
          phone: c.contactPhone || c.contact?.phone || '',
        }))
        .filter((c) => c.phone);
    }

    if (audienceType === 'ghosting_leads') {
      return contacts
        .filter((c) => c.isGhosting || c.status === 'OPEN')
        .map((c) => ({
          id: c.id,
          name: c.contactName || c.contact?.name || 'Cliente',
          phone: c.contactPhone || c.contact?.phone || '',
        }))
        .filter((c) => c.phone);
    }

    return contacts
      .map((c) => ({
        id: c.id,
        name: c.contactName || c.contact?.name || 'Cliente',
        phone: c.contactPhone || c.contact?.phone || '',
      }))
      .filter((c) => c.phone);
  }, [audienceType, contacts, manualPhoneInput, selectedStage]);

  // Start Mass Broadcast
  const handleStartBroadcast = async () => {
    if (engine === 'waba') {
      setFeedback({
        type: 'error',
        message: 'O disparo em massa pela Meta Cloud API ainda está em homologação. Use WAHA para esta operação ou configure modelos WABA para atendimentos individuais.',
      });
      return;
    }
    if (targetList.length === 0) {
      setFeedback({ type: 'error', message: 'Nenhum contato selecionado para o disparo.' });
      return;
    }
    if (!messageText.trim() && engine === 'waha') {
      setFeedback({ type: 'error', message: 'Digite a mensagem que será enviada.' });
      return;
    }

    setIsBroadcasting(true);
    setBroadcastProgress({
      total: targetList.length,
      sent: 0,
      failed: 0,
      status: 'running',
    });
    setLogs([
      {
        time: new Date().toLocaleTimeString('pt-BR'),
        text: `Iniciando disparo em lote para ${targetList.length} contatos via ${engine.toUpperCase()}...`,
        status: 'ok',
      },
    ]);

    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          targets: targetList,
          message: messageText,
          templateName: selectedTemplate || undefined,
          delaySeconds,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const sentCount = typeof data.sentCount === 'number' ? data.sentCount : 0;
        const failedCount = typeof data.failedCount === 'number'
          ? data.failedCount
          : Math.max(0, targetList.length - sentCount);
        setBroadcastProgress((prev) => ({
          ...prev,
          sent: sentCount,
          failed: failedCount,
          status: 'completed',
        }));
        setLogs((prev) => [
          ...prev,
          {
            time: new Date().toLocaleTimeString('pt-BR'),
            text: sentCount > 0
              ? `Disparo concluído: ${sentCount} enviados e ${failedCount} falharam.`
              : `Nenhuma mensagem foi aceita pelo provedor. ${failedCount} falharam.`,
            status: sentCount > 0 ? 'ok' : 'err',
          },
        ]);
        setFeedback({
          type: sentCount > 0 ? 'success' : 'error',
          message: sentCount > 0
            ? `Disparo concluído: ${sentCount} enviados e ${failedCount} falharam.`
            : 'Nenhuma mensagem foi enviada. Consulte os erros do provedor antes de tentar novamente.',
        });
      } else {
        throw new Error(data.error || 'Erro ao processar lote no servidor.');
      }
    } catch (err: any) {
      setBroadcastProgress((prev) => ({ ...prev, status: 'idle' }));
      setFeedback({ type: 'error', message: err.message || 'Falha ao executar disparo em massa.' });
      setLogs((prev) => [
        ...prev,
        {
          time: new Date().toLocaleTimeString('pt-BR'),
          text: `Erro no disparo: ${err.message}`,
          status: 'err',
        },
      ]);
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-heading">
                Disparo em Massa & Transmissão
              </h1>
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300">
                Anti-Ban Protetivo
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Envie ofertas, avisos de agendamento e campanhas de reativação para múltiplos contatos de forma humanizada e segura.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-700">Contatos Prontos</div>
            <div className="text-sm font-extrabold text-emerald-600 font-mono">
              {loadingContacts ? 'Carregando...' : `${targetList.length} Leads`}
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs font-bold shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Card 1: Público Alvo */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 font-heading">
                <Users className="w-4 h-4 text-indigo-600" /> 1. Escolha o Público-Alvo
              </h3>
              <span className="text-xs font-bold text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded-md">
                {targetList.length} destinatários
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAudienceType('all_leads')}
                className={`p-3 rounded-xl border text-left font-bold transition flex flex-col gap-1 cursor-pointer ${
                  audienceType === 'all_leads'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <span className="font-extrabold text-[12px]">👥 Todos os Leads</span>
                <span className="text-[10px] text-slate-500 font-normal">Base completa de contatos ({contacts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setAudienceType('ghosting_leads')}
                className={`p-3 rounded-xl border text-left font-bold transition flex flex-col gap-1 cursor-pointer ${
                  audienceType === 'ghosting_leads'
                    ? 'border-amber-600 bg-amber-50/60 text-amber-900 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <span className="font-extrabold text-[12px] flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-600" /> Leads em Vácuo
                </span>
                <span className="text-[10px] text-slate-500 font-normal">Clientes que pararam de responder</span>
              </button>

              <button
                type="button"
                onClick={() => setAudienceType('stage_leads')}
                className={`p-3 rounded-xl border text-left font-bold transition flex flex-col gap-1 cursor-pointer ${
                  audienceType === 'stage_leads'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-900 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <span className="font-extrabold text-[12px]">🎯 Por Estágio do Funil</span>
                <span className="text-[10px] text-slate-500 font-normal">Filtrar por etapa do pipeline</span>
              </button>

              <button
                type="button"
                onClick={() => setAudienceType('manual_numbers')}
                className={`p-3 rounded-xl border text-left font-bold transition flex flex-col gap-1 cursor-pointer ${
                  audienceType === 'manual_numbers'
                    ? 'border-emerald-600 bg-emerald-50/60 text-emerald-900 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                }`}
              >
                <span className="font-extrabold text-[12px] flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Lista Manual / CSV
                </span>
                <span className="text-[10px] text-slate-500 font-normal">Colar números de WhatsApp</span>
              </button>
            </div>

            {/* Stage Selector */}
            {audienceType === 'stage_leads' && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Selecione o Estágio:</label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="NEW">1. Novos Leads</option>
                  <option value="QUALIFIED">2. Qualificados / Interesse</option>
                  <option value="PROPOSAL">3. Proposta Enviada</option>
                  <option value="NEGOTIATION">4. Negociação / Horário</option>
                </select>
              </div>
            )}

            {/* Manual Phone Input */}
            {audienceType === 'manual_numbers' && (
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Cole os números (um por linha ou separados por vírgula):</label>
                <textarea
                  rows={3}
                  value={manualPhoneInput}
                  onChange={(e) => setManualPhoneInput(e.target.value)}
                  placeholder="5549999999999&#10;5511988888888&#10;5521977777777"
                  className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
              </div>
            )}
          </div>

          {/* Card 2: Canal e Anti-Ban */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 font-heading">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> 2. Canal de Envio & Proteção Anti-Ban
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label
                className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition ${
                  engine === 'waha'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 shadow-2xs'
                    : 'border-slate-200 text-slate-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">📱 WhatsApp Web (WAHA)</span>
                  <input
                    type="radio"
                    name="engine"
                    value="waha"
                    checked={engine === 'waha'}
                    onChange={() => setEngine('waha')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Envio com intervalo humanizado para simular operador real.
                </p>
              </label>

              <label
                className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition ${
                  engine === 'waba'
                    ? 'border-purple-600 bg-purple-50/50 text-purple-950 shadow-2xs'
                    : 'border-slate-200 text-slate-600 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold">☁️ WABA Cloud API (Oficial)</span>
                  <input
                    type="radio"
                    name="engine"
                    value="waba"
                    checked={engine === 'waba'}
                    onChange={() => setEngine('waba')}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Modelos oficiais da Meta. Disparo em massa está em homologação.
                </p>
              </label>
            </div>

            {/* Delay Slider for WAHA */}
            {engine === 'waha' && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} className="text-emerald-600" /> Atraso Humanizado entre Disparos:
                  </span>
                  <span className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {delaySeconds} segundos / contato
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-600" />
                  <span>Recomendado: 10 a 20s para proteger a pontuação de qualidade do número.</span>
                </p>
              </div>
            )}

            {/* WABA Template Picker */}
            {engine === 'waba' && (
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10.5px] leading-relaxed text-amber-900">
                  <p className="font-bold text-amber-950">Disparo em massa WABA ainda não está liberado</p>
                  <p className="mt-0.5">Os modelos abaixo são reais e serão usados pela fila oficial quando ela for homologada. Até lá, nenhum lote será enviado ou registrado como sucesso pela Meta Cloud API.</p>
                </div>
                <label className="block text-xs font-bold text-purple-900">Selecione o Modelo WABA Aprovado:</label>
                {wabaTemplates.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle size={14} className="text-amber-600" />
                      Nenhum modelo WABA oficial encontrado
                    </p>
                    <p className="text-[10.5px] text-amber-700 leading-relaxed">
                      Conecte sua conta WhatsApp Cloud API em <span className="font-bold">Configurações &gt; Canais</span> ou crie seus modelos HSM na aba <span className="font-bold">Modelos HSM</span> para aprovação na Meta. Para envios imediatos sem aprovação, utilize o modo <span className="font-bold">WhatsApp Web (WAHA)</span>.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 bg-white border border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">Selecione um template aprovado na Meta...</option>
                    {wabaTemplates.map((t) => (
                      <option key={t.id || t.name} value={t.name}>
                        {t.name} ({t.category} - {t.language})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Card 3: Mensagem */}
          {engine === 'waha' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 font-heading">
                  <MessageSquare className="w-4 h-4 text-emerald-600" /> 3. Conteúdo da Mensagem
                </h3>
                <span className="text-[10.5px] text-slate-400 font-mono">
                  {messageText.length} caracteres
                </span>
              </div>

              <textarea
                rows={4}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Digite a mensagem. Use {{nome}} para personalizar com o nome do cliente."
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none leading-relaxed"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-700">Variáveis disponíveis:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMessageText((prev) => `${prev} {{nome}}`)}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    + {`{{nome}}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageText((prev) => `${prev} {{horario}}`)}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    + {`{{horario}}`}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Live Simulator & Progress (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Preview Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-heading">
              📱 Prévia no WhatsApp do Cliente
            </h3>

            <div className="p-4 rounded-2xl bg-[#ECE5DD] border border-slate-300/80 space-y-3 min-h-[160px] flex flex-col justify-end">
              <div className="self-end max-w-[85%] bg-[#E7FFDB] p-3 rounded-xl rounded-tr-xs shadow-xs text-xs text-slate-800 leading-relaxed font-sans relative">
                <p>
                  {engine === 'waba'
                    ? (selectedTemplate ? `Modelo Meta selecionado: ${selectedTemplate}` : 'Selecione um modelo Meta aprovado para visualizar a configuração.')
                    : messageText.replace(/\{\{nome\}\}/g, 'Ana')}
                </p>
                <div className="flex items-center justify-end gap-1 text-[9px] text-slate-400 mt-1">
                  <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-blue-500 font-bold">✓✓</span>
                </div>
              </div>
            </div>

            {/* Broadcast Action Button */}
            <button
              type="button"
              onClick={handleStartBroadcast}
              disabled={isBroadcasting || targetList.length === 0 || engine === 'waba'}
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition cursor-pointer transform active:scale-98"
            >
              {isBroadcasting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Disparando para {targetList.length} contatos...</span>
                </>
              ) : (
                <>
                  {engine === 'waba' ? <AlertTriangle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  <span>
                    {engine === 'waba'
                      ? 'Disparo WABA em homologação'
                      : `Iniciar Disparo em Massa (${targetList.length} Leads)`}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Live Progress Card */}
          {broadcastProgress.status !== 'idle' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 font-heading">
                  Status do Disparo em Lote
                </h4>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    broadcastProgress.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800 animate-pulse'
                  }`}
                >
                  {broadcastProgress.status === 'completed' ? 'Concluído' : 'Em Execução'}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{
                    width: `${
                      broadcastProgress.total > 0
                        ? ((broadcastProgress.sent + broadcastProgress.failed) / broadcastProgress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 font-mono">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-[10px] text-slate-400">Total</div>
                  <div className="font-bold text-slate-800">{broadcastProgress.total}</div>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <div className="text-[10px] text-emerald-600">Enviados</div>
                  <div className="font-bold text-emerald-700">{broadcastProgress.sent}</div>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg">
                  <div className="text-[10px] text-rose-600">Erros</div>
                  <div className="font-bold text-rose-700">{broadcastProgress.failed}</div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Logs */}
          {logs.length > 0 && (
            <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl text-[11px] font-mono space-y-1.5 max-h-[160px] overflow-y-auto">
              <div className="text-slate-400 font-bold border-b border-slate-800 pb-1 flex items-center justify-between text-[10px]">
                <span>LOG DE EXECUÇÃO</span>
                <span className="text-emerald-400">ATIVO</span>
              </div>
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-tight">
                  <span className="text-slate-500">{log.time}</span>
                  <span className={log.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                    {log.text}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
