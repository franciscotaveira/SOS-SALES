import React from 'react';
import { Channel } from '../../types/cockpit';
import { Radio, AlertTriangle, ShieldAlert, CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';

interface ChannelStatusProps {
  channel?: Channel;
  onTogglePause?: (channelId: string) => void;
  canManageChannel?: boolean;
}

export const ChannelStatus: React.FC<ChannelStatusProps> = ({
  channel,
  onTogglePause,
  canManageChannel = true,
}) => {
  if (!channel) return null;

  const isConnected = channel.health === 'connected' || channel.health === 'healthy';
  const isPaused = channel.health === 'paused';
  const isUnavailable = channel.health === 'degraded' || channel.health === 'disconnected';

  return (
    <div
      id={`channel-status-card-${channel.id}`}
      className={`p-3 rounded-xl border text-xs ${
        isPaused
          ? 'bg-rose-50/50 border-rose-200 text-rose-900'
          : 'bg-slate-50/70 border-slate-200 text-slate-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 font-bold">
          <Radio className="w-3.5 h-3.5 text-blue-600" />
          <span className="truncate">{channel.name}</span>
        </div>

        {/* Health status badge */}
        <div className="flex items-center gap-1 shrink-0">
          {isConnected && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Conectado
            </span>
          )}
          {isPaused && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
              <ShieldAlert className="w-3 h-3 text-rose-600" />
              Pausado
            </span>
          )}
          {isUnavailable && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              {channel.health === 'degraded' ? 'Instável' : 'Indisponível'}
            </span>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-600 font-mono mb-2">
        {channel.phoneNumber || 'Telefone não informado'} · WABA ID: {channel.wabaAccountId || 'não informado'}
      </div>

      {isPaused && (
        <div className="mb-2.5 p-2 rounded bg-rose-100/60 border border-rose-200 text-[11px] text-rose-900">
          <div className="font-semibold">
            Pausado por {channel.pausedBy || 'Supervisor'} em{' '}
            {channel.pausedAt ? new Date(channel.pausedAt).toLocaleTimeString() : 'hoje'}
          </div>
          {channel.pauseReason && (
            <div className="italic text-rose-800 mt-0.5">Motivo: "{channel.pauseReason}"</div>
          )}
        </div>
      )}

      {/* Supervisor quick control */}
      {canManageChannel && onTogglePause && (
        <button
          id={`toggle-channel-pause-btn-${channel.id}`}
          onClick={() => onTogglePause(channel.id)}
          className={`w-full py-1.5 px-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border ${
            isPaused
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-2xs'
          }`}
        >
          {isPaused ? (
            <>
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Retomar Canal WhatsApp</span>
            </>
          ) : (
            <>
              <PauseCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Pausar Canal WhatsApp</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
