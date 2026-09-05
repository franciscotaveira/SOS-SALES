import React, { useState } from 'react';
import {
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Smartphone,
  Sliders,
  Calendar,
  Columns3,
  Flame,
  Minimize2,
  Maximize2,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { NavigationTab } from '../layout/AppShell';

export interface AssistedTutorialModalProps {
  currentWorkspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab: (tab: NavigationTab, subTab?: string) => void;
  isChannelOnline?: boolean;
  isOfficialChannelConfigured?: boolean;
}

export interface TutorialStep {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accentColor: string;
  description: string;
  practicalValue: string;
  actionLabel?: string;
  targetTab?: NavigationTab;
  targetSubTab?: string;
  proTip: string;
}

export function AssistedTutorialModal({
  currentWorkspace,
  isOpen,
  onClose,
  onNavigateToTab,
  isChannelOnline = false,
  isOfficialChannelConfigured = false,
}: AssistedTutorialModalProps) {
  // Saved step in localStorage
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('sos_tutorial_step');
      const parsed = saved ? parseInt(saved, 10) : 0;
      return isNaN(parsed) ? 0 : Math.max(0, Math.min(parsed, 5));
    } catch {
      return 0;
    }
  });

  // Dock mode: minimized floating bottom bar allowing user to click & configure on the live screen
  const [isDocked, setIsDocked] = useState<boolean>(false);

  // Completed steps tracking
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sos_tutorial_completed_steps');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const steps: TutorialStep[] = [
    {
      id: 'step_cockpit',
      badge: 'Etapa 1 de 6 · Filosofia Operacional',
      title: 'Cockpit Agora: Vendas Rápidas Sem Ruído',
      subtitle: 'Como gerenciar conversas sem sobrecarregar sua equipe',
      icon: Flame,
      accentColor: '#DC2626',
      description:
        'O Cockpit Agora é o centro de controle do SOS Vendas. Esqueça listas confusas de WhatsApp: aqui os leads são priorizados por temperatura (🔥 Quente, ⚡ Morno, ❄️ Frio) com SLA de resposta visível.',
      practicalValue:
        '• Master-Detail fluido: Fila à esquerda, Chat 1:1 ao centro, Dossiê do Lead com IA à direita.\n• Anti-colisão: múltiplos atendentes podem operar o mesmo WhatsApp sem responder por cima do colega.\n• Ações em 1 clique: Assumir conversa, Concluir atendimento e gerar Dossiê com IA.',
      actionLabel: 'Explorar o Cockpit Agora',
      targetTab: 'agora',
      proTip: 'Use o botão "Dossiê" no topo do chat para que a IA resuma em 3 segundos todo o histórico do cliente antes de você digitar.',
    },
    {
      id: 'step_whatsapp',
      badge: 'Etapa 2 de 6 · Infraestrutura',
      title: 'Conecte seu WhatsApp Comercial',
      subtitle: 'O motor que alimenta suas conversas e notificações',
      icon: Smartphone,
      accentColor: '#00A884',
      description:
        'O SOS Vendas suporta dois motores simultâneos: conexão direta via QR Code (WAHA) para começar em 30 segundos, ou Meta Cloud API Oficial (WABA) para quem busca escala máxima, botões interativos e selo de verificação.',
      practicalValue:
        '• QR Code Instantâneo: Escaneie pelo WhatsApp no celular e comece a operar imediatamente.\n• Meta WABA Oficial: Permite envio de mensagens ativas (templates aprovados), catálogo e botões nativos.\n• Zero bloqueio: Sistema com fila de envio idempotente e proteção anti-ban.',
      actionLabel: 'Conectar WhatsApp Agora',
      targetTab: 'configuracoes',
      targetSubTab: 'canais',
      proTip: 'Se você já tem tráfego rodando no Meta Ads, conecte a API Oficial para habilitar o traqueamento fechado de conversões.',
    },
    {
      id: 'step_ai_receptionist',
      badge: 'Etapa 3 de 6 · Vendedor 24/7',
      title: 'Parametrize sua IA de Atendimento',
      subtitle: 'O atendente que não dorme, não folga e não perde vendas',
      icon: Sliders,
      accentColor: '#7C3AED',
      description:
        'A IA do SOS Vendas é alimentada pelo motor soberano NVIDIA NIM. Ela entende áudios de clientes, lê comprovantes PIX enviados em foto e responde dúvidas com o tom de voz exato do seu negócio.',
      practicalValue:
        '• Recepção Noturna & Finais de Semana: Garante resposta imediata quando sua equipe física não estiver disponível.\n• Limites e Guardrails: Defina o teto máximo de desconto que a IA pode oferecer (ex: até 10%).\n• Handoff Humano: A IA transfere o lead imediatamente para o atendente quando ele pede para falar com humano.',
      actionLabel: 'Configurar Regras da IA',
      targetTab: 'configuracoes',
      targetSubTab: 'ai_runtime',
      proTip: 'No Playbook Comercial, defina as 3 principais objeções dos seus clientes e as respostas ideais que a IA deve usar.',
    },
    {
      id: 'step_agenda',
      badge: 'Etapa 4 de 6 · Agilidade Comercial',
      title: 'Espelhamento de Agenda Comercial',
      subtitle: 'Consulte horários vagos e agende sem sair da tela do lead',
      icon: Calendar,
      accentColor: '#2563EB',
      description:
        'Vendedor que troca de aplicativo perde o foco da venda. Com o espelhamento de agenda, você consulta a sua ferramenta de agendamento (Trinks, Google Calendar ou agendador próprio) direto no Cockpit.',
      practicalValue:
        '• Atalho Universal: Pressione Alt + A a qualquer momento no Cockpit para abrir a gaveta de horários.\n• Sem conflito de agenda: Vendedor vê os horários vagos em tempo real enquanto digita a resposta.\n• Envio com 1 clique: Insira as opções de horários na conversa do WhatsApp instantaneamente.',
      actionLabel: 'Ver Tela de Agenda',
      targetTab: 'agenda',
      proTip: 'Configure o link da agenda web da sua empresa para que os atendentes nunca mais precisem conferir no celular.',
    },
    {
      id: 'step_kanban_capi',
      badge: 'Etapa 5 de 6 · Lucro & Tráfego Fechado',
      title: 'Funil Kanban & CAPI do Meta Ads',
      subtitle: 'O segredo para baratear o custo por lead em até 40%',
      icon: Columns3,
      accentColor: '#D97706',
      description:
        'O Funil do SOS Vendas não serve apenas para organizar leads em colunas. O verdadeiro superpoder é o loop fechado com a Meta Conversions API (CAPI): quando você fecha uma venda, a Meta aprende quem é seu cliente pagador.',
      practicalValue:
        '• 5 Etapas Canônicas: Novo Lead → Qualificação → Proposta → Fechamento → Ganha.\n• Disparo Automático de CAPI: Ao arrastar para "Ganha", o evento de Purchase é enviado ao Meta Pixel com valor monetário.\n• Algoritmo Inteligente: O Meta Ads passa a buscar clientes semelhantes aos que realmente pagaram, não curiosos.',
      actionLabel: 'Abrir Funil Kanban',
      targetTab: 'kanban',
      proTip: 'Sempre mova o lead para "Ganha" com o valor real da venda para otimizar suas campanhas por ROAS (retorno financeiro).',
    },
    {
      id: 'step_checklist',
      badge: 'Etapa 6 de 6 · Pronto para o Tráfego',
      title: 'Checklist de Ativação & Go-Live',
      subtitle: 'Validação final de prontidão para comercialização',
      icon: CheckCircle2,
      accentColor: '#10B981',
      description:
        'Parabéns! Você concluiu a jornada de entendimento do SOS Vendas. Abaixo está o seu checklist de prontidão para abrir o tráfego e começar a fechar clientes no WhatsApp.',
      practicalValue:
        '• [x] Cockpit dominado: Fila de prioridades e master-detail entendidos.\n• [x] Conexão WhatsApp: Número comercial ativo para troca de mensagens.\n• [x] IA Parametrizada: Guardrails de atendimento e horários ajustados.\n• [x] Agenda conectada: Consulta ágil de horários liberada.\n• [x] Funil & CAPI: Prontos para traquear compras no Meta Ads.',
      actionLabel: 'Ir para o Cockpit e Começar a Vender',
      targetTab: 'agora',
      proTip: 'Você pode reabrir este Guia a qualquer momento clicando no botão "Guia de Início" no topo do sistema.',
    },
  ];

  const currentStep = steps[currentStepIndex];
  const totalSteps = steps.length;
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  // Sync index to localStorage
  const handleSetStep = (index: number) => {
    const valid = Math.max(0, Math.min(index, totalSteps - 1));
    setCurrentStepIndex(valid);
    try {
      localStorage.setItem('sos_tutorial_step', valid.toString());
    } catch {
      // ignore
    }
  };

  const markCurrentStepDone = () => {
    const updated = { ...completedSteps, [currentStep.id]: true };
    setCompletedSteps(updated);
    try {
      localStorage.setItem('sos_tutorial_completed_steps', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleNext = () => {
    markCurrentStepDone();
    if (currentStepIndex < totalSteps - 1) {
      handleSetStep(currentStepIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      handleSetStep(currentStepIndex - 1);
    }
  };

  const handleAction = () => {
    markCurrentStepDone();
    if (currentStep.targetTab) {
      onNavigateToTab(currentStep.targetTab, currentStep.targetSubTab);
      // Minimize to dock so user can see and work on the target screen
      setIsDocked(true);
    }
  };

  const handleFinish = () => {
    markCurrentStepDone();
    try {
      localStorage.setItem('sos_tutorial_completed', 'true');
    } catch {
      // ignore
    }
    setIsDocked(false);
    onClose();
  };

  const handleReset = () => {
    handleSetStep(0);
    setCompletedSteps({});
    try {
      localStorage.removeItem('sos_tutorial_completed_steps');
      localStorage.removeItem('sos_tutorial_step');
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  // Render DOCKED MODE (Floating Bottom Bar)
  if (isDocked) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-[480px] z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-[#0B132B]/95 backdrop-blur-md border border-[#00A884]/40 rounded-2xl shadow-2xl p-3.5 text-white flex flex-col gap-2.5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#00A884]/20 text-[#00A884]">
                <currentStep.icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold text-slate-200">
                Guia Assistido · Passo {currentStepIndex + 1}/{totalSteps}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsDocked(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                title="Expandir Tutorial"
                aria-label="Expandir Tutorial"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                title="Fechar Tutorial"
                aria-label="Fechar Tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Current Step Brief */}
          <div className="text-xs text-slate-300">
            <p className="font-semibold text-white truncate">{currentStep.title}</p>
            <p className="text-[11px] text-slate-400 line-clamp-1">{currentStep.proTip}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#00A884] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs font-bold bg-[#00A884] text-slate-950 rounded-xl hover:bg-[#00A884]/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {currentStepIndex === totalSteps - 1 ? 'Concluir' : 'Próximo Passo'}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render FULL MODAL / EXPANDED MODE
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#0B132B] border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-white my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header com gradiente */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-r from-[#001f18] via-[#0B132B] to-[#151f42] border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg border border-white/10 shrink-0"
              style={{ backgroundColor: `${currentStep.accentColor}22` }}
            >
              <currentStep.icon className="w-6 h-6" style={{ color: currentStep.accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#00A884] bg-[#00A884]/15 px-2 py-0.5 rounded-full border border-[#00A884]/30">
                  {currentStep.badge}
                </span>
                <span className="text-[11px] text-slate-400">
                  Workspace: <strong className="text-slate-200">{currentWorkspace.name}</strong>
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold font-heading text-white mt-1">
                {currentStep.title}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">{currentStep.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsDocked(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              title="Minimizar para Guia Flutuante"
              aria-label="Minimizar para Guia Flutuante"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
              title="Fechar Guia"
              aria-label="Fechar Guia"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Progresso com Seletor de Etapas */}
        <div className="px-5 sm:px-6 pt-3 pb-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-1 overflow-x-auto scrollbar-none">
          {steps.map((step, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isCompleted = completedSteps[step.id];
            const StepIcon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => handleSetStep(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-[#00A884] text-slate-950 font-bold shadow-xs'
                    : isCompleted
                    ? 'text-[#00A884] hover:bg-slate-800/60'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <StepIcon className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate max-w-[90px]">{step.title.split(':')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Corpo do Passo Atual */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Descrição principal */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-sm text-slate-200 leading-relaxed">
            {currentStep.description}
          </div>

          {/* O que você ganha / Como operar */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold tracking-wide uppercase text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Pontos Chave da Operação
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 space-y-2 whitespace-pre-line leading-relaxed">
              {currentStep.practicalValue}
            </div>
          </div>

          {/* Dica de Ouro Comercial */}
          <div className="p-3 rounded-xl bg-[#001f18] border border-[#00A884]/30 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-[#00A884] shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-[#00A884]">Dica Comercial SOS Vendas: </span>
              <span className="text-slate-200">{currentStep.proTip}</span>
            </div>
          </div>

          {/* Status dinâmico se for a etapa do WhatsApp */}
          {currentStep.id === 'step_whatsapp' && (
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isChannelOnline
                      ? 'bg-emerald-400 animate-pulse'
                      : isOfficialChannelConfigured
                      ? 'bg-sky-400'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="text-slate-300">
                  Status atual do seu WhatsApp:{' '}
                  <strong className={isChannelOnline ? 'text-emerald-400' : 'text-amber-400'}>
                    {isChannelOnline
                      ? 'Conectado e Online'
                      : isOfficialChannelConfigured
                      ? 'WABA Configurado'
                      : 'Aguardando Conexão'}
                  </strong>
                </span>
              </div>
              {isChannelOnline && (
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                  Pronto para Operar
                </span>
              )}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="p-4 sm:p-5 bg-slate-900/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <button
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              onClick={handleReset}
              className="px-2.5 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Reiniciar tutorial do zero"
            >
              <RotateCcw className="w-3 h-3" /> Reiniciar
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {currentStep.actionLabel && currentStep.targetTab && (
              <button
                onClick={handleAction}
                className="flex-1 sm:flex-initial px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Play className="w-3.5 h-3.5 text-[#00A884]" />
                {currentStep.actionLabel}
              </button>
            )}

            <button
              onClick={handleNext}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold bg-[#00A884] hover:bg-[#00A884]/90 active:scale-95 text-slate-950 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-[#00A884]/20"
            >
              {currentStepIndex === totalSteps - 1 ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Concluir e Ativar
                </>
              ) : (
                <>
                  Próxima Etapa <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
