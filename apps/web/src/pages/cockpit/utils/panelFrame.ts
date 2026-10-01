import type { CSSProperties } from "react";

/** Framed panel on the canvas: gives each cockpit column its own card. Flush on mobile. */
export const panelFrame = (isMobile: boolean): CSSProperties =>
  isMobile
    ? {}
    : {
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      };

/** Gutter between framed panels on the canvas. */
export const PANEL_GAP = "var(--space-4, 16px)";
