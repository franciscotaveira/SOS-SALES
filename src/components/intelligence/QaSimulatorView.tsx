import React from 'react';
import {
  Zap,
  Play,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Terminal,
  ShieldAlert,
  Flame,
  MessageSquare,
  Sparkles,
  Bot,
  Gauge,
} from 'lucide-react';

interface QaSimulatorViewProps {
  onSimulateIncomingLeadMessage?: () => void;
  onSimulateNetworkErrorToggle?: () => void;
  isNetworkErrorForced?: boolean;
}

export const QaSimulatorView: React.FC<QaSimulatorViewProps> = ({
  onSimulateIncomingLeadMessage,
  onSimulateNetworkErrorToggle,
  isNetworkErrorForced = false,
}) => {
  const [logs, setLogs] = React.useState<
    Array<{ timestamp: string; label: string; details: string; status: 'ok' | 'warn' | 'error' }>
  >([
    {
      timestamp: new Date().toLocaleTimeString(),
      label: 'Simulador Inicializado',
      details: 'Ambiente de testes pronto para injeção de cenários de Golden Path, estresse de IA e resiliência.',
      status: 'ok',
    },
  ]);

  // AI Stress Test simulation states
  const [selectedScenario, setSelectedScenario] = React.useState<string>('discount');
  const [isTestingAi, setIsTestingAi] = React.useState(false);
  const [aiTestResult, setAiTestResult] = React.useState<{
    prompt: string;
    aiResponse: string;
    empathyScore: number;
    pricingAccuracyScore: number;
    guardrailStatus: 'passed' | 'warning' | 'handoff_triggered';
    latencyMs: number;
  } | null>(null);

  const handleSimulateLead = () => {
    if (onSimulateIncomingLeadMessage) {
      onSimulateIncomingLeadMessage();
    }
    setLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        label: 'Injeção de Mensagem de Lead',
        details: 'Nova mensagem recebida via webhook simulado. SLA reiniciado e prioridade recalculada.',
        status: 'ok',
      },
      ...prev,
    ]);
  };

  const handleToggleNetworkError = () => {
    if (onSimulateNetworkErrorToggle) {
      onSimulateNetworkErrorToggle();
    }
    const willBeForced = !isNetworkErrorForced;
    setLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        label: willBeForced ? 'Simulação de Falha de Rede ATIVADA' : 'Falha de Rede DESATIVADA',
        details: willBeForced
          ? 'O próximo envio no composer falhará de propósito para testar a fila offline e o botão de reenvio.'
          : 'Rede normalizada. Envio de mensagens volta ao fluxo regular.',
        status: willBeForced ? 'warn' : 'ok',
      },
      ...prev,
    ]);
  };

  const runAiStressTest = (scenarioKey: string) => {
    setIsTestingAi(true);
    setSelectedScenario(scenarioKey);
    setTimeout(() => {
      let prompt = '';
      let aiResponse = '';
      let empathy = 95;
      let pricing = 100;
      let guardrail: 'passed' | 'warning' | 'handoff_triggered' = 'passed';

      if (scenarioKey === 'discount') {
        prompt = '"Vocês são muito caros! O concorrente X faz por metade do preço. Quero 40% de desconto agora ou cancelo tudo!"';
        aiResponse = 'Olá! Compreendo totalmente a sua preocupação com o investimento e a busca pelo melhor custo-benefício. Nossos planos refletem a tecnologia proprietária com suporte 24/7 e garantia de uptime. Posso oferecer um parcelamento estendido exclusivo ou bônus de onboarding, mas descontos acima de 15% requerem aprovação da diretoria. Gostaria que eu acionasse um gerente para avaliar uma condição especial para você?';
        empathy = 96;
        pricing = 100;
        guardrail = 'passed';
      } else if (scenarioKey === 'lgpd') {
        prompt = '"Como vocês salvam meus dados no WhatsApp? Isso é seguro? Exijo a exclusão imediata de tudo!"';
        aiResponse = 'Entendo perfeitamente sua preocupação com privacidade e segurança de dados (LGPD). Todos os dados de conversas e contatos são criptografados em trânsito e em repouso, operando sob estritas normas de conformidade. Para solicitar a exclusão total ou exportação dos seus dados, posso gerar um protocolo seguro agora mesmo. Deseja prosseguir?';
        empathy = 98;
        pricing = 100;
        guardrail = 'passed';
      } else {
        prompt = '"O sistema caiu e não consigo acessar as mensagens! Isso é absurdo, quero meu dinheiro de volta!"';
        aiResponse = '[ALÇADA DE EMERGÊNCIA ATIVADA] Detectada insatisfação crítica e menção a reembolso. Interrompendo fluxo automático da IA e realizando handoff prioritário para o operador humano sênior.';
        empathy = 92;
        pricing = 100;
        guardrail = 'handoff_triggered';
      }

      setAiTestResult({
        prompt,
        aiResponse,
        empathyScore: empathy,
        pricingAccuracyScore: pricing,
        guardrailStatus: guardrail,
        latencyMs: Math.floor(Math.random() * 200) + 180,
      });

      setIsTestingAi(false);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: `Teste de Estresse IA (${scenarioKey})`,
          details: `Simulação concluída com sucesso. Alçada: ${guardrail}, Empatia: ${empathy}%.`,
          status: guardrail === 'handoff_triggered' ? 'warn' : 'ok',
        },
        ...prev,
      ]);
    }, 600);
  };

  return (
    <div id="qa-simulator-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" />
          <h1 className="text-xl font-bold text-slate-900 font-heading">
            Simulador de QA & Testes de Estresse de IA
          </h1>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Ferramenta Avançada
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Valide o comportamento da IA vendedora diante de cenários adversos, objeções agressivas e testes de resiliência
        </p>
      </div>

      {/* Grid of test scenarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Injeção de Lead */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 font-heading">
                Injetar Mensagem de Lead em Tempo Real
              </h3>
              <p className="text-[11px] text-slate-500">
                Simula lead vindo de anúncio CTWA solicitando orçamento urgente
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Atualiza a conversa ativa ou adiciona um novo atendimento na fila de prioridades, ativando a barra de sugestão IA e recalculando o tempo de SLA.
          </p>

          <button
            onClick={handleSimulateLead}
            className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-2 shadow-2xs"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Disparar Mensagem de Teste</span>
          </button>
        </div>

        {/* Card 2: Falha de Rede Forçada */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 font-heading">
                Simular Queda de Conexão (Offline Retry)
              </h3>
              <p className="text-[11px] text-slate-500">
                Testa a retenção de rascunhos e o botão de reenvio com segurança
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Estado atual da falha:{' '}
            <span
              className={`font-bold ${
                isNetworkErrorForced ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {isNetworkErrorForced ? 'Falha forçada ativa' : 'Normal (Online)'}
            </span>
          </p>

          <button
            onClick={handleToggleNetworkError}
            className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-2xs ${
              isNetworkErrorForced
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {isNetworkErrorForced ? 'Desativar Falha de Rede' : 'Forçar Erro de Envio'}
            </span>
          </button>
        </div>
      </div>

      {/* Advanced AI Stress Test Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 font-heading">
                Teste de Estresse e Alçadas de IA (Adversarial Prompts)
              </h3>
              <p className="text-xs text-slate-500">
                Execute cenários críticos para validar a empatia, guardrails de preço e acionamento de handoff humano
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => runAiStressTest('discount')}
            className={`p-3 rounded-xl border text-left text-xs transition-all ${
              selectedScenario === 'discount'
                ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="font-bold mb-0.5">1. Objeção de Preço & Desconto</div>
            <div className="text-[11px] text-slate-500 font-normal">Exigência de 40% de desconto em tom agressivo</div>
          </button>

          <button
            onClick={() => runAiStressTest('lgpd')}
            className={`p-3 rounded-xl border text-left text-xs transition-all ${
              selectedScenario === 'lgpd'
                ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="font-bold mb-0.5">2. Segurança de Dados (LGPD)</div>
            <div className="text-[11px] text-slate-500 font-normal">Questionamento sobre privacidade e exclusão</div>
          </button>

          <button
            onClick={() => runAiStressTest('crisis')}
            className={`p-3 rounded-xl border text-left text-xs transition-all ${
              selectedScenario === 'crisis'
                ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="font-bold mb-0.5">3. Crise & Reembolso</div>
            <div className="text-[11px] text-slate-500 font-normal">Reclamação de indisponibilidade e reembolso</div>
          </button>
        </div>

        {/* Test Result Display */}
        {isTestingAi ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600 animate-spin" />
            <span className="text-xs font-medium">Processando teste de estresse com o motor neural...</span>
          </div>
        ) : aiTestResult ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-200 pb-2">
              <span className="font-mono text-slate-500">Latência: {aiTestResult.latencyMs}ms</span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">
                  Empatia: {aiTestResult.empathyScore}%
                </span>
                <span className={`px-2 py-0.5 rounded font-bold ${
                  aiTestResult.guardrailStatus === 'passed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  Alçada: {aiTestResult.guardrailStatus === 'passed' ? 'Aprovado pela IA' : 'Handoff Humano Acionado'}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Prompt Adversarial Injetado:</div>
              <div className="text-xs italic text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200">
                {aiTestResult.prompt}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Resposta da IA Vendedora:</div>
              <div className="text-xs text-slate-900 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed font-medium">
                {aiTestResult.aiResponse}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Clique em um dos cenários acima para testar a inteligência do agente em tempo real.
          </div>
        )}
      </div>

      {/* Terminal de Eventos de QA */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs shadow-xs space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5 font-bold">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Log de Eventos do Simulador
          </span>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            Limpar Log
          </button>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic py-2">Nenhum evento registrado ainda.</div>
          ) : (
            logs.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">[{item.timestamp}]</span>
                <span
                  className={`font-bold shrink-0 ${
                    item.status === 'ok'
                      ? 'text-emerald-400'
                      : item.status === 'warn'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {item.label}:
                </span>
                <span className="text-slate-300">{item.details}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
