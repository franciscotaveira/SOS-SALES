import React from 'react';
import {
  ShieldCheck,
  Zap,
  Check,
  X,
  Sparkles,
  Layers,
  Award,
  Lock,
  Clock,
  DollarSign,
  TrendingUp,
  Cpu,
} from 'lucide-react';

export const MetaAiBenchmarkSection: React.FC = () => {
  const comparisonData = [
    {
      feature: 'Conhecimento Oficial do Catálogo & Preços',
      metaAi: 'Genérico ou com dados desatualizados do Instagram',
      ourAgent: 'Sincronização 100% oficial via Meta Commerce API + Preço Mínimo',
      status: 'winner',
    },
    {
      feature: 'Proteção de Margem & Alçada de Desconto',
      metaAi: 'Não possui controle de margem (risco de prometer preço errado)',
      ourAgent: 'Guardrail rígido: desconto máximo fixado por cliente e aprovação de gestor',
      status: 'winner',
    },
    {
      feature: 'Continuidade de Contexto do Anúncio (CTWA)',
      metaAi: 'Perde o criativo e o objetivo da campanha após poucas mensagens',
      ourAgent: 'Dossiê Vivo permanente: guarda oferta do anúncio, headline e CPA',
      status: 'winner',
    },
    {
      feature: 'Transição Humana com SLA (Handoff Seguro)',
      metaAi: 'IA tenta responder indefinidamente ou trava no chat',
      ourAgent: 'Transfere para o atendente com contagem regressiva de SLA no Cockpit',
      status: 'winner',
    },
    {
      feature: 'Aprendizado Contínuo com Feedbacks Locais',
      metaAi: 'Modelo estático global da Meta',
      ourAgent: 'RLHF local: correções do operador viram novas regras imediatamente',
      status: 'winner',
    },
    {
      feature: 'Isolamento de Dados por Cliente (Multi-tenant)',
      metaAi: 'Misto no ecossistema Meta',
      ourAgent: 'Bancos e Vector Stores estritamente particionados por cliente',
      status: 'winner',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#00A884]" />
            <h2 className="text-lg font-bold font-heading">
              Arquitetura de Paridade & Superioridade com a Meta Business AI
            </h2>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-800 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Meta Cloud API Oficial
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-3xl">
            Como combinamos o poder da infraestrutura oficial da Meta (Cloud API, Flows e Catálogo) com a inteligência comercial sob medida do seu cliente.
          </p>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-heading">
            Matriz Comparativa: Meta AI Pura vs. Agente SOS Vendas OS
          </h3>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {comparisonData.map((row, idx) => (
            <div
              key={idx}
              className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-slate-50/60 transition-colors"
            >
              <div className="md:col-span-4 font-bold text-slate-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00A884]" />
                {row.feature}
              </div>

              <div className="md:col-span-4 p-2.5 rounded-lg bg-slate-100/80 text-slate-600 space-y-0.5">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Meta Business AI Padrão
                </span>
                <p className="text-[11.5px]">{row.metaAi}</p>
              </div>

              <div className="md:col-span-4 p-2.5 rounded-lg bg-emerald-50 text-emerald-950 border border-emerald-200 space-y-0.5">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> Nosso Agente de IA Comercial
                </span>
                <p className="text-[11.5px] font-semibold">{row.ourAgent}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4 Pillars of Excellence */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
            <DollarSign className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-slate-900 font-heading">
            1. Margem & Alçadas Blindadas
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            A IA nunca concede descontos fora do limite configurado para o cliente, protegendo a lucratividade de cada venda.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-slate-900 font-heading">
            2. Dossiê Vivo Persistente
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            A IA sabe o que o cliente comprou há 3 meses, suas preferências de horário e restrições sem precisar perguntar de novo.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <Clock className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-slate-900 font-heading">
            3. Handoff com SLA Humano
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Se a negociação exigir um operador humano, a passagem de bastão é instantânea com dossiê completo de contexto.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <Cpu className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-bold text-slate-900 font-heading">
            4. Motor RAG Multimodal
          </h4>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Lê PDFs, DOCX, planilhas Excel e fotos de catálogo para dar respostas precisas, rápidas e fundamentadas.
          </p>
        </div>
      </div>
    </div>
  );
};
