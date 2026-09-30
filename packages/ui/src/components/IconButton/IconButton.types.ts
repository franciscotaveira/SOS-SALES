import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonVariant } from "../Button/Button.types";

export type IconButtonSize = "xs" | "sm" | "md";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  "aria-label": string; // Strict accessibility requirement
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: ButtonVariant;
  tooltip?: string;
  loading?: boolean;
}
