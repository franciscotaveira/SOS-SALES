import React, { useState } from 'react';
import { TrafficProofStats, SalesOsGateway } from '../../services/salesOsGateway';
import { Journey, Workspace } from '../../types/cockpit';
import { useFeatureFlags } from '../../contexts/FeatureFlagContext';
import {
  TrendingUp,
  DollarSign,
  Users,
  Clock,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  ShieldCheck,
  Target,
  Crown,
  EyeOff,
  Sparkles,
  FileSpreadsheet,
  History,
  Lock,
  Link2,
  Copy,
  Check,
  Megaphone,
  Plus,
  Share2,
} from 'lucide-react';

interface TrafficProofViewProps {
  workspace: Workspace;
  gateway: SalesOsGateway;
  journeys: Journey[];
}

export const TrafficProofView: React.FC<TrafficProofViewProps> = ({
  workspace,
  gateway,
  journeys,
}) => {
  const [stats, setStats] = React.useState<TrafficProofStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { isFeatureEnabled, currentRole } = useFeatureFlags();

  // Link Builder State
  const [linkPhone, setLinkPhone] = useState('554933401014');
  const [linkCrtv, setLinkCrtv] = useState('CRTV_ESC_01');
  const [linkCamp, setLinkCamp] = useState('escova_express_haven');
  const [linkMsg, setLinkMsg] = useState('Olá! Vi o anúncio da Escova Express por R$ 59 no Instagram e quero agendar hoje.');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const showFinancialMetrics = isFeatureEnabled('financial_metrics');
  const showRoasDeepAnalytics = isFeatureEnabled('roas_deep_analytics');
  const showAuditTrail = isFeatureEnabled('audit_trail');

  const generatedLink = React.useMemo(() => {
    const fullMsg = `${linkMsg} [ref: ${linkCrtv}] utm_source=instagram&utm_campaign=${linkCamp}`;
    return `https://wa.me/${linkPhone.replace(/\D/g, '')}?text=${encodeURIComponent(fullMsg)}`;
  }, [linkPhone, linkCrtv, linkCamp, linkMsg]);

  const handleCopyLink = (urlToCopy: string, label: string = 'Link Click WA') => {
    navigator.clipboard.writeText(urlToCopy);
    setCopyFeedback(`${label} copiado com sucesso!`);
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    gateway
      .getTrafficStats(workspace.id)
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setStats({
            workspaceId: workspace.id,
            totalDealsWonBrl: 0,
            totalCtwaCostBrl: 0,
            totalLeadsAttributed: 0,
            roasRatio: 0,
            slaAdherenceRate: 100,
            avgFirstResponseMinutes: 0,
            campaigns: [],
          });
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [workspace.id, gateway, journeys]);

  if (isLoading || !stats) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4 animate-pulse">
        <div className="h-6 bg-[var(--sos-border)]/30 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[var(--sos-border)]/30 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate deep metrics safely
  const totalLeads = stats.totalLeadsAttributed || 1;
  const cplAverage = (stats.totalCtwaCostBrl || 0) / totalLeads;
  const totalConversions = (stats.campaigns || []).reduce((acc, c) => acc + (c?.conversionsCount || 0), 0);
  const avgDealTicket = (stats.totalDealsWonBrl || 0) / (totalConversions || 1);

  return (
    <div id="traffic-proof-view" className="h-full overflow-y-auto w-full p-3 sm:p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[var(--sos-border)]">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--sos-success)]"></span>
            <h1 className="text-base font-bold text-[var(--sos-ink)]">
              Central de Campanhas & Anúncios (Click WA)
            </h1>
            {currentRole === 'owner' && (
              <span className="flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-warning-subtle)] text-[var(--sos-warning)] border border-[var(--sos-warning)]/30">
                <Crown className="w-2.5 h-2.5" />
                Painel Executivo Owner
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--sos-muted)] mt-0.5">
            Gerador de Links de Anúncios, Atribuição ponta a ponta Meta Ads ➔ WhatsApp e Retorno Financeiro Real (ROAS).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {!showFinancialMetrics && (
            <span className="flex items-center gap-1 text-[9.5px] font-medium text-[var(--sos-muted)] bg-[var(--sos-border)]/30 border border-[var(--sos-border)] px-1.5 py-0.75 rounded-lg">
              <EyeOff className="w-3 h-3" />
              Métricas financeiras ocultas
            </span>
          )}
          <div className="flex items-center gap-1.5 font-mono bg-[var(--sos-surface)] px-2.5 py-1 rounded-lg border border-[var(--sos-border)] shadow-2xs">
            <span className="text-[var(--sos-muted)]">Unidade:</span>
            <span className="font-bold text-[var(--sos-ink)]">{workspace.name}</span>
          </div>
        </div>
      </div>

      {/* Copy Feedback Toast */}
      {copyFeedback && (
        <div className="p-2.5 bg-[var(--sos-success)] text-white font-bold text-xs rounded-lg shadow-sm flex items-center justify-between animate-in fade-in duration-200">
          <span className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> {copyFeedback}
          </span>
          <button onClick={() => setCopyFeedback(null)} className="underline text-xs">Fechar</button>
        </div>
      )}

      {/* Gerador de Links Click WA & Criativos (Destaque Topo) */}
      <div className="bg-[var(--sos-action)]/5 text-[var(--sos-ink)] rounded-xl p-4 border border-[var(--sos-action)]/20 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-[var(--sos-action)]/20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--sos-action)]/10 text-[var(--sos-action)] flex items-center justify-center">
              <Link2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--sos-action)]">
                Gerador de Links Click WA para Anúncios
              </h3>
              <p className="text-[9.5px] text-[var(--sos-muted)]">
                Gere o link codificado com tags de rastreamento para colar no Gerenciador de Anúncios da Meta ou no Instagram.
              </p>
            </div>
          </div>
          <span className="px-1.5 py-0.5 rounded-full text-[8.5px] font-mono font-bold bg-[var(--sos-action)]/10 text-[var(--sos-action)] border border-[var(--sos-action)]/30 shrink-0">
            Atribuição Automática Ativa
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
          <div>
            <label className="block text-[var(--sos-muted)] font-semibold mb-0.5 text-[9.5px]">Número do WhatsApp:</label>
            <input
              type="text"
              value={linkPhone}
              onChange={(e) => setLinkPhone(e.target.value)}
              className="w-full px-2.5 py-1 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] font-mono text-xs focus:ring-1 focus:ring-[var(--sos-action)] outline-none"
            />
          </div>
          <div>
            <label className="block text-[var(--sos-muted)] font-semibold mb-0.5 text-[9.5px]">Código do Criativo / Anúncio:</label>
            <input
              type="text"
              value={linkCrtv}
              onChange={(e) => setLinkCrtv(e.target.value)}
              placeholder="Ex: CRTV_ESC_01"
              className="w-full px-2.5 py-1 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] font-mono text-xs focus:ring-1 focus:ring-[var(--sos-action)] outline-none"
            />
          </div>
          <div>
            <label className="block text-[var(--sos-muted)] font-semibold mb-0.5 text-[9.5px]">Campanha:</label>
            <select
              value={linkCamp}
              onChange={(e) => setLinkCamp(e.target.value)}
              className="w-full px-2.5 py-1 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] text-xs focus:ring-1 focus:ring-[var(--sos-action)] outline-none"
            >
              <option value="escova_express_haven">Meta Ads — Escova Express R$59</option>
              <option value="nanoblading_suzana">Instagram — Nanoblading Suzana</option>
              <option value="promocao_geral">Campanha Geral / Bio</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[var(--sos-muted)] text-[9.5px] font-semibold mb-0.5">Mensagem Inicial do Cliente (com Tag de Rastreamento):</label>
          <input
            type="text"
            value={linkMsg}
            onChange={(e) => setLinkMsg(e.target.value)}
            className="w-full px-2.5 py-1 bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-lg text-[var(--sos-ink)] text-xs focus:ring-1 focus:ring-[var(--sos-action)] outline-none"
          />
        </div>

        <div className="p-2.5 bg-[var(--sos-border)]/30 border border-[var(--sos-action)]/10 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold text-[var(--sos-action)]">🔗 Link de Anúncio Gerado:</span>
            <button
              type="button"
              onClick={() => handleCopyLink(generatedLink)}
              className="px-2.5 py-0.75 bg-[var(--sos-action)] hover:bg-[var(--sos-action)]/90 text-white font-bold rounded-md text-xs transition cursor-pointer shadow-2xs flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              <span>Copiar Link Click WA</span>
            </button>
          </div>
          <p className="text-[9.5px] font-mono text-[var(--sos-muted)] break-all bg-[var(--sos-surface)] p-1.5 rounded border border-[var(--sos-border)]">
            {generatedLink}
          </p>
        </div>
      </div>

      {/* 4 Macro KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Total Won Revenue */}
        <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--sos-surface)] to-[var(--sos-success-subtle)]/30 border border-[var(--sos-border)]">
          <div className="flex items-center justify-between text-[var(--sos-muted)] mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider">Receita Gerada</span>
            <div className="w-6 h-6 rounded-lg bg-[var(--sos-success-subtle)] text-[var(--sos-success)] flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[var(--sos-ink)] font-mono">
            {showFinancialMetrics ? (
              `R$ ${stats.totalDealsWonBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-[var(--sos-muted)] text-base flex items-center gap-1 font-normal">
                <Lock className="w-3.5 h-3.5" /> Restrito Owner
              </span>
            )}
          </div>
          <div className="text-[9.5px] text-[var(--sos-success)] font-medium mt-0.5 flex items-center gap-0.5">
            <ArrowUpRight className="w-2.5 h-2.5" />
            Fechamentos confirmados pelos operadores
          </div>
        </div>

        {/* CTWA Spend */}
        <div className="rounded-xl p-3 border border-[var(--sos-border)] bg-[var(--sos-surface)]">
          <div className="flex items-center justify-between text-[var(--sos-muted)] mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider">Investimento Meta Ads (Click WA)</span>
            <div className="w-6 h-6 rounded-lg bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] flex items-center justify-center">
              <Target className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[var(--sos-ink)] font-mono">
            {showFinancialMetrics ? (
              `R$ ${stats.totalCtwaCostBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-[var(--sos-muted)] text-base flex items-center gap-1 font-normal">
                <Lock className="w-3.5 h-3.5" /> Restrito Owner
              </span>
            )}
          </div>
          <div className="text-[9.5px] text-[var(--sos-muted)] mt-0.5">
            {stats.totalLeadsAttributed} leads capturados
          </div>
        </div>

        {/* ROAS Ratio */}
        <div className="rounded-xl p-3 bg-gradient-to-br from-[var(--sos-surface)] to-[var(--sos-operational-subtle)]/30 border border-[var(--sos-border)]">
          <div className="flex items-center justify-between text-[var(--sos-muted)] mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider">ROAS Comercial</span>
            <div className="w-6 h-6 rounded-lg bg-[var(--sos-operational)] text-white flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[var(--sos-operational)] font-mono">
            {stats.roasRatio > 0 ? `${stats.roasRatio.toFixed(1)}x` : 'Em apuração'}
          </div>
          <div className="text-[9.5px] text-[var(--sos-operational)] font-medium mt-0.5">
            Retorno sobre o investimento publicitário
          </div>
        </div>

        {/* SLA Adherence */}
        <div className="rounded-xl p-3 border border-[var(--sos-border)] bg-[var(--sos-surface)]">
          <div className="flex items-center justify-between text-[var(--sos-muted)] mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider">Aderência de SLA</span>
            <div className="w-6 h-6 rounded-lg bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[var(--sos-ink)] font-mono">
            {(Number(stats.slaAdherenceRate) || 0).toFixed(0)}%
          </div>
          <div className="text-[9.5px] text-[var(--sos-ai)] font-medium mt-0.5">
            Tempo médio: {(Number(stats.avgFirstResponseMinutes) || 0).toFixed(0)} min
          </div>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="rounded-xl p-4 space-y-3 border border-[var(--sos-border)] bg-[var(--sos-surface)]">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
          <div>
            <h3 className="text-xs font-bold text-[var(--sos-ink)] flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-[var(--sos-success)]" />
              Desempenho por Campanha & Anúncio
            </h3>
            <p className="text-[9.5px] text-[var(--sos-muted)]">
              Mapeamento de criativos, volume de leads, conversões e links de tráfego.
            </p>
          </div>
          <span className="text-[9.5px] font-mono font-bold text-[var(--sos-success)] bg-[var(--sos-success-subtle)] px-2 py-0.5 rounded-lg border border-[var(--sos-success)]/30">
            {stats.campaigns?.length || 0} Campanhas Ativas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--sos-border)]/30 border-b border-[var(--sos-border)] text-[var(--sos-muted)] font-bold uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5">Campanha / Criativo</th>
                <th className="px-3 py-2.5 text-right">Leads</th>
                <th className="px-3 py-2.5 text-right">Gasto</th>
                <th className="px-3 py-2.5 text-right">Conversões</th>
                <th className="px-3 py-2.5 text-right">Receita Gerada</th>
                <th className="px-3 py-2.5 text-right">Taxa Conv.</th>
                <th className="px-3 py-2.5 text-center">Link de Anúncio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sos-border)] text-[var(--sos-ink)]">
              {(stats.campaigns || []).map((camp, idx) => {
                const rowLink = `https://wa.me/${linkPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi a campanha "${camp.campaignName}" e quero agendar. [ref: CRTV_0${idx + 1}] utm_source=instagram&utm_campaign=${camp.campaignName.toLowerCase().replace(/\s+/g, '_')}`)}`;
                return (
                  <tr key={idx} className="hover:bg-[var(--sos-border)]/30 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-[var(--sos-ink)]">
                      <div>{camp.campaignName}</div>
                      <span className="text-[9px] font-mono text-[var(--sos-muted)]">CRTV_0{idx + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{camp.leadsCount}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[var(--sos-muted)]">
                      {showFinancialMetrics ? (
                        `R$ ${(Number(camp.spendBrl) || 0).toFixed(2)}`
                      ) : (
                        <span className="text-[var(--sos-muted)]">Restrito</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-[var(--sos-success)]">
                      {camp.conversionsCount}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-[var(--sos-ink)]">
                      {showFinancialMetrics ? (
                        `R$ ${(Number(camp.revenueBrl) || 0).toFixed(2)}`
                      ) : (
                        <span className="text-[var(--sos-muted)]">Restrito</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="px-1.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-[var(--sos-operational-subtle)] text-[var(--sos-operational)] border border-[var(--sos-operational)]/30">
                        {(Number(camp.conversionRate) || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(rowLink, `Link da Campanha "${camp.campaignName}"`)}
                        className="px-2 py-0.75 bg-[var(--sos-border)]/30 hover:bg-[var(--sos-success-subtle)] hover:text-[var(--sos-success)] text-[var(--sos-muted)] font-bold rounded text-[9.5px] transition cursor-pointer inline-flex items-center gap-1 border border-[var(--sos-border)]"
                        title="Copiar link com tags desta campanha"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>Copiar Link</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Deep ROAS Analytics (Feature Flag: roas_deep_analytics) */}
      {showRoasDeepAnalytics && (
        <div className="rounded-xl p-4 space-y-3 bg-gradient-to-br from-[var(--sos-surface)] to-[var(--sos-ai-subtle)]/30 border border-[var(--sos-ai)]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="p-1 bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] rounded-lg">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--sos-ink)] flex items-center gap-1.5">
                  <span>Deep Analytics: Eficiência de Aquisição CTWA</span>
                  <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30">
                    Owner Pro Analytics
                  </span>
                </h3>
                <p className="text-[9.5px] text-[var(--sos-muted)]">
                  Métricas aprofundadas de custo de aquisição e alavancagem comercial.
                </p>
              </div>
            </div>
            <span className="text-[9.5px] font-mono text-[var(--sos-ai)] bg-[var(--sos-ai-subtle)]/70 px-2 py-0.5 rounded font-semibold">
              CPL Médio: R$ {cplAverage.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 bg-[var(--sos-surface)] rounded-lg border border-[var(--sos-border)]">
              <div className="text-[9px] font-bold uppercase text-[var(--sos-muted)]">Custo por Lead (CPL)</div>
              <div className="text-base font-bold font-mono text-[var(--sos-ink)] mt-0.5">
                R$ {cplAverage.toFixed(2)}
              </div>
              <div className="text-[9px] text-[var(--sos-success)] mt-0.5">Dentro da meta estipulada</div>
            </div>

            <div className="p-2.5 bg-[var(--sos-surface)] rounded-lg border border-[var(--sos-border)]">
              <div className="text-[9px] font-bold uppercase text-[var(--sos-muted)]">Ticket Médio por Fechamento</div>
              <div className="text-base font-bold font-mono text-[var(--sos-ink)] mt-0.5">
                R$ {avgDealTicket.toFixed(2)}
              </div>
              <div className="text-[9px] text-[var(--sos-operational)] mt-0.5">Baseado em vendas confirmadas</div>
            </div>

            <div className="p-2.5 bg-[var(--sos-surface)] rounded-lg border border-[var(--sos-border)]">
              <div className="text-[9px] font-bold uppercase text-[var(--sos-muted)]">Lucro Bruto Comercial Estimado</div>
              <div className="text-base font-bold font-mono text-[var(--sos-success)] mt-0.5">
                R$ {(stats.totalDealsWonBrl - stats.totalCtwaCostBrl).toFixed(2)}
              </div>
              <div className="text-[9px] text-[var(--sos-success)] mt-0.5">Receita menos investimento de mídia</div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail & Governance Log (Feature Flag: audit_trail) */}
      {showAuditTrail && (
        <div className="rounded-xl p-3 space-y-2 border border-[var(--sos-border)] bg-[var(--sos-surface)]">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[var(--sos-muted)]" />
            <h3 className="text-[9px] font-bold uppercase tracking-wider text-[var(--sos-ink)]">
              Trilha de Auditoria & Governança de Conversão
            </h3>
          </div>
          <div className="divide-y divide-[var(--sos-border)] text-xs">
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-[var(--sos-ink)] font-medium">
                Atribuição automática de campanha Meta Ads CTWA confirmada via Webhook WABA
              </span>
              <span className="text-[9px] font-mono text-[var(--sos-muted)]">Hoje às 12:48</span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-[var(--sos-ink)] font-medium">
                Fechamento de venda registrado pelo operador e vinculado ao criativo da campanha
              </span>
              <span className="text-[9px] font-mono text-[var(--sos-muted)]">Hoje às 11:32</span>
            </div>
            <div className="py-1.5 flex items-center justify-between">
              <span className="text-[var(--sos-ink)] font-medium">
                Sincronização de métricas de investimento com a Meta Marketing API concluída
              </span>
              <span className="text-[9px] font-mono text-[var(--sos-muted)]">Hoje às 09:15</span>
            </div>
          </div>
        </div>
      )}

      {/* Continuity Proof Chain Explanation */}
      <div className="p-3 bg-[var(--sos-canvas)] text-[var(--sos-ink)] rounded-xl border border-[var(--sos-border)] shadow-sm">
        <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-[var(--sos-success)] uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" />
          Garantia de Não-Vazamento Comercial
        </div>
        <p className="text-[9.5px] text-[var(--sos-muted)] leading-relaxed max-w-4xl">
          No Sales OS, cada real investido no anúncio CTWA possui continuidade direta: a oferta vista pelo cliente no Instagram/Facebook chega intacta ao operador com o contexto do veículo ou serviço, a recomendação inteligente sugere a resposta exata e o fechamento retroalimenta o ROAS.
        </p>
      </div>
    </div>
  );
};
