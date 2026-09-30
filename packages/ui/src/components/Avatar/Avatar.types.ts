import type { CSSProperties, ReactNode } from "react";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  id?: string;
  name?: string;
  icon?: ReactNode;
  size?: AvatarSize;
  className?: string;
  style?: CSSProperties;
  title?: string;
}
