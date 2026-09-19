import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "action"
  | "operational"
  | "ai"
  | "warning"
  | "danger"
  | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  pulseDot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}
