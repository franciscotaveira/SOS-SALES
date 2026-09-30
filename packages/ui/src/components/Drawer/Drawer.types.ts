import type { ReactNode } from "react";

export type DrawerPosition = "left" | "right" | "bottom";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  position?: DrawerPosition;
  width?: string;
  height?: string;
  children: ReactNode;
  footer?: ReactNode;
}
