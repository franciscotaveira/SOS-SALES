import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Zap,
  Building2,
  ShoppingBag,
  Sliders,
  Smartphone,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface Message {
  id: string;
  sender: 'atlas' | 'user';
  text: string;
  timestamp: string;
  quickActions?: Array<{
    label: string;
    actionText: string;
  }>;
}

interface OnboardingSetupAssistantModalProps {
  currentWorkspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: any) => void;
}

export function OnboardingSetupAssistantModal({
  currentWorkspace,
  isOpen,
  onClose,
  onNavigateToTab,
}: OnboardingSetupAssistantModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm-init-1',
      sender: 'atlas',
      text: `Olá! Eu sou o **Atlas**, seu Especialista de Configuração do SOS Vendas. 🚀\n\nEstou aqui para deixar o sistema 100% pronto para o seu negócio vender no WhatsApp 24/7 sem você ter que quebrar a cabeça com menus técnicos.\n\nComo posso te ajudar agora?`,
      timestamp: 'Agora',
      quickActions: [
        {
          label: '🛒 Como cadastrar meus serviços/produtos?',
          actionText: 'Como cadastro os serviços e preços da minha empresa no catálogo?',
        },
        {
          label: '📱 Como conectar meu WhatsApp?',
          actionText: 'Como faço para conectar o número de WhatsApp da minha equipe?',
        },
        {
          label: '🤖 Como ajustar as regras e descontos da IA?',
          actionText: 'Como defino até quanto de desconto a IA pode dar e o tom de voz dela?',
        },
        {
          label: '🧾 Como ativar a leitura de comprovante PIX e fotos?',
          actionText: 'Como funciona a leitura automática de comprovantes PIX e fotos de clientes?',
        },
      ],
    },
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [providerOnline, setProviderOnline] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      // O assistente de onboarding usa o mesmo provedor configurado para o
      // runtime de atendimento. Não existe fallback silencioso para
      // OpenRouter: se o NIM estiver indisponível, exibimos esse estado ao
      // operador em vez de misturar provedores.
      const response = await authenticatedFetch('/api/v1/ai/test-nvidia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `O usuário está configurando o SOS Vendas para a empresa "${currentWorkspace.name}" (nicho: ${currentWorkspace.businessType}). Ele perguntou: "${text}". Responda como o Atlas, consultor de onboarding do SOS Vendas. Seja claro, didático, amigável para pequenos empresários e passe orientações passo a passo em no máximo 3 parágrafos curtos. Se envolver telas do sistema (Catálogo, Configurações, WhatsApp, Playbook), indique onde ele clica.`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Atlas indisponível (HTTP ${response.status})`);
      }
      const data = await response.json() as { response?: string };
      if (!data.response || typeof data.response !== 'string') {
        throw new Error('Resposta inválida do Atlas');
      }
      setProviderOnline(true);
      const botReply = data.response;

      const atlasMsg: Message = {
        id: `atlas-${Date.now()}`,
        sender: 'atlas',
        text: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, atlasMsg]);
    } catch (err) {
      setProviderOnline(false);
      const fallbackMsg: Message = {
        id: `atlas-${Date.now()}`,
        sender: 'atlas',
        text: `O Atlas está indisponível no momento e não vou inventar uma orientação. Tente novamente ou use as telas de Configurações com validação do operador.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-sm p-4 sm:p-6 transition-all duration-300">
      <div className="flex h-full max-h-[850px] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-600 to-teal-700 p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md text-white shadow-inner">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Atlas · Setup Copilot</h3>
                <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-emerald-50 border border-white/20">
                  <span className={`mr-1 h-1.5 w-1.5 rounded-full ${providerOnline === true ? 'bg-emerald-300' : providerOnline === false ? 'bg-rose-300' : 'bg-amber-200'}`} />
                  {providerOnline === true ? 'Backend confirmado' : providerOnline === false ? 'Indisponível' : 'Não verificado'}
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 truncate max-w-[240px]">
                Configurando: <strong>{currentWorkspace.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Trilha Rápida de Configuração (Pills de Atalho) */}
        <div className="grid grid-cols-4 gap-1 border-b border-slate-100 bg-slate-50 p-2 text-center text-xs">
          <button
            onClick={() => {
              if (onNavigateToTab) onNavigateToTab('configuracoes');
              handleSendMessage('Quero cadastrar meus dados da empresa e horário de atendimento.');
            }}
            className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-emerald-700 hover:shadow-xs transition-all"
          >
            <Building2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-[11px]">1. Perfil</span>
          </button>
          <button
            onClick={() => {
              if (onNavigateToTab) onNavigateToTab('configuracoes');
              handleSendMessage('Como cadastro os produtos e serviços no meu catálogo?');
            }}
            className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-emerald-700 hover:shadow-xs transition-all"
          >
            <ShoppingBag className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-[11px]">2. Catálogo</span>
          </button>
          <button
            onClick={() => {
              if (onNavigateToTab) onNavigateToTab('playbook');
              handleSendMessage('Como ajusto o tom de voz e os guardrails de desconto da IA?');
            }}
            className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-emerald-700 hover:shadow-xs transition-all"
          >
            <Sliders className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-[11px]">3. Regras IA</span>
          </button>
          <button
            onClick={() => {
              if (onNavigateToTab) onNavigateToTab('configuracoes');
              handleSendMessage('Como conecto o meu WhatsApp com QR Code ou WABA oficial?');
            }}
            className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-emerald-700 hover:shadow-xs transition-all"
          >
            <Smartphone className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-[11px]">4. WhatsApp</span>
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                <span
                  className={`mt-1.5 block text-[10px] ${
                    msg.sender === 'user' ? 'text-emerald-200 text-right' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>

              {/* Botões de Ações Rápidas */}
              {msg.quickActions && msg.quickActions.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 w-full max-w-[92%] pl-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Dúvidas frequentes de configuração:
                  </p>
                  {msg.quickActions.map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(qa.actionText)}
                      className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 shadow-2xs transition-all text-left group"
                    >
                      <span>{qa.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2 w-fit shadow-2xs">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
              <span>Atlas está consultando a documentação e preparando a resposta...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 bg-white p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ex: Como colocar meu preço da escova e conectar o PIX?"
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
