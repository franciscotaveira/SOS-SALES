import React from 'react';
import {
  Play,
  Pause,
  Mic,
  Volume2,
  FileText,
  Download,
  ExternalLink,
  Eye,
  X,
  ZoomIn,
  Film,
  Sparkles,
  Music,
  CheckCheck,
} from 'lucide-react';

export interface MessageMediaPayload {
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'ptt' | 'sticker' | 'other';
  url?: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  fileSize?: number | string;
  fileSizeFormatted?: string;
  duration?: number;
  authorOrSpeaker?: string;
}

interface MessageMediaRendererProps {
  mediaPayload?: MessageMediaPayload | null;
  textContent?: string | null;
  isOutbound?: boolean;
  senderName?: string;
  providerMessageId?: string | null;
  session?: string;
}

export const MessageMediaRenderer: React.FC<MessageMediaRendererProps> = ({
  mediaPayload,
  textContent,
  isOutbound = false,
  senderName,
  providerMessageId,
  session = 'default',
}) => {
  // Build a fallback proxy URL from providerMessageId when media_payload has no url
  const buildProxyUrl = (msgId: string, ext?: string): string => {
    const ext_ = ext || (msgId.includes('.') ? '' : '.bin');
    const path = `/api/files/${session}/${msgId}${ext_}`;
    return `/api/v1/channels/waha/media-proxy?path=${encodeURIComponent(path)}`;
  };
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState<number>(1);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Inferred media type if mediaPayload is absent but text contains indicators.
  // No stock photos/videos — only shape detection. URL will be null when no real URL exists.
  const inferred = React.useMemo(() => {
    if (mediaPayload) {
      // If payload exists but url is empty, try to build from providerMessageId
      if (!mediaPayload.url && providerMessageId) {
        const ext = mediaPayload.mimetype?.split('/')[1]?.split(';')[0] || '';
        const extMap: Record<string, string> = { 'ogg': '.oga', 'mpeg': '.mp3', 'jpeg': '.jpg', 'png': '.png', 'pdf': '.pdf', 'mp4': '.mp4' };
        const resolvedExt = extMap[ext] || (ext ? `.${ext}` : '');
        return { ...mediaPayload, url: buildProxyUrl(providerMessageId, resolvedExt) };
      }
      return mediaPayload;
    }

    const text = (textContent || '').trim();
    const lower = text.toLowerCase();

    // Outbound draft with embedded base64: "caption:::data:image/jpeg;base64,..."
    if (text.includes(':::data:')) {
      const sepIdx = text.indexOf(':::');
      const dataUrl = text.substring(sepIdx + 3);
      const captionRaw = text.substring(0, sepIdx);
      const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
      const mimetype = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const isImg = mimetype.startsWith('image/');
      const isVid = mimetype.startsWith('video/');
      const isAud = mimetype.startsWith('audio/');
      return {
        mediaType: (isImg ? 'image' : isVid ? 'video' : isAud ? 'audio' : 'document') as MessageMediaPayload['mediaType'],
        url: dataUrl,
        mimetype,
        caption: captionRaw.replace(/^\[(Foto|Imagem|Vídeo|Áudio|Documento)\]\s*/i, '') || undefined,
        fileName: isImg ? 'imagem_whatsapp.jpg' : isVid ? 'video_whatsapp.mp4' : isAud ? 'audio_whatsapp.ogg' : 'documento_whatsapp',
      };
    }

    if (
      lower.includes('[áudio]') ||
      lower.includes('[audio]') ||
      lower.includes('🎤') ||
      lower.endsWith('.mp3') ||
      lower.endsWith('.ogg') ||
      lower.endsWith('.oga') ||
      lower.endsWith('.wav')
    ) {
      const ext = lower.endsWith('.mp3') ? '.mp3' : lower.endsWith('.oga') ? '.oga' : '.ogg';
      return {
        mediaType: 'audio' as const,
        url: providerMessageId ? buildProxyUrl(providerMessageId, ext) : undefined,
        fileName: text || 'Mensagem de voz WhatsApp.ogg',
        authorOrSpeaker: senderName || 'Cliente',
      };
    }

    if (
      lower.includes('[foto]') ||
      lower.includes('[imagem]') ||
      lower.includes('[mídia]') ||
      lower.includes('[midia]') ||
      lower.includes('📷') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp')
    ) {
      const ext = lower.endsWith('.png') ? '.png' : lower.endsWith('.webp') ? '.webp' : '.jpg';
      return {
        mediaType: 'image' as const,
        url: providerMessageId ? buildProxyUrl(providerMessageId, ext) : undefined,
        fileName: text || 'imagem_whatsapp.jpg',
        caption: text.replace(/^📷\s*|^\[(FOTO|IMAGEM|MÍDIA|MIDIA)\]\s*/i, '') || undefined,
      };
    }

    if (
      lower.includes('[vídeo]') ||
      lower.includes('[video]') ||
      lower.includes('🎥') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.webm')
    ) {
      return {
        mediaType: 'video' as const,
        url: providerMessageId ? buildProxyUrl(providerMessageId, '.mp4') : undefined,
        fileName: text || 'video_whatsapp.mp4',
      };
    }

    if (
      lower.includes('[pdf]') ||
      lower.includes('[documento]') ||
      lower.includes('📄') ||
      lower.endsWith('.pdf') ||
      lower.endsWith('.docx') ||
      lower.endsWith('.xlsx')
    ) {
      const ext = lower.endsWith('.pdf') ? '.pdf' : lower.endsWith('.docx') ? '.docx' : lower.endsWith('.xlsx') ? '.xlsx' : '';
      return {
        mediaType: 'document' as const,
        url: providerMessageId ? buildProxyUrl(providerMessageId, ext) : undefined,
        fileName: text.replace(/^📄\s*|^\[(DOCUMENTO|PDF)\]\s*/i, '') || 'documento_whatsapp',
      };
    }

    return null;
  }, [mediaPayload, textContent, senderName, providerMessageId, session]);

  const targetMedia = mediaPayload || inferred;

  // Audio Playback Handler
  const togglePlayAudio = (audioUrl?: string) => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setProgress((audio.currentTime / audio.duration) * 100);
          setCurrentTime(audio.currentTime);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      };
    }

    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSpeedToggle = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!targetMedia) {
    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {textContent || 'Mensagem'}
      </p>
    );
  }

  // ==========================================================================
  // 1. ÁUDIO / MENSAGEM DE VOZ (PTT)
  // ==========================================================================
  if (targetMedia.mediaType === 'audio' || targetMedia.mediaType === 'ptt') {
    const totalDuration = targetMedia.duration || 32;
    const speaker = targetMedia.authorOrSpeaker || (isOutbound ? 'Você (Atendente)' : 'Cliente');

    return (
      <div className="py-1 min-w-[260px] max-w-[320px] space-y-1.5">
        {targetMedia.caption && (
          <p className="text-[12px] font-medium mb-1">{targetMedia.caption}</p>
        )}

        <div className="flex items-center gap-2.5 rounded-xl bg-black/5 p-2 border border-black/5 dark:bg-white/5">
          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={() => togglePlayAudio(targetMedia.url)}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm transition transform active:scale-95 cursor-pointer ${
              isOutbound ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#00A884] hover:bg-[#008f6f]'
            }`}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>

          {/* Waveform & Progress */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <Mic size={10} className="text-emerald-600" />
                {speaker}
              </span>
              <span>
                {isPlaying ? formatSeconds(currentTime) : formatSeconds(totalDuration)}
              </span>
            </div>

            {/* Simulated Animated Waveform Bars */}
            <div className="flex items-center gap-[2.5px] h-4 cursor-pointer py-1" onClick={() => togglePlayAudio(targetMedia.url)}>
              {[40, 70, 90, 60, 30, 80, 100, 65, 45, 95, 75, 50, 85, 90, 40, 60, 75, 95, 30, 50, 80, 60].map((h, i) => {
                const barProgress = (i / 22) * 100;
                const isPlayed = progress >= barProgress;
                return (
                  <span
                    key={i}
                    className={`w-[3px] rounded-full transition-all duration-150 ${
                      isPlayed
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    style={{
                      height: isPlaying ? `${Math.max(4, (h * (0.6 + Math.sin(Date.now() / 200 + i) * 0.4)))}px` : `${Math.max(4, h * 0.2)}px`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Playback Speed Pill */}
          <button
            type="button"
            onClick={handleSpeedToggle}
            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/10 hover:bg-black/20 text-slate-800 transition shrink-0 cursor-pointer"
            title="Alterar velocidade do áudio"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. FOTOS & IMAGENS COM LIGHTBOX
  // ==========================================================================
  if (targetMedia.mediaType === 'image' || targetMedia.mediaType === 'sticker') {
    const imageUrl = targetMedia.url
      ? targetMedia.url.startsWith('/api/v1/')
        ? `${window.location.origin}${targetMedia.url}`
        : targetMedia.url
      : null;

    return (
      <div className="py-1 max-w-[280px] space-y-1.5">
        <div
          onClick={() => imageUrl && setLightboxOpen(true)}
          className={`group relative rounded-xl overflow-hidden border border-black/10 shadow-2xs bg-slate-900 aspect-4/3 flex items-center justify-center ${
            imageUrl ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={targetMedia.caption || 'Anexo do WhatsApp'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <span className="bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                  <ZoomIn size={13} /> Ver foto completa
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-6 px-4">
              <Eye size={28} className="opacity-50" />
              <span className="text-xs text-center leading-tight">Imagem recebida pelo WhatsApp</span>
              <span className="text-[10px] opacity-60">Carregando...</span>
            </div>
          )}
        </div>

        {targetMedia.caption && (
          <p className="text-[12.5px] leading-snug text-slate-900 font-medium px-0.5">
            {targetMedia.caption}
          </p>
        )}

        {/* Lightbox Modal */}
        {lightboxOpen && imageUrl && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="absolute -top-10 right-0 text-white hover:text-slate-300 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
              >
                <X size={20} />
              </button>
              <img
                src={imageUrl}
                alt="Foto em alta resolução"
                className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
              />
              <div className="mt-3 flex items-center justify-between w-full text-white px-2">
                <span className="text-xs text-slate-300">{targetMedia.fileName || 'Imagem WhatsApp'}</span>
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                >
                  <Download size={13} /> Baixar Foto
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // 3. VÍDEOS
  // ==========================================================================
  if (targetMedia.mediaType === 'video') {
    return (
      <div className="py-1 max-w-[300px] space-y-1.5">
        <div className="rounded-xl overflow-hidden border border-black/10 bg-black shadow-2xs">
          <video
            src={targetMedia.url}
            controls
            className="w-full max-h-[240px] object-cover"
            preload="metadata"
          />
        </div>
        {targetMedia.caption && (
          <p className="text-[12.5px] leading-snug text-slate-900 font-medium px-0.5">
            {targetMedia.caption}
          </p>
        )}
      </div>
    );
  }

  // ==========================================================================
  // 4. DOCUMENTOS / PDF
  // ==========================================================================
  return (
    <div className="py-1 min-w-[240px] max-w-[300px] space-y-1.5">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
        <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-xs text-slate-900 truncate" title={targetMedia.fileName || 'Documento'}>
            {targetMedia.fileName || 'Documento WhatsApp.pdf'}
          </p>
          <p className="text-[10.5px] text-slate-500 font-mono">
            {targetMedia.fileSize || targetMedia.fileSizeFormatted || 'PDF'}
          </p>
        </div>
        <a
          href={targetMedia.url || '#'}
          target="_blank"
          rel="noreferrer"
          download
          className="p-2 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 transition text-slate-600 shrink-0"
          title="Baixar Documento"
        >
          <Download size={15} />
        </a>
      </div>

      {targetMedia.caption && (
        <p className="text-[12px] text-slate-800 leading-snug px-0.5">
          {targetMedia.caption}
        </p>
      )}
    </div>
  );
};
