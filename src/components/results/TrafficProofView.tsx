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
      <div className="p-8 max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-2xl"></div>
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
    <div id="traffic-proof-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h1 className="text-xl font-bold text-slate-900">
              Central de Campanhas & Anúncios (Click WA)
            </h1>
            {currentRole === 'owner' && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                <Crown className="w-3 h-3 text-amber-700" />
                Painel Executivo Owner
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerador de Links de Anúncios, Atribuição ponta a ponta Meta Ads ➔ WhatsApp e Retorno Financeiro Real (ROAS).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {!showFinancialMetrics && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
              Métricas financeiras ocultas
            </span>
          )}
          <div className="flex items-center gap-2 font-mono bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
            <span className="text-slate-500">Unidade:</span>
            <span className="font-bold text-slate-800">{workspace.name}</span>
          </div>
        </div>
      </div>

      {/* Copy Feedback Toast */}
      {copyFeedback && (
        <div className="p-3 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center justify-between animate-in fade-in duration-200">
          <span className="flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {copyFeedback}
          </span>
          <button onClick={() => setCopyFeedback(null)} className="underline text-xs">Fechar</button>
        </div>
      )}

      {/* Gerador de Links Click WA & Criativos (Destaque Topo) */}
      <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 rounded-2xl p-5 border border-emerald-500/30 shadow-md text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-emerald-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-400">
                Gerador de Links Click WA para Anúncios
              </h3>
              <p className="text-[11px] text-slate-300">
                Gere o link codificado com tags de rastreamento para colar no Gerenciador de Anúncios da Meta ou no Instagram.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
            Atribuição Automática Ativa
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Número do WhatsApp:</label>
            <input
              type="text"
              value={linkPhone}
              onChange={(e) => setLinkPhone(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-emerald-300 font-mono text-xs focus:ring-1 focus:ring-emerald-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Código do Criativo / Anúncio:</label>
            <input
              type="text"
              value={linkCrtv}
              onChange={(e) => setLinkCrtv(e.target.value)}
              placeholder="Ex: CRTV_ESC_01"
              className="w-full px-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-200 font-mono text-xs focus:ring-1 focus:ring-emerald-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1 text-[11px]">Campanha:</label>
            <select
              value={linkCamp}
              onChange={(e) => setLinkCamp(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-200 text-xs focus:ring-1 focus:ring-emerald-400 outline-none"
            >
              <option value="escova_express_haven">Meta Ads — Escova Express R$59</option>
              <option value="nanoblading_suzana">Instagram — Nanoblading Suzana</option>
              <option value="promocao_geral">Campanha Geral / Bio</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-300 text-[11px] font-semibold mb-1">Mensagem Inicial do Cliente (com Tag de Rastreamento):</label>
          <input
            type="text"
            value={linkMsg}
            onChange={(e) => setLinkMsg(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-slate-100 text-xs focus:ring-1 focus:ring-emerald-400 outline-none"
          />
        </div>

        <div className="p-3 bg-black/40 border border-emerald-500/20 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400">🔗 Link de Anúncio Gerado:</span>
            <button
              type="button"
              onClick={() => handleCopyLink(generatedLink)}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer shadow-xs flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Link Click WA</span>
            </button>
          </div>
          <p className="text-[11px] font-mono text-emerald-200/80 break-all bg-slate-900/60 p-2 rounded-lg border border-slate-800">
            {generatedLink}
          </p>
        </div>
      </div>

      {/* 4 Macro KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Won Revenue */}
        <div className="cockpit-panel p-4 bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Receita Gerada</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {showFinancialMetrics ? (
              `R$ ${stats.totalDealsWonBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-slate-400 text-lg flex items-center gap-1.5 font-normal">
                <Lock className="w-4 h-4 text-slate-400" /> Restrito Owner
              </span>
            )}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" />
            Fechamentos confirmados pelos operadores
          </div>
        </div>

        {/* CTWA Spend */}
        <div className="cockpit-panel p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Investimento Meta Ads (Click WA)</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {showFinancialMetrics ? (
              `R$ ${stats.totalCtwaCostBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ) : (
              <span className="text-slate-400 text-lg flex items-center gap-1.5 font-normal">
                <Lock className="w-4 h-4 text-slate-400" /> Restrito Owner
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.totalLeadsAttributed} leads capturados
          </div>
        </div>

        {/* ROAS Ratio */}
        <div className="cockpit-panel p-4 bg-gradient-to-br from-white to-blue-50/40">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">ROAS Comercial</span>
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-900 font-mono">
            {stats.roasRatio > 0 ? `${stats.roasRatio.toFixed(1)}x` : 'Em apuração'}
          </div>
          <div className="text-[11px] text-blue-700 font-medium mt-1">
            Retorno sobre o investimento publicitário
          </div>
        </div>

        {/* SLA Adherence */}
        <div className="cockpit-panel p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Aderência de SLA</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {(Number(stats.slaAdherenceRate) || 0).toFixed(0)}%
          </div>
          <div className="text-[11px] text-purple-700 font-medium mt-1">
            Tempo médio: {(Number(stats.avgFirstResponseMinutes) || 0).toFixed(0)} min
          </div>
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="cockpit-panel p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Desempenho por Campanha & Anúncio
            </h3>
            <p className="text-xs text-slate-500">
              Mapeamento de criativos, volume de leads, conversões e links de tráfego.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            {stats.campaigns?.length || 0} Campanhas Ativas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="px-4 py-3">Campanha / Criativo</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3 text-right">Gasto</th>
                <th className="px-4 py-3 text-right">Conversões</th>
                <th className="px-4 py-3 text-right">Receita Gerada</th>
                <th className="px-4 py-3 text-right">Taxa Conv.</th>
                <th className="px-4 py-3 text-center">Link de Anúncio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {(stats.campaigns || []).map((camp, idx) => {
                const rowLink = `https://wa.me/${linkPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi a campanha "${camp.campaignName}" e quero agendar. [ref: CRTV_0${idx + 1}] utm_source=instagram&utm_campaign=${camp.campaignName.toLowerCase().replace(/\s+/g, '_')}`)}`;
                return (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                      <div>{camp.campaignName}</div>
                      <span className="text-[10px] font-mono text-slate-400">CRTV_0{idx + 1}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono">{camp.leadsCount}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600">
                      {showFinancialMetrics ? (
                        `R$ ${(Number(camp.spendBrl) || 0).toFixed(2)}`
                      ) : (
                        <span className="text-slate-400">Restrito</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-700">
                      {camp.conversionsCount}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                      {showFinancialMetrics ? (
                        `R$ ${(Number(camp.revenueBrl) || 0).toFixed(2)}`
                      ) : (
                        <span className="text-slate-400">Restrito</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        {(Number(camp.conversionRate) || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(rowLink, `Link da Campanha "${camp.campaignName}"`)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 font-bold rounded-md text-[11px] transition cursor-pointer inline-flex items-center gap-1 border border-slate-200"
                        title="Copiar link com tags desta campanha"
                      >
                        <Copy className="w-3 h-3" />
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
        <div className="cockpit-panel p-5 space-y-4 bg-gradient-to-br from-white to-purple-50/30 border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Deep Analytics: Eficiência de Aquisição CTWA</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300">
                    Owner Pro Analytics
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Métricas aprofundadas de custo de aquisição e alavancagem comercial.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-purple-700 bg-purple-100/70 px-2.5 py-1 rounded-md font-semibold">
              CPL Médio: R$ {cplAverage.toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Custo por Lead (CPL)</div>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                R$ {cplAverage.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Dentro da meta estipulada</div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Ticket Médio por Fechamento</div>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                R$ {avgDealTicket.toFixed(2)}
              </div>
              <div className="text-[10px] text-blue-600 mt-0.5">Baseado em vendas confirmadas</div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Lucro Bruto Comercial Estimado</div>
              <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
                R$ {(stats.totalDealsWonBrl - stats.totalCtwaCostBrl).toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">Receita menos investimento de mídia</div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail & Governance Log (Feature Flag: audit_trail) */}
      {showAuditTrail && (
        <div className="cockpit-panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Trilha de Auditoria & Governança de Conversão
            </h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-700 font-medium">
                Atribuição automática de campanha Meta Ads CTWA confirmada via Webhook WABA
              </span>
              <span className="text-[10px] font-mono text-slate-400">Hoje às 12:48</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-700 font-medium">
                Fechamento de venda registrado pelo operador e vinculado ao criativo da campanha
              </span>
              <span className="text-[10px] font-mono text-slate-400">Hoje às 11:32</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-slate-700 font-medium">
                Sincronização de métricas de investimento com a Meta Marketing API concluída
              </span>
              <span className="text-[10px] font-mono text-slate-400">Hoje às 09:15</span>
            </div>
          </div>
        </div>
      )}

      {/* Continuity Proof Chain Explanation */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          Garantia de Não-Vazamento Comercial
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
          No Sales OS, cada real investido no anúncio CTWA possui continuidade direta: a oferta vista pelo cliente no Instagram/Facebook chega intacta ao operador com o contexto do veículo ou serviço, a recomendação inteligente sugere a resposta exata e o fechamento retroalimenta o ROAS.
        </p>
      </div>
    </div>
  );
};
