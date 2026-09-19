export type LoadingVariant = "skeleton" | "spinner" | "card-skeleton";

export interface LoadingStateProps {
  variant?: LoadingVariant;
  lines?: number;
  height?: string | number;
  text?: string;
  className?: string;
  style?: React.CSSProperties;
}
