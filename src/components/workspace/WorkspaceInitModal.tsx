import React, { useState } from 'react';
import { Building2, Sparkles, ArrowRight, Loader2, KeyRound } from 'lucide-react';

interface WorkspaceInitModalProps {
  onInit: (name?: string) => Promise<void>;
  onAcceptInvite?: (code: string) => Promise<void>;
  defaultName?: string;
}

export const WorkspaceInitModal: React.FC<WorkspaceInitModalProps> = ({
  onInit,
  onAcceptInvite,
  defaultName = '',
}) => {
  const [workspaceName, setWorkspaceName] = useState(defaultName);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'join') {
        if (!onAcceptInvite) throw new Error('O ingresso por convite não está disponível nesta sessão.');
        if (!inviteCode.trim()) throw new Error('Informe o código de acesso recebido.');
        await onAcceptInvite(inviteCode.trim());
      } else {
        await onInit(workspaceName.trim() || undefined);
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar o espaço de trabalho. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{mode === 'create' ? 'Configure seu Workspace' : 'Entrar em um Workspace'}</h2>
            <p className="text-xs text-slate-400">{mode === 'create' ? 'Inicie seu cockpit comercial em segundos' : 'Use o código enviado pelo proprietário'}</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          {mode === 'create'
            ? 'Crie o espaço da sua empresa. Você poderá conectar o WhatsApp oficial e definir o atendimento depois.'
            : 'O código só funciona para o e-mail que recebeu o convite, enquanto estiver dentro do prazo de validade.'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Nome da sua Empresa ou Clínica
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Ex: Clínica Sorriso & Implantes"
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                disabled={loading}
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Código de acesso
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Cole o código enviado pelo proprietário"
                className="w-full px-4 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                disabled={loading}
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisionando Workspace...</span>
                </>
              ) : (
                <>
                  {mode === 'create' ? <Sparkles className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                  <span>{mode === 'create' ? 'Criar Espaço Comercial' : 'Entrar no Workspace'}</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        </form>
        {onAcceptInvite && (
          <button
            type="button"
            disabled={loading}
            onClick={() => { setMode((current) => current === 'create' ? 'join' : 'create'); setError(null); }}
            className="mt-4 w-full text-center text-xs font-semibold text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
          >
            {mode === 'create' ? 'Recebi um código de acesso' : 'Quero criar um novo workspace'}
          </button>
        )}
      </div>
    </div>
  );
};
