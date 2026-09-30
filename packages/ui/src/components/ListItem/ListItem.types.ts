import type { CSSProperties, ReactNode } from "react";

export type ListItemHeight = "sm" | "md" | "lg";

export interface ListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  height?: ListItemHeight;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  "aria-label"?: string;
}
