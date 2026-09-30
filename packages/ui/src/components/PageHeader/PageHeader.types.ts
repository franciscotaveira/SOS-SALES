import type { CSSProperties, ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}
