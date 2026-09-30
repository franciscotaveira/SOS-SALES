import type { FC } from "react";
import { User } from "lucide-react";
import type { AvatarProps, AvatarSize } from "./Avatar.types";

interface PaletteItem {
  bg: string;
  color: string;
  border: string;
}

const DEFAULT_PALETTE_ITEM: PaletteItem = {
  bg: "var(--color-action-subtle, #E6F4F1)",
  color: "var(--color-action, #008069)",
  border: "var(--color-action-border, #80C0B4)",
};

const PALETTE: PaletteItem[] = [
  DEFAULT_PALETTE_ITEM,
  { bg: "var(--color-operational-subtle, #EFF6FF)", color: "var(--color-operational, #2563EB)", border: "var(--color-operational-border, #BFDBFE)" },
  { bg: "var(--color-ai-subtle, #F5F3FF)", color: "var(--color-ai, #7C3AED)", border: "var(--color-ai-border, #DDD6FE)" },
  { bg: "var(--color-warning-subtle, #FFFBEB)", color: "var(--color-warning, #D97706)", border: "var(--color-warning-border, #FDE68A)" },
  { bg: "var(--bg-surface-elevated, #F1F5F9)", color: "var(--text-secondary, #475569)", border: "var(--border-default, #E2E8F0)" },
];

const getDeterministicColor = (id?: string): PaletteItem => {
  if (!id) return DEFAULT_PALETTE_ITEM;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index] ?? DEFAULT_PALETTE_ITEM;
};

const getInitials = (name?: string): string | null => {
  if (!name || !name.trim()) return null;
  const clean = name.trim().replace(/^(\+?\d+)/, ""); // Avoid DDI or purely numeric phone initials
  if (!clean) return null;

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0] ?? "";
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const last = parts[parts.length - 1] ?? "";
  const firstChar = first.charAt(0);
  const lastChar = last.charAt(0);
  if (!firstChar && !lastChar) return null;
  return (firstChar + lastChar).toUpperCase();
};

export const Avatar: FC<AvatarProps> = ({
  id,
  name,
  icon,
  size = "md",
  className = "",
  style,
  title,
}) => {
  const colorToken = getDeterministicColor(id || name);
  const initials = getInitials(name);

  const dimensionMap: Record<AvatarSize, { dimension: string; fontSize: string; iconSize: number }> = {
    sm: { dimension: "24px", fontSize: "0.6875rem", iconSize: 13 },
    md: { dimension: "32px", fontSize: "var(--font-size-xs, 0.75rem)", iconSize: 16 },
    lg: { dimension: "40px", fontSize: "var(--font-size-sm, 0.875rem)", iconSize: 20 },
  };

  const { dimension, fontSize, iconSize } = dimensionMap[size];

  return (
    <div
      className={`sos-avatar sos-avatar-${size} ${className}`}
      title={title || name}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        borderRadius: "var(--radius-full, 9999px)",
        backgroundColor: colorToken.bg,
        color: colorToken.color,
        border: `1px solid ${colorToken.border}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 600,
        fontFamily: "var(--font-sans, sans-serif)",
        userSelect: "none",
        flexShrink: 0,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {initials ? (
        <span>{initials}</span>
      ) : icon ? (
        icon
      ) : (
        <User size={iconSize} color={colorToken.color} />
      )}
    </div>
  );
};
