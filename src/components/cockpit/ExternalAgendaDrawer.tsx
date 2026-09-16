import React, { useEffect, useState } from 'react';
import { Calendar, ExternalLink, Info, Lock, Save, X } from 'lucide-react';

/**
 * A provider-backed availability contract is not available yet. Keep the
 * provider names for configuration compatibility, but never infer availability
 * from browser state, hardcoded rosters, or a public booking URL.
 */
export type ExternalAgendaProvider =
  | 'google_calendar'
  | 'trinks'
  | 'calendly'
  | 'avec'
  | 'simples_agenda'
  | 'custom';

export interface ExternalAgendaConfig {
  enabled: false;
  provider: ExternalAgendaProvider;
  providerLabel: string;
  url: string;
  autoSyncMinutes: null;
  lastSyncedAt?: undefined;
  targetDate: 'hoje' | 'amanha' | 'depois_amanha';
  selectedServiceId: '';
  availableSlotsToday?: never;
}

interface ExternalAgendaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName?: string;
}

export const DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY = 'sos_sales_external_agenda_config_v4';
const DISCONNECTED_LABEL = 'Agenda externa não conectada';

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createDisconnectedConfig(url = ''): ExternalAgendaConfig {
  return {
    enabled: false,
    provider: 'custom',
    providerLabel: url ? 'Link externo configurado' : DISCONNECTED_LABEL,
    url,
    autoSyncMinutes: null,
    targetDate: 'hoje',
    selectedServiceId: '',
  };
}

export function getExternalAgendaConfig(workspaceId: string): ExternalAgendaConfig {
  if (typeof window === 'undefined' || !workspaceId) return createDisconnectedConfig();

  try {
    const saved = window.localStorage.getItem(`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_${workspaceId}`);
    if (!saved) return createDisconnectedConfig();

    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createDisconnectedConfig();
    }

    const url = isHttpUrl((parsed as { url?: unknown }).url)
      ? (parsed as { url: string }).url.trim()
      : '';
    return createDisconnectedConfig(url);
  } catch {
    return createDisconnectedConfig();
  }
}

function persistExternalAgendaConfig(workspaceId: string, config: ExternalAgendaConfig): void {
  if (typeof window === 'undefined' || !workspaceId) return;
  try {
    window.localStorage.setItem(`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_${workspaceId}`, JSON.stringify(config));
  } catch {
    // The link is a convenience only; storage failures must not affect the
    // operator's ability to continue using the real CRM flows.
  }
}

export const ExternalAgendaDrawer: React.FC<ExternalAgendaDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
}) => {
  const [config, setConfig] = useState<ExternalAgendaConfig>(() => getExternalAgendaConfig(workspaceId));
  const [editUrl, setEditUrl] = useState(config.url);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextConfig = getExternalAgendaConfig(workspaceId);
    setConfig(nextConfig);
    setEditUrl(nextConfig.url);
    setError(null);
  }, [workspaceId]);

  if (!isOpen) return null;

  const handleSaveLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextUrl = editUrl.trim();
    if (nextUrl && !isHttpUrl(nextUrl)) {
      setError('Informe um link http:// ou https:// válido.');
      return;
    }

    const nextConfig = createDisconnectedConfig(nextUrl);
    persistExternalAgendaConfig(workspaceId, nextConfig);
    setConfig(nextConfig);
    setEditUrl(nextUrl);
    setError(null);
  };

  const handleClearLink = () => {
    const nextConfig = createDisconnectedConfig();
    persistExternalAgendaConfig(workspaceId, nextConfig);
    setConfig(nextConfig);
    setEditUrl('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="external-agenda-title">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-700/80 bg-[#090d16] text-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-[#050811] px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-slate-800 text-slate-300">
              <Calendar className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="external-agenda-title" className="truncate text-base font-extrabold tracking-tight">
                Agenda externa
              </h2>
              <p className="truncate text-xs text-slate-400">
                {workspaceName ? `${workspaceName} · ` : ''}{config.providerLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Fechar agenda externa"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <section className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5" role="status">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="space-y-2">
                <h3 className="font-bold text-amber-100">Disponibilidade indisponível</h3>
                <p className="text-sm leading-6 text-amber-100/80">
                  O SOS Vendas ainda não possui uma conexão persistente com um provedor de agenda. Por segurança, nenhum horário, profissional, preço ou confirmação é calculado neste navegador.
                </p>
                <p className="text-sm leading-6 text-amber-100/80">
                  O link abaixo é apenas um acesso externo. Ele não sincroniza vagas e nunca insere texto de disponibilidade no WhatsApp.
                </p>
              </div>
            </div>
          </section>

          {config.url && (
            <a
              href={config.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="truncate">Abrir link externo configurado</span>
              </span>
              <span className="truncate text-xs text-slate-500">{config.url}</span>
            </a>
          )}

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <h3 className="font-bold text-slate-100">Configurar acesso externo</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Salve o endereço oficial da sua agenda para abrir o painel em outra aba. A integração de disponibilidade será liberada somente quando houver um adaptador autenticado no backend.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveLink} className="mt-5 space-y-3">
              <label htmlFor="external-agenda-url" className="block text-xs font-bold uppercase tracking-wide text-slate-300">
                Link da agenda
              </label>
              <input
                id="external-agenda-url"
                type="url"
                inputMode="url"
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
                placeholder="https://sua-agenda.com.br"
                className="w-full rounded-xl border border-slate-700 bg-[#050811] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-slate-400"
              />
              {error && <p className="text-xs font-semibold text-rose-300" role="alert">{error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClearLink}
                  className="rounded-lg px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-slate-800 hover:text-white"
                >
                  Limpar link
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-600"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Salvar acesso externo
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
};
