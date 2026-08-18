import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Bot,
  Play,
  Pause,
  AlertTriangle,
  Clock,
  Sparkles,
  ChevronRight,
  Eye,
  Zap,
  CheckCircle2,
  XCircle,
  Activity,
  X,
} from 'lucide-react';
import { GlobalAiAutonomyMode, getWorkspaceAiMode, setWorkspaceAiMode } from '../../services/aiAutonomyManager';

export interface AiDecisionLogItem {
  id: string;
  timestamp: string;
  contactName: string;
  inboundSnippet: string;
  intentDetected: string;
  systemConsulted: string;
  recommendedAction: string;
  confidenceScore: number;
  status: 'pending_approval' | 'dispatched' | 'cancelled_by_human' | 'auto_dispatched';
}

interface AutonomousSupervisorPanelProps {
  workspaceId: string;
  currentContactName?: string;
  pendingSuggestion?: string;
  onApproveAndSend?: (text: string) => void;
  onRejectOrCancel?: () => void;
  isGenerating?: boolean;
  variant?: 'compact_badge' | 'full';
}

export const AutonomousSupervisorPanel: React.FC<AutonomousSupervisorPanelProps> = ({
  workspaceId,
  currentContactName = 'Cliente',
  pendingSuggestion,
  onApproveAndSend,
  onRejectOrCancel,
  isGenerating = false,
  variant = 'compact_badge',
}) => {
  const [autonomyMode, setAutonomyMode] = useState<GlobalAiAutonomyMode>(() => getWorkspaceAiMode(workspaceId));
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isTrinksClient = (workspaceId || '').toLowerCase().includes('escovaria') || (workspaceId || '').toLowerCase().includes('haven');

  const [logs, setLogs] = useState<AiDecisionLogItem[]>([
    {
      id: 'log-1',
      timestamp: new Date(Date.now() - 45000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      contactName: currentContactName,
      inboundSnippet: 'Solicitação de atendimento / horários',
      intentDetected: isTrinksClient ? 'Agendamento • Escova & Unhas' : 'Qualificação Comercial • Serviços',
      systemConsulted: isTrinksClient ? 'Grade Trinks • Vaga 14:30 com Lis' : 'Motor Comercial Sales OS • Catálogo Ativo',
      recommendedAction: isTrinksClient ? 'Proposta de horário confirmado' : 'Envio de proposta e próximos passos',
      confidenceScore: 0.96,
      status: 'pending_approval',
    },
  ]);

  // Sync mode changes
  useEffect(() => {
    const handleModeChange = (e: any) => {
      if (e.detail && e.detail.workspaceId === workspaceId) {
        setAutonomyMode(e.detail.mode);
      }
    };
    window.addEventListener('sos_ai_mode_changed', handleModeChange);
    return () => window.removeEventListener('sos_ai_mode_changed', handleModeChange);
  }, [workspaceId]);

  // Semi-autonomous countdown logic
  useEffect(() => {
    if (autonomyMode === 'semi_autonomous' && pendingSuggestion) {
      setCountdown(10);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            if (prev === 1 && onApproveAndSend) {
              onApproveAndSend(pendingSuggestion);
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [autonomyMode, pendingSuggestion, onApproveAndSend]);

  const handleChangeMode = (newMode: GlobalAiAutonomyMode) => {
    setAutonomyMode(newMode);
    setWorkspaceAiMode(workspaceId, newMode);
  };

  if (variant === 'compact_badge') {
    return (
      <>
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-2 text-white shadow-2xs flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1 rounded-md shrink-0 ${
              autonomyMode === 'autonomous_24_7'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                : autonomyMode === 'semi_autonomous'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              <Bot size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5 truncate">
                <span>IA Supervisora:</span>
                <span className={`text-[10px] font-semibold ${
                  autonomyMode === 'autonomous_24_7'
                    ? 'text-emerald-400'
                    : autonomyMode === 'semi_autonomous'
                    ? 'text-amber-400'
                    : 'text-blue-400'
                }`}>
                  {autonomyMode === 'autonomous_24_7' ? '24/7 Autônomo' : autonomyMode === 'semi_autonomous' ? 'Semi-Auto (10s)' : 'Modo Assistido'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-200 shadow-2xs transition cursor-pointer shrink-0"
            title="Abrir Auditoria e Controle de Autonomia"
          >
            <Activity size={10} className="text-purple-400" />
            <span>Auditoria</span>
          </button>
        </div>

        {/* Semi-autonomous countdown toast */}
        {countdown !== null && pendingSuggestion && (
          <div className="rounded-xl bg-amber-950/90 border border-amber-500/60 p-2 flex items-center justify-between gap-2 animate-pulse shadow-md shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock size={13} className="text-amber-400 shrink-0" />
              <div className="text-[11px] font-bold text-amber-200 truncate">
                Enviando resposta em <span className="text-amber-300 font-extrabold">{countdown}s</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onApproveAndSend && onApproveAndSend(pendingSuggestion)}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer shadow-2xs"
              >
                <Zap size={9} /> Liberar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCountdown(null);
                  if (onRejectOrCancel) onRejectOrCancel();
                }}
                className="px-2 py-0.5 rounded bg-rose-900 hover:bg-rose-800 text-rose-200 border border-rose-700 text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer shadow-2xs"
              >
                <XCircle size={9} /> Pausar
              </button>
            </div>
          </div>
        )}

        {/* Audit & Supervision Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-heading">Supervisão de IA & Auditoria HITL</h3>
                    <p className="text-[11px] text-slate-400">Controle humano em tempo real sobre decisões da IA</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Mode selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">Modo de Autonomia Ativo:</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-semibold text-center">
                  <button
                    type="button"
                    onClick={() => handleChangeMode('copilot_supervised')}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      autonomyMode === 'copilot_supervised'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🔵 Assistido
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeMode('semi_autonomous')}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      autonomyMode === 'semi_autonomous'
                        ? 'bg-amber-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🟡 Semi-Auto (10s)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChangeMode('autonomous_24_7')}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      autonomyMode === 'autonomous_24_7'
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🟢 100% Autônomo
                  </button>
                </div>
              </div>

              {/* Live thought trail */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Activity size={13} className="text-purple-400" /> Trilha de Raciocínio Recente
                  </span>
                  <span className="text-[10px] text-slate-400">96% precisão de resposta</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-200">{log.contactName} ({log.timestamp})</span>
                        <span className="font-semibold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px]">
                          {log.intentDetected}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 bg-slate-950 p-1.5 rounded border border-slate-800 font-mono">
                        <span className="text-slate-500">🔍 Sistema:</span> {log.systemConsulted}
                      </div>
                      <div className="flex items-center justify-between text-[10.5px] pt-1 border-t border-slate-800">
                        <span className="text-slate-400">💡 {log.recommendedAction}</span>
                        <span className="font-bold text-emerald-400">{Math.round(log.confidenceScore * 100)}% precisão</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleChangeMode('copilot_supervised')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldAlert size={13} /> Pausar Autonomia Geral
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-100 shadow-xl space-y-2 font-sans">
      {/* Top Header & Master Mode Switch */}
      <div className="space-y-1.5 border-b border-slate-800/80 pb-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`p-1 rounded-md shrink-0 ${
              autonomyMode === 'autonomous_24_7'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                : autonomyMode === 'semi_autonomous'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              <Bot size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-slate-100 block truncate font-heading">Supervisão de IA & HITL</span>
            </div>
          </div>
          <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
            autonomyMode === 'autonomous_24_7'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : autonomyMode === 'semi_autonomous'
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'bg-blue-950 text-blue-300 border border-blue-800'
          }`}>
            {autonomyMode === 'autonomous_24_7' ? '🟢 24/7 Auto' : autonomyMode === 'semi_autonomous' ? '🟡 Semi-Auto' : '🔵 Assistido'}
          </span>
        </div>

        {/* Mode Selector Pill */}
        <div className="grid grid-cols-3 gap-0.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px] font-semibold text-center">
          <button
            type="button"
            onClick={() => handleChangeMode('copilot_supervised')}
            className={`py-0.5 rounded-md transition-all truncate ${
              autonomyMode === 'copilot_supervised'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Apenas sugere no chat; o operador precisa clicar para enviar"
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => handleChangeMode('semi_autonomous')}
            className={`py-0.5 rounded-md transition-all truncate ${
              autonomyMode === 'semi_autonomous'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Avisa e envia após 10 segundos com opção de intervir"
          >
            Supervisionado
          </button>
          <button
            type="button"
            onClick={() => handleChangeMode('autonomous_24_7')}
            className={`py-0.5 rounded-md transition-all truncate ${
              autonomyMode === 'autonomous_24_7'
                ? 'bg-emerald-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Envia respostas e executa ações com registro de auditoria"
          >
            Autônomo
          </button>
        </div>
      </div>

      {/* Countdown Alert Banner when Semi-Autonomous */}
      {countdown !== null && pendingSuggestion && (
        <div className="rounded-lg bg-amber-950/60 border border-amber-500/40 p-2.5 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-amber-200">
                A IA enviará a resposta em <span className="text-amber-300 font-extrabold text-sm">{countdown}s</span>
              </div>
              <div className="text-[10px] text-amber-400/80 truncate max-w-xs">
                "{pendingSuggestion}"
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onApproveAndSend && onApproveAndSend(pendingSuggestion)}
              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Zap size={11} /> Liberar Agora
            </button>
            <button
              type="button"
              onClick={() => {
                setCountdown(null);
                if (onRejectOrCancel) onRejectOrCancel();
              }}
              className="px-2.5 py-1 rounded-md bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <XCircle size={11} /> Cancelar / Assumir
            </button>
          </div>
        </div>
      )}

      {/* Live Cognitive Thought Trail (Auditoria ao Vivo) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Activity size={12} className="text-purple-400" /> Trilha de Raciocínio da IA ao Vivo
          </span>
          <span className="text-[10px] text-slate-400">Última decisão: {logs[0]?.timestamp || 'Agora'}</span>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg bg-slate-900/80 border border-slate-800 p-2.5 space-y-1.5 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {log.contactName} ({log.timestamp})
                </span>
                <span className="font-semibold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  {log.intentDetected}
                </span>
              </div>

              <div className="text-[11px] text-slate-300 bg-slate-950/70 p-1.5 rounded border border-slate-800/60 font-mono">
                <span className="text-slate-500">🔍 Sistema:</span> {log.systemConsulted}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[10px]">
                <span className="text-slate-400 truncate max-w-[220px]">
                  💡 <span className="text-slate-300">{log.recommendedAction}</span>
                </span>
                <span className="font-bold text-emerald-400">
                  {Math.round(log.confidenceScore * 100)}% precisão
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Emergency Kill Switch */}
      <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1">
        <span className="text-[9.5px] text-slate-400">
          Supervisão ativa
        </span>
        <button
          type="button"
          onClick={() => handleChangeMode('copilot_supervised')}
          className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 text-[9.5px] font-bold transition flex items-center gap-1 cursor-pointer"
        >
          <ShieldAlert size={10} /> Pausar Autonomia
        </button>
      </div>
    </div>
  );
};
