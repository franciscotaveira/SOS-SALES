import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  isOffline: boolean;
  onReconnect?: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOffline, onReconnect }) => {
  if (!isOffline) return null;

  return (
    <div
      id="offline-status-banner"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4" />
        <span>Você está operando offline ou com conexão instável. Seus rascunhos continuam salvos localmente.</span>
      </div>
      {onReconnect && (
        <button
          onClick={onReconnect}
          className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded text-[11px] font-bold transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Tentar Reconectar</span>
        </button>
      )}
    </div>
  );
};
