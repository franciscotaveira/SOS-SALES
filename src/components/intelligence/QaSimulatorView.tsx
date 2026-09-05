import React, { useState } from 'react';
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
  Send,
  Camera,
  Calendar,
  DollarSign,
  ShieldCheck,
  Building2,
  Sparkle,
  Layers,
  ArrowRight,
  Clock,
  Edit3,
  Sliders,
  Wand2,
  CornerDownLeft,
  Target,
  ListChecks,
  Compass,
  Check,
  Loader2,
  ExternalLink,
  ChevronRight,
  Settings,
  Plus,
  Trash2,
  BookOpen,
  FileText,
  Save,
  RefreshCw,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { GlobalAiAutonomyMode } from '../../services/aiAutonomyManager';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { InferredDossier, analyzeConversationDossier } from '../../utils/cognitiveAnalyzer';

interface QaSimulatorViewProps {
  currentWorkspace?: Workspace;
  onSimulateIncomingLeadMessage?: () => void;
  onSimulateNetworkErrorToggle?: () => void;
  isNetworkErrorForced?: boolean;
  onNavigateToTab?: (tab: string) => void;
}

interface TestScenario {
  id: string;
  category: 'haven' | 'sos' | 'stress';
  title: string;
  badge: string;
  description: string;
  customerPrompt: string;
  hasMedia?: boolean;
  expectedAgent: string;
  expectedPricing?: string;
  simulatedResponse: string;
  empathyScore: number;
  accuracyScore: number;
  guardrailStatus: 'passed' | 'warning' | 'handoff_triggered';
  explanation: string;
}

interface ChatMessage {
  role: 'customer' | 'assistant';
  text: string;
  time: string;
  latencyMs?: number;
  model?: string;
  isCommand?: boolean;
  command?: string;
  isCalibrated?: boolean;
}

const PRELOADED_SCENARIOS: TestScenario[] = [
  // HAVEN SCENARIOS
  {
    id: 'haven-ctwa-escova',
    category: 'haven',
    title: '1. Anúncio CTWA (Escova R$ 59)',
    badge: 'Meta Ads CTWA',
    description: 'Lead clica no anúncio de Escova Express e pergunta se inclui lavagem e tem vaga hoje.',
    customerPrompt: 'Olá! Vi o anúncio da escova por R$ 59 no Instagram. Esse valor já inclui a lavagem? Tem horário para hoje às 14h?',
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'R$ 59,00 (Promocional)',
    simulatedResponse: 'Olá! Que alegria receber você na Haven! 🌸 Sim, a nossa Escova Express por R$ 59 inclui a lavagem completa com produtos de alta performance e ozônioterapia para deixar seu cabelo super brilhoso e protegido! ✨\n\nPara hoje, temos encaixes excelentes! Você prefere o período da tarde ou quer garantir diretamente pelo nosso link do Trinks? https://www.trinks.com/haven-escovaria-e-esmalteria',
    empathyScore: 98,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Confirmou o valor exato da promoção do Meta Ads, destacou a ozônioterapia inclusa e ofertou o link oficial do Trinks.',
  },
  {
    id: 'haven-multimodal-nail',
    category: 'haven',
    title: '2. Foto de Unha em Gel (Multimodal)',
    badge: 'Visão Computacional',
    description: 'Cliente manda foto de referência de esmaltação em gel e pergunta valor e tempo.',
    customerPrompt: '[📷 Foto anexada: Unha formato amendoado com esmaltação em gel nude e francesinha fina] Oi Bia! Quero fazer igual essa da foto no sábado. Quanto fica e quanto tempo demora?',
    hasMedia: true,
    expectedAgent: 'Bia · Concierge Haven 24/7',
    expectedPricing: 'R$ 150,00 (Esmaltação em Gel Premium)',
    simulatedResponse: 'Uau, que escolha elegante e sofisticada! ✨ Analisei a sua foto de referência: é uma Esmaltação em Gel Premium com acabamento em francesinha fina. \n\n💎 Valor: R$ 150,00 (dura até 21 dias impecável sem lascar)\n⏱️ Duração: cerca de 1 hora\n\nPara o sábado as vagas são concorridas! Deseja segurar seu horário pelo Trinks (https://www.trinks.com/haven-escovaria-e-esmalteria) ou prefere que eu faça o pré-agendamento com o sinal de R$ 30 no Pix?',
    empathyScore: 99,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Fez a leitura visual precisa da foto, identificou o serviço da tabela 2026 e protegeu a agenda de sábado com sinal Pix.',
  },
  {
    id: 'sos-sales-plano-anual',
    category: 'sos',
    title: '3. Anúncio Meta Ads (Plano Anual 50% OFF)',
    badge: 'Continuidade Cognitiva',
    description: 'Lead clica no anúncio do Instagram do SOS Vendas e pergunta o valor da anuidade.',
    customerPrompt: 'Vi o anúncio de vocês no Insta. Quanto custa o plano anual com desconto?',
    expectedAgent: 'Sofia · Consultora SOS Vendas',
    expectedPricing: 'R$ 582,00 à vista no Pix (50% OFF)',
    simulatedResponse: 'Olá! O Plano Anual no Pix está em condição especial de lançamento por R$ 582,00 à vista (50% OFF). No cartão, a opção anual fica em 12x de R$ 58,20 (40% OFF), já com Cockpit e IA inclusos. Quer que eu te envie o checkout da opção que faz mais sentido?',
    empathyScore: 97,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Aplicou a Regra Anti-Regressão estrita: não perguntou como pode ajudar, informou o preço parcelado de imediato e ofertou escolha binária.',
  },
  {
    id: 'sos-sales-contrato-fidelidade',
    category: 'sos',
    title: '4. Objeção de Contrato & Fidelidade',
    badge: 'Menor Próximo Passo',
    description: 'Cliente pergunta se tem fidelidade contratual e como funciona o cancelamento.',
    customerPrompt: 'Se eu contratar o SOS Vendas tem carência ou fidelidade mínima de 12 meses?',
    expectedAgent: 'Sofia · Consultora SOS Vendas',
    expectedPricing: 'R$ 97/mês sem fidelidade / condições da oferta',
    simulatedResponse: 'Zero burocracia por aqui! O Plano Mensal custa R$ 97,00/mês e não tem fidelidade — você cancela conforme as condições contratadas.\n\nSe preferir o anual, são R$ 582,00 à vista no Pix (50% OFF) ou 12x de R$ 58,20 no cartão (40% OFF). Posso te enviar o checkout da opção que faz mais sentido?',
    empathyScore: 99,
    accuracyScore: 100,
    guardrailStatus: 'passed',
    explanation: 'Desarmou a objeção de risco com clareza cristalina e direcionou para o microcompromisso da escolha do plano.',
  },
];

export const QaSimulatorView: React.FC<QaSimulatorViewProps> = ({
  currentWorkspace,
  onSimulateIncomingLeadMessage,
  onSimulateNetworkErrorToggle,
  isNetworkErrorForced = false,
  onNavigateToTab,
}) => {
  const isHavenActive = currentWorkspace?.id === 'ws-haven-beauty' || currentWorkspace?.name?.toLowerCase().includes('haven');
  
  const [activeTab, setActiveTab] = useState<'trainer' | 'scenarios'>('trainer');
  const [activeCategory, setActiveCategory] = useState<'all' | 'haven' | 'sos'>(
    isHavenActive ? 'haven' : 'all'
  );

  // Sub-aba do Painel Direito (Padrão Meta Business AI Studio)
  const [rightPanelTab, setRightPanelTab] = useState<'config' | 'dossier' | 'files' | 'logs'>('config');

  // Estados de Configuração Direta e Base de Conhecimento
  const [directives, setDirectives] = useState<string[]>([
    isHavenActive
      ? 'Apresentar a Escova Express por R$ 59 com lavagem e ozônioterapia inclusas.'
      : 'Apresentar as condições ativas: mensal R$ 97,00; anual no Pix R$ 582,00 à vista; anual no cartão 12x de R$ 58,20.',
    'Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo).',
    'Não conceder descontos adicionais além da alçada autorizada.',
  ]);
  const [newDirectiveInput, setNewDirectiveInput] = useState('');
  const [currentTone, setCurrentTone] = useState<string>(isHavenActive ? 'elegante_acolhedor' : 'comercial_fechador');
  const [workingHours, setWorkingHours] = useState<string>('Segunda a Sexta: 08h às 19h | Sábado: 08h às 14h');
  const [pixKey, setPixKey] = useState<string>('contato@iaparavendas.tech');
  const [indexedDocs, setIndexedDocs] = useState<Array<{ id: string; name: string; fileSize: string; status: string; chunks: number; summary: string }>>([
    {
      id: 'doc-1',
      name: isHavenActive ? 'Haven_Cardapio_Servicos_2026.pdf' : 'SOS_Sales_Tabela_Planos_Precos.pdf',
      fileSize: '420 KB',
      status: 'INDEXED',
      chunks: 8,
      summary: isHavenActive ? 'Tabela completa de serviços de escovaria e esmalteria com valores vigentes.' : 'Preços dos planos mensal e anual com alçadas de desconto.',
    },
    {
      id: 'doc-2',
      name: isHavenActive ? 'Manual_Agendamentos_Trinks_Haven.md' : 'Playbook_Quebra_Objecoes_Garantia.md',
      fileSize: '185 KB',
      status: 'INDEXED',
      chunks: 5,
      summary: isHavenActive ? 'Diretrizes de encaixe na agenda Trinks e confirmação via WhatsApp.' : 'Script de desarmamento de objeções, condições comerciais e cancelamento.',
    },
  ]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  const [autonomyMode, setAutonomyMode] = useState<GlobalAiAutonomyMode>('copilot_supervised');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    isHavenActive ? 'haven-ctwa-escova' : 'sos-sales-plano-anual'
  );
  const [isTesting, setIsTesting] = useState(false);
  const [activeResult, setActiveResult] = useState<TestScenario | null>(PRELOADED_SCENARIOS[isHavenActive ? 0 : 2]);

  // Live Free-form Chat Sandbox & In-Chat Trainer
  const [customInput, setCustomInput] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [calibratingIndex, setCalibratingIndex] = useState<number | null>(null);
  const [calibrationInput, setCalibrationInput] = useState('');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<'fast' | 'reasoning'>('reasoning');

  // Carregar dados de inteligência do workspace ao montar
  React.useEffect(() => {
    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';
    let isMounted = true;

    async function loadWorkspaceIntelligence() {
      try {
        const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/intelligence`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data.bundle) return;

        const b = data.bundle;
        if (b.directives && Array.isArray(b.directives) && b.directives.length > 0) {
          setDirectives(b.directives);
        }
        if (b.agentConfig?.toneOfVoice) {
          setCurrentTone(b.agentConfig.toneOfVoice);
        }
        if (b.documents && Array.isArray(b.documents) && b.documents.length > 0) {
          setIndexedDocs(b.documents.map((d: any) => ({
            id: d.id,
            name: d.name,
            fileSize: d.fileSize || '150 KB',
            status: d.status || 'INDEXED',
            chunks: d.extractedChunksCount || 4,
            summary: d.summary || '',
          })));
        }
      } catch (err) {
        // Fallback gracioso mantendo os fixtures já pré-carregados
      }
    }

    loadWorkspaceIntelligence();
    return () => { isMounted = false; };
  }, [currentWorkspace?.id]);

  // Live Cognitive Dossier (Mente da IA)
  const [currentDossier, setCurrentDossier] = useState<InferredDossier | null>(() => {
    return analyzeConversationDossier([
      { direction: 'INBOUND', text: 'Vi o anúncio de vocês no Insta. Quanto custa o plano anual com desconto?', senderType: 'CUSTOMER' },
    ], 'Francisco Rios');
  });

  const [customChatHistory, setCustomChatHistory] = useState<ChatMessage[]>([
    {
      role: 'customer',
      text: isHavenActive
        ? 'Oi, vi o anúncio da escova por R$ 59 no Insta. Tem horário hoje?'
        : 'Vi o anúncio de vocês no Insta. Quanto custa o plano anual com desconto?',
      time: '07:15',
    },
    {
      role: 'assistant',
      text: isHavenActive
        ? 'Olá! Seja muito bem-vinda à Haven! 🌸 Sim, a Escova Express por R$ 59 inclui ozônioterapia. Temos horários livres hoje às 14h ou 17h. Qual fica melhor?'
        : 'Olá! O Plano Anual no Pix está com 50% de desconto, ficando em R$ 582,00 à vista. No cartão, são 12x de R$ 58,20. Quer que eu te envie o checkout?',
      time: '07:15',
      latencyMs: 240,
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    },
  ]);

  const [logs, setLogs] = useState<
    Array<{ timestamp: string; label: string; details: string; status: 'ok' | 'warn' | 'error' }>
  >([
    {
      timestamp: new Date().toLocaleTimeString(),
      label: 'Simulador Cognitivo Inicializado',
      details: `Motor soberano calibrado para ${currentWorkspace?.name || 'SOS Vendas Oficial'}. Padrão Meta Business AI ativo.`,
      status: 'ok',
    },
  ]);

  const filteredScenarios = PRELOADED_SCENARIOS.filter((s) => {
    if (activeCategory === 'all') return true;
    return s.category === activeCategory;
  });

  const handleSelectScenario = (scenario: TestScenario) => {
    setSelectedScenarioId(scenario.id);
    setIsTesting(true);
    setTimeout(() => {
      setActiveResult(scenario);
      setIsTesting(false);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: `Cenário: ${scenario.title}`,
          details: `Alçada: ${scenario.guardrailStatus} | Empatia: ${scenario.empathyScore}% | Preço: ${scenario.accuracyScore}%.`,
          status: scenario.guardrailStatus === 'handoff_triggered' ? 'warn' : 'ok',
        },
        ...prev,
      ]);
    }, 350);
  };

  const handleSendCustomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || isLoadingAi) return;

    const userText = customInput.trim();
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setCustomChatHistory((prev) => [...prev, { role: 'customer', text: userText, time: timeNow }]);
    setCustomInput('');
    setIsLoadingAi(true);

    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';

    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/agent/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: customChatHistory.map((m) => ({ role: m.role, content: m.text })),
          contactName: 'Lead Simulado',
          modelTier: selectedModelTier,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Simulador indisponível (HTTP ${res.status})`);
      }
      const answerTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (data.isCommand) {
        setCustomChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.agentResponse,
            time: answerTime,
            isCommand: true,
            command: data.command,
          },
        ]);
        setLogs((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            label: `Comando ${data.command} Assimilado`,
            details: data.agentResponse,
            status: 'ok',
          },
          ...prev,
        ]);
      } else {
        setCustomChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.agentResponse || 'Desculpe, não consegui calcular a resposta.',
            time: answerTime,
            latencyMs: data.latencyMs,
            model: data.model,
          },
        ]);
        if (data.dossier) {
          setCurrentDossier(data.dossier);
        }
        setLogs((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            label: `Inferência IA (${data.latencyMs || 250}ms)`,
            details: `Estágio: ${data.dossier?.suggestedStage || 'QUALIFICADO'} | Modelo: ${data.model || 'NVIDIA NIM'}`,
            status: 'ok',
          },
          ...prev,
        ]);
      }
    } catch (err) {
      // Fallback local do motor cognitivo caso offline
      const mockDossier = analyzeConversationDossier([
        ...customChatHistory.map((m) => ({ direction: m.role === 'customer' ? 'INBOUND' : 'OUTBOUND', text: m.text } as any)),
        { direction: 'INBOUND', text: userText, senderType: 'CUSTOMER' },
      ], 'Lead Simulado');
      setCurrentDossier(mockDossier);

      setCustomChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: mockDossier.smallestNextMove?.draftText || 'Olá! Temos a condição especial ativa hoje. Deseja iniciar agora?',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          latencyMs: 180,
          model: 'sos-cognitive-engine-offline',
        },
      ]);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleAddDirective = async () => {
    if (!newDirectiveInput.trim()) return;
    const rule = newDirectiveInput.trim();
    const updated = [...directives, rule];
    setDirectives(updated);
    setNewDirectiveInput('');

    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/agent/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `/regra ${rule}` }),
      });
      if (!res.ok) {
        throw new Error(`Não foi possível salvar a diretriz (HTTP ${res.status})`);
      }
      setConfigFeedback('Nova diretriz salva e assimilada pela IA!');
      setTimeout(() => setConfigFeedback(null), 3500);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: 'Diretriz Adicionada',
          details: `Regra: "${rule}". Sincronizada no bundle de inteligência.`,
          status: 'ok',
        },
        ...prev,
      ]);
    } catch (e) {
      // continua local
    }
  };

  const handleRemoveDirective = (indexToRemove: number) => {
    setDirectives((prev) => prev.filter((_, i) => i !== indexToRemove));
    setConfigFeedback('Diretriz removida da sessão.');
    setTimeout(() => setConfigFeedback(null), 2500);
  };

  const handleChangeTone = async (newTone: string) => {
    setCurrentTone(newTone);
    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/agent/simulator/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `/tom ${newTone}` }),
      });
      if (!res.ok) {
        throw new Error(`Não foi possível salvar o tom (HTTP ${res.status})`);
      }
      setConfigFeedback(`Tom alterado para "${newTone}"!`);
      setTimeout(() => setConfigFeedback(null), 3000);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: 'Tom de Voz Atualizado',
          details: `Novo estilo: ${newTone}`,
          status: 'ok',
        },
        ...prev,
      ]);
    } catch (e) {
      // continua local
    }
  };

  const handleSaveAllConfig = async () => {
    setIsSavingConfig(true);
    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/intelligence`);
      let currentBundle: any = {};
      if (res.ok) {
        const d = await res.json();
        currentBundle = d.bundle || {};
      }
      currentBundle.directives = directives;
      if (!currentBundle.agentConfig) currentBundle.agentConfig = {};
      currentBundle.agentConfig.toneOfVoice = currentTone;

      await authenticatedFetch(`/api/v1/workspaces/${wsId}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: currentBundle }),
      });

      setConfigFeedback('Configurações salvas e sincronizadas com sucesso!');
      setTimeout(() => setConfigFeedback(null), 3500);
      setLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          label: 'Configurações Salvas no Supabase',
          details: `Tom: ${currentTone} | ${directives.length} regras ativas | Sincronizado.`,
          status: 'ok',
        },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
      setConfigFeedback('Falha de rede ao persistir no servidor. Mantido em memória.');
      setTimeout(() => setConfigFeedback(null), 4000);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleCalibrate = async (msgIndex: number, originalMsg: ChatMessage) => {
    if (!calibrationInput.trim()) return;
    setIsCalibrating(true);
    const wsId = currentWorkspace?.id || '11111111-1111-1111-1111-111111111111';

    const lastCustomerMsg = customChatHistory
      .slice(0, msgIndex)
      .reverse()
      .find((m) => m.role === 'customer')?.text || '';

    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${wsId}/agent/simulator/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctionInstruction: calibrationInput.trim(),
          lastCustomerMessage: lastCustomerMsg,
          lastAgentResponse: originalMsg.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Não foi possível calibrar a resposta (HTTP ${res.status})`);
      }
      if (data.calibratedResponse) {
        setDirectives((prev) => [...prev, calibrationInput.trim()]);
        setCustomChatHistory((prev) =>
          prev.map((m, idx) => {
            if (idx === msgIndex) {
              return {
                ...m,
                text: data.calibratedResponse,
                isCalibrated: true,
              };
            }
            return m;
          })
        );
        setLogs((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            label: 'Regra Ensinada pelo Gestor',
            details: `Nova diretriz: "${calibrationInput.trim()}". Resposta re-executada e salva no Supabase.`,
            status: 'ok',
          },
          ...prev,
        ]);
      }
      setCalibratingIndex(null);
      setCalibrationInput('');
    } catch (err) {
      console.error('Falha ao calibrar resposta', err);
      alert('Não foi possível salvar a calibração. Tente novamente.');
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleLoadEkoPreset = async () => {
    const ekoDirectives = [
      'Continuidade Meta Ads: Se o contato vier de anúncio ou menção a oferta, confirme imediatamente o interesse sem perguntas abertas como "como posso ajudar".',
      'Zero Alucinação: É estritamente proibido inventar ou deduzir serviços, preços ou condições não cadastrados no catálogo.',
      'Desconto Máximo: 5% exclusivo no Pix à vista. Proibido conceder qualquer outro desconto sem aprovação da gerência.',
      'Sem Agenda Integrada: Nunca diga "sua vaga está garantida". Registre a preferência de período e avise que a equipe confirmará na agenda.',
      'Menor Próximo Passo: Conclua cada mensagem com 1 pergunta oferecendo 2 alternativas claras (ex: manhã vs tarde / Pix vs cartão).',
      'Chave Pix Oficial: Informar exclusivamente a chave Pix publicada nas configurações do workspace e solicitar o comprovante. Nunca inventar uma chave no simulador.',
      'Handoff Humano Seguro: Se o cliente pedir atendente, reclamar ou insistir em desconto fora da regra, transfira imediatamente para a equipe.',
    ];
    setDirectives(ekoDirectives);
    setCurrentTone('elegante_acolhedor');
    setConfigFeedback('Modelo EKO Blindado carregado com sucesso!');
    setTimeout(() => setConfigFeedback(null), 4000);

    setCustomChatHistory([
      {
        role: 'customer',
        text: 'Olá! Vi o anúncio no Instagram da Escova Modelada com Hidratação Profunda por R$ 120.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      {
        role: 'assistant',
        text: 'Olá! Que alegria ver seu interesse no nosso pacote de Escova Modelada com Hidratação Profunda! Quer que eu te passe os detalhes do tratamento ou já prefere consultar os horários livres desta semana?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencyMs: 180,
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b (EKO Engine)',
      },
    ]);

    setLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        label: 'Modelo EKO Blindado Injetado',
        details: '7 diretrizes canônicas, tom elegante/acolhedor e catálogo anti-alucinação sincronizados.',
        status: 'ok',
      },
      ...prev,
    ]);
  };

  return (
    <div id="qa-simulator-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Banner: Padrão Meta Business AI */}
      <div className="bg-slate-950 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white font-heading">
                Treinador Conversacional & Simulador Cognitivo
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Padrão Meta Business AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ambiente de teste e calibração 100% isolado · Edite regras, preços e horários direto na conversa
            </p>
          </div>
        </div>

        {/* Right Controls: EKO Preset + Tab Selector */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleLoadEkoPreset}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border border-purple-400/30"
            title="Carregar configuração canônica blindada do Kit EKO v0.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Carregar Modelo EKO Blindado</span>
          </button>

          {/* Tab Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('trainer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'trainer'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Treinador In-Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'scenarios'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Cenários de Homologação</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW: TREINADOR IN-CHAT (Padrão Meta Business AI) */}
      {activeTab === 'trainer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Coluna Esquerda: WhatsApp Sandbox Chat (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col h-[600px] overflow-hidden">
            {/* Chat Top Header */}
            <div className="bg-slate-900 text-white px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
                    {isHavenActive ? 'B' : 'S'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-white">
                      {isHavenActive ? 'Bia · Concierge Haven' : 'Sofia · Especialista Comercial'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-700/50 rounded-full">
                      24/7 Ativa
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    {selectedModelTier === 'reasoning'
                      ? '🧠 NVIDIA NIM Nemotron Super 120B (Raciocínio Profundo) · Guardrails ativos'
                      : '⚡ NVIDIA NIM Nemotron 3.5 Lightning (Rápido) · Guardrails ativos'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Seletor de Modelo de Raciocínio */}
                <div className="hidden sm:flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSelectedModelTier('reasoning')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      selectedModelTier === 'reasoning'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Nemotron Super 120B — Raciocínio avançado e inteligência comercial profunda"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                    <span>Nemotron 120B (Raciocínio)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModelTier('fast')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      selectedModelTier === 'fast'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Nemotron 3.5 Lightning 30B — Resposta ultra-rápida (sub-segundo)"
                  >
                    <Zap className="w-2.5 h-2.5 text-amber-300" />
                    <span>Nemotron 3.5 (Rápido)</span>
                  </button>
                </div>

                <button
                  onClick={() => setCustomChatHistory([])}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Limpar histórico do teste"
                >
                  Limpar
                </button>
              </div>
            </div>

            {/* Quick Command Hint Bar */}
            <div className="bg-slate-50 border-b border-slate-100 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-500 overflow-x-auto gap-2">
              <span className="font-semibold text-slate-700 shrink-0 flex items-center gap-1">
                <Sliders className="w-3 h-3 text-emerald-600" /> Comandos de Treinador:
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setCustomInput('/preco ')}
                  className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-slate-200 rounded text-[10px] text-slate-700 font-mono hover:text-emerald-700 transition-colors"
                >
                  /preco
                </button>
                <button
                  onClick={() => setCustomInput('/regra ')}
                  className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-slate-200 rounded text-[10px] text-slate-700 font-mono hover:text-emerald-700 transition-colors"
                >
                  /regra
                </button>
                <button
                  onClick={() => setCustomInput('/horario ')}
                  className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-slate-200 rounded text-[10px] text-slate-700 font-mono hover:text-emerald-700 transition-colors"
                >
                  /horario
                </button>
                <button
                  onClick={() => setCustomInput('/pix ')}
                  className="px-2 py-0.5 bg-white hover:bg-emerald-50 border border-slate-200 rounded text-[10px] text-slate-700 font-mono hover:text-emerald-700 transition-colors"
                >
                  /pix
                </button>
              </div>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-100/60">
              {customChatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center p-6 space-y-2">
                  <Bot className="w-8 h-8 text-slate-300" />
                  <p className="max-w-sm">
                    Envie uma mensagem simulando um lead ou digite um comando de calibração (<code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">/regra</code>, <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">/preco</code>).
                  </p>
                </div>
              ) : (
                customChatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.role === 'customer' ? 'items-start' : 'items-end'} space-y-1`}
                  >
                    {/* Message Bubble */}
                    <div
                      className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                        msg.role === 'customer'
                          ? 'bg-white text-slate-900 rounded-tl-xs border border-slate-200'
                          : msg.isCommand
                          ? 'bg-slate-900 text-emerald-300 rounded-tr-xs border border-emerald-600/40 font-mono'
                          : 'bg-emerald-600 text-white rounded-tr-xs font-normal'
                      }`}
                    >
                      <div className="whitespace-pre-line">{msg.text}</div>
                    </div>

                    {/* Metadata & In-Chat Action Controls (Padrão Meta) */}
                    <div className="flex items-center gap-2 px-1 text-[10px] text-slate-400">
                      <span>{msg.time}</span>
                      {msg.latencyMs && (
                        <span className="flex items-center gap-0.5 text-emerald-600 font-mono">
                          <Zap className="w-2.5 h-2.5" /> {msg.latencyMs}ms
                        </span>
                      )}
                      {msg.isCalibrated && (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                          ✨ Calibrado pelo Gestor
                        </span>
                      )}

                      {/* In-Chat Tuning Trigger on Bot Messages */}
                      {msg.role === 'assistant' && !msg.isCommand && (
                        <div className="flex items-center gap-1.5 ml-1">
                          <button
                            onClick={() => {
                              setCalibratingIndex(calibratingIndex === i ? null : i);
                              setCalibrationInput('');
                            }}
                            className="text-slate-500 hover:text-emerald-700 flex items-center gap-0.5 font-semibold transition-colors"
                            title="Corrigir ou ensinar nova diretriz para esta resposta"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Calibrar</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Calibration Popover (Padrão Meta Blueprint) */}
                    {calibratingIndex === i && (
                      <div className="w-full max-w-[92%] bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-lg space-y-2.5 mt-1 animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900 flex items-center gap-1">
                            <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                            Ensinar IA (Calibração In-Chat)
                          </span>
                          <button
                            onClick={() => setCalibratingIndex(null)}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          O que a Sofia deveria ter respondido ou qual regra deve respeitar?
                        </p>
                        <input
                          type="text"
                          value={calibrationInput}
                          onChange={(e) => setCalibrationInput(e.target.value)}
                          placeholder="Ex: Não oferecemos desconto fora das condições ativas. Explique a garantia conforme os termos da oferta."
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={() => setCalibratingIndex(null)}
                            className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleCalibrate(i, msg)}
                            disabled={isCalibrating || !calibrationInput.trim()}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {isCalibrating ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Salvar & Ensinar IA</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {isLoadingAi && (
                <div className="flex items-center gap-2 text-xs text-slate-500 italic p-2 bg-white/70 rounded-xl max-w-fit">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span>Sofia consultando motor cognitivo...</span>
                </div>
              )}
            </div>

            {/* Quick In-Chat Tuning Chips (Padrão Meta) */}
            <div className="px-3 pt-2 pb-1 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Wand2 className="w-3 h-3 text-emerald-600" /> In-Chat Tuning:
              </span>
              <button
                type="button"
                onClick={() => setCustomInput('/regra ')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                🛡️ + Regra
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('/preco ')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                💰 Preço
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('/tom comercial_fechador')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                🎭 Tom Fechador
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('/tom elegante_acolhedor')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                🌸 Tom Acolhedor
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('/horario Segunda a Sexta: 08h às 19h | Sáb: 08h às 14h')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                ⏰ Horário
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('/pix ')}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-50 text-[10px] font-medium text-slate-700 hover:text-emerald-700 border border-slate-200 transition shrink-0 cursor-pointer"
              >
                🔑 Chave Pix
              </button>
            </div>

            {/* Testes de Estresse Comercial EKO (1-Clique) */}
            <div className="px-3 py-1 bg-purple-50/70 border-t border-purple-100/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[10px]">
              <span className="font-bold text-purple-800 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" /> Testes EKO:
              </span>
              <button
                type="button"
                onClick={() => setCustomInput('Quanto custa a limpeza de pele profunda? E tem desconto se pagar no Pix?')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Preço Oficial e Desconto Permitido"
              >
                🎯 Preço & Pix
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('Se eu fechar agora você me faz por R$ 90? Eu pago agora no Pix!')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Blindagem contra Desconto Abusivo / Inventado"
              >
                🛡️ Desconto Proibido
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('Vocês fazem micropigmentação labial fio a fio?')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Serviço Fora do Catálogo Aprovado"
              >
                🚫 Fora de Catálogo
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('Pode reservar amanhã às 15h para mim com certeza?')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Blindagem de Agenda sem Ferramenta Integrada"
              >
                ⏰ Reserva de Agenda
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('Qual é a chave Pix de vocês para eu transferir agora?')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Chave Pix Oficial com Titular e CNPJ"
              >
                🔑 Chave Pix
              </button>
              <button
                type="button"
                onClick={() => setCustomInput('Quero falar com uma pessoa de verdade, você é robô?')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 transition shrink-0 cursor-pointer font-medium"
                title="Teste de Handoff Humano com Dossiê"
              >
                🚨 Transfere Humano
              </button>
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendCustomMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder={
                  isHavenActive
                    ? 'Ex: Quanto custa corte com escova? ou /preco Corte R$ 120'
                    : 'Ex: Qual o valor do plano anual? ou /regra Não conceder desconto extra'
                }
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isLoadingAi || !customInput.trim()}
                className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shrink-0 shadow-2xs disabled:opacity-50 cursor-pointer"
                title="Enviar mensagem de teste"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Coluna Direita: Painel de Controle, Configurações e Dossiê (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Feedback Alert */}
            {configFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{configFeedback}</span>
              </div>
            )}

            {/* Card Principal com Abas */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              {/* Header com Seletor de Sub-Abas */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('config')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      rightPanelTab === 'config'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Configurações & IA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightPanelTab('dossier')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      rightPanelTab === 'dossier'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-purple-600" />
                    <span>Mente Cognitiva</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRightPanelTab('files')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      rightPanelTab === 'files'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                    <span>Arquivos ({indexedDocs.length})</span>
                  </button>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {currentDossier?.originType === 'META_ADS' ? 'Meta Ads CTWA' : 'Orgânico'}
                </span>
              </div>

              {/* ABA 1: CONFIGURAÇÕES & TREINAMENTO DO AGENTE (Padrão Meta) */}
              {rightPanelTab === 'config' && (
                <div className="space-y-4">
                  {/* Seletor de Tom de Voz */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Tom de Voz do Agente:
                      </span>
                      <span className="text-[10px] text-emerald-600 font-bold">
                        {currentTone.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'elegante_acolhedor', label: '🌸 Elegante & Acolhedor' },
                        { id: 'comercial_fechador', label: '🎯 Comercial Fechador' },
                        { id: 'direto_objetivo', label: '⚡ Direto & Objetivo' },
                        { id: 'tecnico_formal', label: '🏛️ Técnico & Formal' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleChangeTone(t.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-all border cursor-pointer ${
                            currentTone === t.id
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Diretrizes & Regras Comerciais */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Regras de Ouro & Diretrizes ({directives.length}):
                      </span>
                    </div>

                    {/* Adicionar Nova Regra */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newDirectiveInput}
                        onChange={(e) => setNewDirectiveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDirective();
                          }
                        }}
                        placeholder="Ex: Não conceder mais de 10% de desconto"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddDirective}
                        disabled={!newDirectiveInput.trim()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                    </div>

                    {/* Lista de Regras Ativas */}
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {directives.map((dir, idx) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200 group hover:border-slate-300 transition-colors"
                        >
                          <span className="text-slate-800 leading-relaxed font-medium">
                            <strong className="text-emerald-600 font-mono">#{idx + 1}</strong> {dir}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDirective(idx)}
                            className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                            title="Remover regra"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Botão de Salvar Tudo */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSaveAllConfig}
                      disabled={isSavingConfig}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingConfig ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>Salvar Configurações no Agente</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ABA 2: MENTE COGNITIVA DA IA (Dossiê em Tempo Real) */}
              {rightPanelTab === 'dossier' && (
                <div className="space-y-4">
                  {/* 1. Estágio Comercial do Lead */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Estágio no Funil Comercial:
                    </span>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {(['LEAD', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO'] as const).map((stage) => {
                        const isCurrent = currentDossier?.suggestedStage === stage;
                        return (
                          <span
                            key={stage}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                              isCurrent
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}
                          >
                            {stage}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 italic">
                      {currentDossier?.stageReason || 'Analisando histórico da conversa...'}
                    </p>
                  </div>

                  {/* 2. Regra Anti-Regressão Cognitiva */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Regra Anti-Regressão Ativa:</span>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed font-medium">
                      {currentDossier?.antiRegressionRule || 'Proibido reiniciar com perguntas vazias. Conecte direto à oferta ativa.'}
                    </p>
                  </div>

                  {/* 3. Menor Próximo Passo */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <Target className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Menor Próximo Passo Sugerido:</span>
                    </div>
                    <p className="text-xs font-bold text-emerald-950">
                      {currentDossier?.smallestNextMove?.actionTitle || 'Apresentar Opções Fechadas'}
                    </p>
                    <p className="text-[11px] text-emerald-800 leading-relaxed italic">
                      "{currentDossier?.smallestNextMove?.draftText || 'Qual opção fica melhor para você?'}"
                    </p>
                  </div>

                  {/* 4. Fatos Confirmados (EKO) */}
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Fatos Confirmados do Lead (EKO):
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {currentDossier?.knownFacts && currentDossier.knownFacts.length > 0 ? (
                        currentDossier.knownFacts.map((fact, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200"
                          >
                            <span className="font-semibold text-slate-700">{fact.key}:</span>
                            <span className="text-slate-900 font-medium text-right">{fact.value}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400 italic">Nenhum fato confirmado ainda.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 3: ARQUIVOS & BASE DE CONHECIMENTO */}
              {rightPanelTab === 'files' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Documentos Indexados no RAG:
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                      {indexedDocs.length} Ativos
                    </span>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {indexedDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate font-mono flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            {doc.name}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                            Pronto
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed">
                          {doc.summary}
                        </p>
                        <div className="flex items-center gap-2 text-[9px] text-slate-400 pt-0.5">
                          <span>{doc.chunks} chunks</span>
                          <span>•</span>
                          <span>{doc.fileSize}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('knowledge')}
                      className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Gerenciar Arquivos na Base de Conhecimento</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Ações de Simulação Rápida */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" /> Disparadores Rápidos de Teste
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (onSimulateIncomingLeadMessage) onSimulateIncomingLeadMessage();
                    setLogs((prev) => [
                      {
                        timestamp: new Date().toLocaleTimeString(),
                        label: 'Lead Injetado',
                        details: 'Lead de teste inserido na Fila do Agora.',
                        status: 'ok',
                      },
                      ...prev,
                    ]);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Injetar no Cockpit</span>
                </button>

                <button
                  onClick={() => {
                    if (onSimulateNetworkErrorToggle) onSimulateNetworkErrorToggle();
                    setLogs((prev) => [
                      {
                        timestamp: new Date().toLocaleTimeString(),
                        label: isNetworkErrorForced ? 'Rede Restaurada' : 'Falha Forçada',
                        details: isNetworkErrorForced ? 'Conexão normalizada.' : 'Simulando offline retry no composer.',
                        status: isNetworkErrorForced ? 'ok' : 'warn',
                      },
                      ...prev,
                    ]);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    isNetworkErrorForced
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${isNetworkErrorForced ? 'text-rose-600' : 'text-amber-600'}`} />
                  <span>{isNetworkErrorForced ? 'Desativar Falha' : 'Forçar Falha Rede'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: CENÁRIOS DE HOMOLOGAÇÃO (Haven & SOS Vendas) */}
      {activeTab === 'scenarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Coluna Esquerda: Lista de Cenários (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                Cenários Canônicos Pré-Carregados
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveCategory('all')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${activeCategory === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setActiveCategory('sos')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${activeCategory === 'sos' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                >
                  SOS Vendas
                </button>
                <button
                  onClick={() => setActiveCategory('haven')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${activeCategory === 'haven' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                >
                  Haven
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredScenarios.map((sc) => (
                <div
                  key={sc.id}
                  onClick={() => handleSelectScenario(sc)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedScenarioId === sc.id
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900">{sc.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold">
                      {sc.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{sc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Direita: Detalhes do Cenário Selecionado (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            {activeResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{activeResult.title}</h3>
                    <p className="text-xs text-slate-500">{activeResult.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Empatia: {activeResult.empathyScore}%
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      Preço: {activeResult.accuracyScore}%
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Mensagem de Entrada do Lead:
                  </span>
                  <div className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 italic">
                    "{activeResult.customerPrompt}"
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                    <Sparkle className="w-3 h-3" /> Resposta Calculada do Agente 24/7:
                  </span>
                  <div className="mt-1 p-3.5 bg-slate-900 text-white rounded-xl border border-emerald-500/30 text-xs leading-relaxed whitespace-pre-line">
                    {activeResult.simulatedResponse}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2 text-xs text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Auditoria de IA:</strong> {activeResult.explanation}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Terminal Inferior de Eventos & Auditoria de Treinamento */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs shadow-xs space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5 font-bold">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Log de Auditoria em Tempo Real & Eventos do Treinador
          </span>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Limpar Log
          </button>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic py-2">Nenhum evento registrado.</div>
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
export default QaSimulatorView;
