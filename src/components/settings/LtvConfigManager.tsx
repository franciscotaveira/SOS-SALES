import React, { useState, useEffect } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Sparkles,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  MessageSquare,
  HelpCircle,
  RotateCcw,
  Zap,
} from 'lucide-react';

export interface LtvCycleRule {
  id: string;
  servicePattern: string;
  cycleDays: number;
  templateMessage: string;
  active: boolean;
}

const DEFAULT_LTV_RULES: LtvCycleRule[] = [
  {
    id: '1',
    servicePattern: 'Tratamento Capilar & Cronograma',
    cycleDays: 21,
    templateMessage: 'Oi {nome}! Faz {dias} dias do seu {servico}. Como seu cabelo tem respondido? Já separei um espacinho exclusivo para a próxima etapa do seu cronograma!',
    active: true,
  },
  {
    id: '2',
    servicePattern: 'Manicure & Esmaltação em Gel',
    cycleDays: 18,
    templateMessage: 'Oi {nome}! Faz {dias} dias da sua esmaltação. Vamos garantir seu horário de manutenção para manter suas unhas impecáveis e saudáveis?',
    active: true,
  },
  {
    id: '3',
    servicePattern: 'Escova Modelada & Corte',
    cycleDays: 14,
    templateMessage: 'Oi {nome}! Passando para ver se você quer renovar sua escova e corte para o final de semana. Quer que eu veja os horários de sexta ou sábado?',
    active: true,
  },
  {
    id: '4',
    servicePattern: 'Odontologia / Limpeza / Revisão',
    cycleDays: 180,
    templateMessage: 'Oi {nome}! Já faz 6 meses da sua última limpeza preventiva. A saúde do seu sorriso está em dia? Vamos agendar seu check-up sem custo de avaliação?',
    active: false,
  },
  {
    id: '5',
    servicePattern: 'Estética Automotiva / Revisão',
    cycleDays: 60,
    templateMessage: 'Oi {nome}! Faz 60 dias da aplicação no seu veículo. Passando para agendar a lavagem técnica de manutenção para proteger o brilho!',
    active: false,
  },
];

interface LtvConfigManagerProps {
  workspace: Workspace;
}

export const LtvConfigManager: React.FC<LtvConfigManagerProps> = ({ workspace }) => {
  const [rules, setRules] = useState<LtvCycleRule[]>(() => {
    try {
      const saved = localStorage.getItem(`sos_ltv_rules_${workspace.id}`);
      return saved ? JSON.parse(saved) : DEFAULT_LTV_RULES;
    } catch {
      return DEFAULT_LTV_RULES;
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleAddRule = () => {
    const newRule: LtvCycleRule = {
      id: String(Date.now()),
      servicePattern: 'Novo Serviço / Produto',
      cycleDays: 30,
      templateMessage: 'Oi {nome}! Faz {dias} dias do seu {servico}. Vamos agendar sua renovação exclusiva esta semana?',
      active: true,
    };
    setRules((prev) => [...prev, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRule = (id: string, updates: Partial<LtvCycleRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      localStorage.setItem(`sos_ltv_rules_${workspace.id}`, JSON.stringify(rules));
      setToastMessage('Matriz de LTV & Recorrência salva com sucesso!');
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage('Erro ao salvar localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Deseja restaurar os ciclos de recorrência padrão?')) {
      setRules(DEFAULT_LTV_RULES);
      localStorage.setItem(`sos_ltv_rules_${workspace.id}`, JSON.stringify(DEFAULT_LTV_RULES));
      setToastMessage('Regras restauradas com sucesso.');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="p-5 bg-gradient-to-r from-purple-900/10 via-purple-900/5 to-transparent border border-purple-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-purple-600 text-white rounded-lg">
              <Sparkles size={16} />
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Matriz Universal de LTV & Recorrência Pós-Venda
            </h2>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-extrabold rounded-full border border-purple-200 uppercase">
              Level 5 Soberano
            </span>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
            Configure a periodicidade biológica ou comercial de retorno dos seus clientes. O motor de IA do SOS Vendas dispara lembretes e ofertas na janela de maior probabilidade de recompra.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="Restaurar valores padrão"
          >
            <RotateCcw size={13} /> Padrões
          </button>
          <button
            type="button"
            onClick={handleAddRule}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Plus size={14} /> Novo Serviço
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <Save size={14} /> {isSaving ? 'Salvando...' : 'Salvar Matriz'}
          </button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule, idx) => (
          <div
            key={rule.id}
            className={`p-4 rounded-2xl border transition-all ${
              rule.active
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-50/70 border-slate-200/60 opacity-60'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Column: Service Title & Active Toggle */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={rule.active}
                  onChange={(e) => handleUpdateRule(rule.id, { active: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                  title="Ativar ou desativar esta regra de recorrência"
                />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={rule.servicePattern}
                    onChange={(e) => handleUpdateRule(rule.id, { servicePattern: e.target.value })}
                    placeholder="Nome do Serviço ou Palavras-chave..."
                    className="w-full text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-purple-600 focus:outline-none px-1 py-0.5"
                  />
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <Clock size={11} className="text-purple-600" />
                    <span>Ciclo de Recompra: <strong className="text-slate-800">{rule.cycleDays} dias</strong></span>
                  </div>
                </div>
              </div>

              {/* Middle Column: Interactive Days Slider */}
              <div className="w-full lg:w-72 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
                  <span>Periodicidade:</span>
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-mono font-bold text-xs">
                    {rule.cycleDays} dias
                  </span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="365"
                  step="1"
                  value={rule.cycleDays}
                  onChange={(e) => handleUpdateRule(rule.id, { cycleDays: Number(e.target.value) })}
                  className="w-full accent-purple-600 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
                  <span>7d (Semanal)</span>
                  <span>30d (Mensal)</span>
                  <span>180d (Semestral)</span>
                  <span>365d (Anual)</span>
                </div>
              </div>

              {/* Right Column: Delete Action */}
              <div className="flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => handleRemoveRule(rule.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Excluir regra"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Template Message Box */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span className="flex items-center gap-1 font-semibold">
                  <MessageSquare size={11} className="text-purple-600" /> Mensagem WhatsApp de Reativação:
                </span>
                <span className="font-mono text-slate-400">Variáveis: {'{nome}'}, {'{servico}'}, {'{dias}'}</span>
              </div>
              <textarea
                rows={2}
                value={rule.templateMessage}
                onChange={(e) => handleUpdateRule(rule.id, { templateMessage: e.target.value })}
                placeholder="Escreva a mensagem personalizada de pós-venda..."
                className="w-full text-xs text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 focus:bg-white focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
