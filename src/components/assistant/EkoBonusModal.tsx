import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Gift,
  Link as LinkIcon,
  Loader2,
  LockKeyhole,
  RefreshCw,
  X,
} from 'lucide-react';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface EkoBonusModule {
  id: string;
  title: string;
  purpose: string;
  template: string;
  checklist: string[];
}

interface EkoBonusPayload {
  eligible: boolean;
  product: string;
  version: string;
  title: string;
  description: string;
  modules: EkoBonusModule[];
  subscriptionStatus: string | null;
  claimRequired: boolean;
}

interface EkoBonusModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

function buildDownloadMarkdown(data: EkoBonusPayload): string {
  const sections = data.modules.map((module) => [
    `## ${module.title}`,
    module.purpose,
    '',
    module.template.trim(),
    '',
    '### Checklist',
    ...module.checklist.map((item) => `- [ ] ${item}`),
  ].join('\n'));

  return [
    '# EKO · Kit de Configuração Comercial',
    '',
    data.description,
    `Versão: ${data.version}`,
    '',
    ...sections,
    '',
    '> Material de implantação do SOS Vendas. Valide as informações com um responsável antes de publicar qualquer agente.',
    '',
  ].join('\n');
}

export function EkoBonusModal({ workspaceId, isOpen, onClose }: EkoBonusModalProps) {
  const [data, setData] = React.useState<EkoBonusPayload | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [claimMessage, setClaimMessage] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const loadBonus = React.useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/bonuses/eko`);
      const payload = await response.json().catch(() => null) as { data?: EkoBonusPayload; error?: string } | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error || `Não foi possível verificar o bônus (HTTP ${response.status}).`);
      }
      setData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o bônus EKO.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    if (!isOpen) return;
    setClaimMessage(null);
    setCopiedId(null);
    void loadBonus();
  }, [isOpen, loadBonus]);

  React.useEffect(() => {
    if (!copiedId) return;
    const timeout = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedId]);

  const handleClaim = async () => {
    setIsClaiming(true);
    setClaimMessage(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/billing/claim`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null) as { data?: { claimed?: number }; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || `Não foi possível vincular a compra (HTTP ${response.status}).`);
      }
      const claimed = payload?.data?.claimed || 0;
      setClaimMessage(
        claimed > 0
          ? 'Compra vinculada. Atualizando o seu bônus…'
          : 'Nenhuma compra pendente foi encontrada para este e-mail. Confira o e-mail usado na Cakto ou fale com o suporte.',
      );
      if (claimed > 0) await loadBonus();
    } catch (err) {
      setClaimMessage(err instanceof Error ? err.message : 'Não foi possível vincular a compra.');
    } finally {
      setIsClaiming(false);
    }
  };

  const copyTemplate = async (module: EkoBonusModule) => {
    try {
      await navigator.clipboard.writeText(module.template);
      setCopiedId(module.id);
    } catch {
      setClaimMessage('O navegador bloqueou a cópia automática. Selecione o texto do modelo e copie manualmente.');
    }
  };

  const downloadKit = () => {
    if (!data?.eligible) return;
    const blob = new Blob([buildDownloadMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `eko-kit-configuracao-${data.version}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eko-bonus-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[850px] sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between border-b border-emerald-900/20 bg-[#0B132B] px-4 py-3.5 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
              <Gift className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Bônus de implantação</p>
              <h2 id="eko-bonus-title" className="truncate text-base font-bold sm:text-lg">EKO · Kit de Configuração Comercial</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar bônus EKO"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {isLoading && (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              Verificando a assinatura e preparando o material…
            </div>
          )}

          {!isLoading && error && (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-900">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
              <p>{error}</p>
              <button type="button" onClick={() => void loadBonus()} className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">
                <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
              </button>
            </div>
          )}

          {!isLoading && !error && data && !data.eligible && (
            <div className="mx-auto max-w-xl space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-bold">O bônus ainda não está vinculado a este workspace</h3>
                    <p className="mt-1 text-sm leading-relaxed text-amber-900/80">
                      Depois da aprovação do pagamento, o mesmo e-mail usado na Cakto precisa ser vinculado ao workspace do CRM. O conteúdo só é liberado para uma assinatura vigente.
                    </p>
                  </div>
                </div>
              </div>

              {claimMessage && <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{claimMessage}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={isClaiming}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  Vincular compra pelo meu e-mail
                </button>
                <a
                  href="https://iaparavendas.tech/eko/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-emerald-400 hover:text-emerald-700"
                >
                  Conhecer o EKO <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                Se você comprou com outro e-mail, solicite a vinculação ao suporte para manter a conferência de identidade.
              </p>
            </div>
          )}

          {!isLoading && !error && data?.eligible && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <h3 className="font-bold text-emerald-950">Bônus liberado para este workspace</h3>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">Use os modelos abaixo para organizar a base antes de publicar ou otimizar qualquer agente.</p>
                  </div>
                </div>
                <button type="button" onClick={downloadKit} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">
                  <Download className="h-4 w-4" /> Baixar kit (.md)
                </button>
              </div>

              {claimMessage && <p className="rounded-xl border border-emerald-200 bg-white p-3 text-sm text-emerald-800">{claimMessage}</p>}

              <div className="grid gap-3 lg:grid-cols-2">
                {data.modules.map((module, index) => (
                  <article key={module.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Módulo {index + 1}</p>
                        <h3 className="mt-1 text-sm font-bold text-slate-900">{module.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyTemplate(module)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
                        title={`Copiar modelo de ${module.title}`}
                      >
                        {copiedId === module.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Clipboard className="h-3.5 w-3.5" />}
                        {copiedId === module.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <div className="space-y-3 p-4">
                      <p className="text-xs leading-relaxed text-slate-600">{module.purpose}</p>
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">{module.template}</pre>
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Pronto quando…</p>
                        <ul className="space-y-1">
                          {module.checklist.map((item) => (
                            <li key={item} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <p className="text-center text-xs leading-relaxed text-slate-500">O EKO organiza a decisão. A configuração técnica, as integrações e a validação final continuam sob responsabilidade do operador.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

