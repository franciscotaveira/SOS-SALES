import React from 'react';
import { Journey, OperatorRole } from '../../types/cockpit';
import { UserCheck, UserX, AlertCircle, ArrowRightLeft, Shield } from 'lucide-react';

interface HandoffControlsProps {
  journey: Journey;
  role: OperatorRole;
  currentOperatorId: string;
  currentOperatorName: string;
  onClaim: () => void;
  onRelease: () => void;
}

export const HandoffControls: React.FC<HandoffControlsProps> = ({
  journey,
  role,
  currentOperatorId,
  currentOperatorName,
  onClaim,
  onRelease,
}) => {
  const isMine = journey.assignedOperatorId === currentOperatorId;
  const isPending = journey.handoffStatus === 'pending_operator';
  const isOther = !isMine && !isPending && !!journey.assignedOperatorName;

  if (role === 'viewer') {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2">
        <Shield className="w-4 h-4 text-slate-400 shrink-0" />
        <span>Modo Visualizador: Controles operacionais de handoff desativados.</span>
      </div>
    );
  }

  return (
    <div id="handoff-controls-panel" className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
          Controle de Handoff
        </span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            isPending
              ? 'bg-amber-100 text-amber-800'
              : isMine
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {isPending ? 'Pendente' : isMine ? 'Com Você' : 'Outro Operador'}
        </span>
      </div>

      <div className="text-slate-600 text-[11px] leading-relaxed">
        {isPending && 'Esta conversa foi transferida pelo bot e está aguardando um atendente humano.'}
        {isMine && 'Você é o operador ativo responsável pelo cumprimento do SLA desta conversa.'}
        {isOther && `Esta conversa está sendo atendida por ${journey.assignedOperatorName}.`}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {isPending && (
          <button
            id="dossier-claim-btn"
            onClick={onClaim}
            className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Assumir Agora</span>
          </button>
        )}

        {isMine && (
          <button
            id="dossier-release-btn"
            onClick={onRelease}
            className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-300 transition-colors flex items-center justify-center gap-1.5"
          >
            <UserX className="w-3.5 h-3.5 text-slate-500" />
            <span>Liberar / Devolver para Fila</span>
          </button>
        )}

        {isOther && (
          <button
            id="dossier-takeover-btn"
            onClick={onClaim}
            className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transferir para Você</span>
          </button>
        )}
      </div>
    </div>
  );
};
