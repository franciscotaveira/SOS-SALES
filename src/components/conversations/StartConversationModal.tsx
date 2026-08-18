import React, { useState, useEffect } from 'react';
import { Workspace, Journey } from '../../types/cockpit';
import {
  MessageSquarePlus,
  Search,
  Send,
  FileText,
  X,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface StartConversationModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onConversationStarted: (journey: any) => void;
}


interface DbContact {
  id: string;
  phone: string;
  name: string;
  whatsapp_id?: string;
  journey_id?: string;
  last_message?: string;
  last_message_at?: string;
}

export const StartConversationModal: React.FC<StartConversationModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onConversationStarted,
}) => {
  const [activeTab, setActiveTab] = useState<'database' | 'new_number'>('database');
  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<DbContact | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [messageType, setMessageType] = useState<'direct' | 'template'>('direct');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const fetchDbContacts = async (query: string = '') => {
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/contacts?search=${encodeURIComponent(query)}&limit=40`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch { /* ignore */ } finally {
      setLoadingContacts(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/templates`);
      if (res.ok) {
        const data = await res.json();
        if (data.templates?.length) {
          setTemplates(data.templates);
          setSelectedTemplate(data.templates[0].name);
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null); setSelectedContact(null);
      setNewPhone(''); setNewName(''); setInitialMessage(''); setSearchQuery('');
      fetchDbContacts('');
      fetchTemplates();
    }
  }, [isOpen, workspace.id]);

  if (!isOpen) return null;

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => fetchDbContacts(val), 350));
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneToUse = activeTab === 'database' ? selectedContact?.phone : newPhone;
    const nameToUse = activeTab === 'database' ? selectedContact?.name : newName;

    if (!phoneToUse?.trim()) {
      setErrorMsg('Selecione um contato do banco ou digite um número.');
      return;
    }
    setIsSubmitting(true); setErrorMsg(null);
    try {
      const body: Record<string, any> = { phone: phoneToUse, name: nameToUse };
      if (messageType === 'direct' && initialMessage.trim()) body.message = initialMessage.trim();
      if (messageType === 'template' && selectedTemplate) body.templateName = selectedTemplate;

      const res = await fetch(`/api/v1/workspaces/${workspace.id}/conversations/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onConversationStarted({
          id: data.journeyId, workspaceId: workspace.id,
          leadName: data.name || 'Lead WhatsApp', leadPhone: data.phone,
          status: 'open', pipelineStage: 'NEW', handoffStatus: 'in_progress',
          lastLeadMessage: initialMessage.trim() || '—', lastMessageTimestamp: new Date().toISOString(),
          unreadCount: 0, notes: [], tags: ['Iniciado Manualmente'],
        });
        onClose();
      } else {
        setErrorMsg(data.error || 'Erro ao iniciar conversa.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha de conexão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 font-heading text-sm">Iniciar Nova Conversa</h3>
              <p className="text-[11px] text-slate-500">{workspace.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex border-b border-slate-200 text-xs">
          {(['database', 'new_number'] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => { setActiveTab(tab); setSelectedContact(null); }}
              className={`flex-1 py-2 font-bold text-center border-b-2 transition-colors cursor-pointer ${activeTab === tab ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab === 'database' ? `👥 Contatos do Banco (${contacts.length})` : '📱 Novo Número / Lead'}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800">{errorMsg}</div>
        )}

        <form onSubmit={handleStart} className="space-y-4 text-xs">
          {activeTab === 'database' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input type="text" placeholder="Buscar contato por nome ou telefone..." value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none" />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                {loadingContacts ? (
                  <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /><span>Carregando contatos...</span>
                  </div>
                ) : contacts.length > 0 ? contacts.map((c) => {
                  const sel = selectedContact?.id === c.id;
                  return (
                    <div key={c.id} onClick={() => setSelectedContact(c)}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${sel ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400' : 'bg-white border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'}`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] ${sel ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {c.name?.[0]?.toUpperCase() || 'C'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{c.name || 'Sem Nome'}</p>
                          <p className="text-[11px] font-mono text-slate-500">{c.phone}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {c.last_message && <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{c.last_message}</p>}
                        {sel && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">✓ Selecionado</span>}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-6 text-center text-slate-400">Nenhum contato encontrado.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Número WhatsApp <span className="text-rose-500">*</span></label>
                <input type="text" required placeholder="(49) 98837-0054 ou 5549..." value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Lead / Cliente</label>
                <input type="text" placeholder="Ex: Marina Silva" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">Mensagem Inicial (Opcional):</label>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setMessageType('direct')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${messageType === 'direct' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                  💬 Texto Livre
                </button>
                <button type="button" onClick={() => setMessageType('template')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${messageType === 'template' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                  📋 Template WABA
                </button>
              </div>
            </div>
            {messageType === 'direct' ? (
              <textarea rows={2} placeholder="Mensagem de boas-vindas (ou deixe vazio para abrir sem mensagem)..."
                value={initialMessage} onChange={(e) => setInitialMessage(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
            ) : (
              <div className="space-y-2">
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none font-mono">
                  {templates.length > 0 ? templates.map((t) => (
                    <option key={t.name} value={t.name}>{t.name} ({t.category || 'UTILIDADE'}) — {t.status}</option>
                  )) : <option value="">Nenhum template disponível</option>}
                </select>
                <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-purple-600" />
                  Templates HSM garantem zero risco de banimento para reativações.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer">
              Cancelar
            </button>
            <button type="submit"
              disabled={isSubmitting || (activeTab === 'database' && !selectedContact) || (activeTab === 'new_number' && !newPhone.trim())}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
              {isSubmitting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Iniciando...</span></>
              ) : (
                <><Send className="w-3.5 h-3.5" /><span>Iniciar Conversa & Abrir Cockpit</span></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
