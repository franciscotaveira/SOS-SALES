import React, { useState } from 'react';
import { UserRound } from 'lucide-react';

interface ContactAvatarProps {
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showOnlineBadge?: boolean;
  className?: string;
}

const GRADIENT_PALETTES = [
  'from-emerald-500 to-teal-700 text-white',
  'from-blue-500 to-indigo-700 text-white',
  'from-violet-500 to-purple-800 text-white',
  'from-pink-500 to-rose-700 text-white',
  'from-amber-500 to-orange-700 text-white',
  'from-teal-500 to-emerald-800 text-white',
  'from-cyan-500 to-blue-700 text-white',
  'from-indigo-500 to-violet-800 text-white',
  'from-fuchsia-500 to-pink-700 text-white',
  'from-slate-600 to-slate-800 text-white',
];

function getDeterministicGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index];
}

function getInitials(name?: string | null, phone?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  if (phone && phone.trim()) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 2) {
      return digits.slice(-2);
    }
  }
  return 'WA';
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base font-bold',
  xl: 'w-14 h-14 text-lg font-bold',
};

const BADGE_SIZE_MAP = {
  xs: 'w-1.5 h-1.5 bottom-0 right-0',
  sm: 'w-2 h-2 bottom-0 right-0',
  md: 'w-2.5 h-2.5 bottom-0.5 right-0.5',
  lg: 'w-3 h-3 bottom-0.5 right-0.5',
  xl: 'w-3.5 h-3.5 bottom-1 right-1',
};

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  name,
  phone,
  avatarUrl,
  size = 'md',
  showOnlineBadge = false,
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);
  const seed = name || phone || 'contact';
  const gradient = getDeterministicGradient(seed);
  const initials = getInitials(name, phone);
  const sizeClasses = SIZE_MAP[size] || SIZE_MAP.md;
  const badgeClasses = BADGE_SIZE_MAP[size] || BADGE_SIZE_MAP.md;

  const hasValidImage = Boolean(avatarUrl && !imageError);

  return (
    <div className={`relative shrink-0 select-none ${className}`}>
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center font-bold tracking-tight shadow-xs border border-black/5 overflow-hidden ${
          hasValidImage ? 'bg-slate-100' : `bg-linear-to-br ${gradient}`
        }`}
      >
        {hasValidImage ? (
          <img
            src={avatarUrl!}
            alt={name || 'Contato'}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : initials ? (
          <span className="font-semibold">{initials}</span>
        ) : (
          <UserRound className="w-1/2 h-1/2 opacity-80" />
        )}
      </div>

      {showOnlineBadge && (
        <span
          className={`absolute ${badgeClasses} rounded-full bg-emerald-500 ring-2 ring-white`}
          title="Online / Janela ativa"
        />
      )}
    </div>
  );
};
