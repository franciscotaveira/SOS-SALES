import React from 'react';
import { IntelligenceSource, IntelligenceDestination } from '../../types/intelligence';
import {
  ArrowRight,
  ArrowDown,
  Database,
  Brain,
  Zap,
  ShieldCheck,
  Radio,
  FileText,
  MessageSquare,
  Sparkles,
  Layers,
  Cpu,
  Send,
  Users,
  CheckCircle2,
  Lock,
  Activity,
} from 'lucide-react';

interface IntelligenceDataFlowSectionProps {
  sources: IntelligenceSource[];
  destinations: IntelligenceDestination[];
}

export const IntelligenceDataFlowSection: React.FC<IntelligenceDataFlowSectionProps> = ({
  sources,
  destinations,
}) => {
  const [activeStep, setActiveStep] = React.useState<'all' | 'sources' | 'processing' | 'destinations'>('all');

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#00A884]" />
            <h2 className="text-lg font-bold font-heading">
              Rastreabilidade da Inteligência (De Onde Vem ➔ Para Onde Vai)
            </h2>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Pipeline Auditável em Tempo Real
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl">
            Transparência total sobre a procedência dos dados que alimentam o agente (Meta CTWA, Catálogo WABA, Documentos e Feedbacks) e os destinos exatos onde a inteligência atua.
          </p>
        </div>
      </div>

      {/* Interactive Visual Flow Diagram */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
            Diagrama End-to-End do Pipeline de IA
          </span>
          <span className="text-[11px] text-[#00A884] font-mono flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00A884] animate-pulse"></span>
            Latência Média: 320ms • 0% Alucinação
          </span>
        </div>

        {/* 3 Columns Diagram */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
          {/* Column 1: ORIGENS (De Onde Vem) */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-heading">
                <Database className="w-3.5 h-3.5" /> 1. Origens (De Onde Vem)
              </span>
              <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                Ingestão Multimodal
              </span>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Meta Ads CTWA Payload</span>
                  <span className="text-[9px] bg-blue-900 text-blue-300 px-1.5 rounded">Meta API</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Criativo do anúncio, headline, oferta de entrada, CPA e intenção inicial do lead.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Catálogo Oficial Meta WABA</span>
                  <span className="text-[9px] bg-emerald-900 text-emerald-300 px-1.5 rounded">Commerce</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Produtos, SKUs, fotos de alta resolução, preços oficiais e alçadas mínimas de desconto.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Documentos & Manuais (RAG)</span>
                  <span className="text-[9px] bg-purple-900 text-purple-300 px-1.5 rounded">PDF / Excel</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Tabelas de preço, manuais técnicos de serviço, biossegurança e scripts de vendas.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Feedback Humano (RLHF)</span>
                  <span className="text-[9px] bg-rose-900 text-rose-300 px-1.5 rounded">Operadores</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Correções feitas pelo atendente que geram aprendizado e aprimoram novas respostas.
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: PROCESSAMENTO (Motor de IA & Guardrails) */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-purple-700/60 space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 font-heading">
                <Brain className="w-3.5 h-3.5" /> 2. Raciocínio & Guardrails
              </span>
              <span className="text-[10px] bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded font-mono">
                RAG + Safety
              </span>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-200">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>Busca Semântica Híbrida</span>
                </div>
                <p className="text-[10.5px] text-purple-300/80">
                  Localização exata de trechos em milissegundos com embeddings de alta densidade.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Guardrails Financeiros & Margem</span>
                </div>
                <p className="text-[10.5px] text-purple-300/80">
                  Bloqueia concessão de descontos além da alçada autorizada e promessas inválidas.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-200">
                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Isolamento Total por Cliente</span>
                </div>
                <p className="text-[10.5px] text-purple-300/80">
                  Nenhum dado de um cliente vaza para outro. Base 100% particionada e segura.
                </p>
              </div>
            </div>
          </div>

          {/* Column 3: DESTINOS (Para Onde Vai) */}
          <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-heading">
                <Send className="w-3.5 h-3.5" /> 3. Destinos (Para Onde Vai)
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                Execução Comercial
              </span>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Cockpit Copilot (Operadores)</span>
                  <span className="text-[9px] bg-emerald-900 text-emerald-300 px-1.5 rounded">Rascunhos 1-Click</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Sugestões contextualizadas com evidências clicáveis no painel de atendimento.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>WhatsApp WABA Oficial</span>
                  <span className="text-[9px] bg-emerald-900 text-emerald-300 px-1.5 rounded">Meta Cloud API</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Respostas instantâneas para os clientes com botões rápidos e cards de catálogo.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Dossiê Vivo & Memória do Lead</span>
                  <span className="text-[9px] bg-purple-900 text-purple-300 px-1.5 rounded">Continuidade</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Gravação de fatos, orçamento negociado, preferências e prazos de compromisso.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-200">
                  <span>Hub de Grupos de WhatsApp</span>
                  <span className="text-[9px] bg-amber-900 text-amber-300 px-1.5 rounded">Gestão Agência</span>
                </div>
                <p className="text-[10.5px] text-slate-400">
                  Alertas de risco de SLA, relatórios de ROAS e insights de fechamento nos grupos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Sources & Destinations Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Origens Registradas */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 font-heading flex items-center gap-1.5">
              <Database className="w-4 h-4 text-amber-500" />
              Fontes de Alimentação Conectadas ({sources.length})
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Ingestão Segura</span>
          </div>

          <div className="space-y-2.5">
            {sources.map((src) => (
              <div
                key={src.id}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{src.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                    {src.badge}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">{src.description}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Volume: {src.count}</span>
                  <span>Última Sincronia: {src.lastSync}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Destinos Ativos */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900 font-heading flex items-center gap-1.5">
              <Send className="w-4 h-4 text-emerald-600" />
              Destinos de Aplicação & Execução ({destinations.length})
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Saídas Controladas</span>
          </div>

          <div className="space-y-2.5">
            {destinations.map((dst) => (
              <div
                key={dst.id}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{dst.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Latência {dst.latency}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">{dst.description}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Throughput: {dst.throughput}</span>
                  <span className="font-mono text-emerald-600 font-semibold">Status: Ativo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
