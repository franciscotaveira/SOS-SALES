export const colors = {
  // Canvas & Surfaces
  canvas: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceElevated: "#F1F5F9",
  surfaceSubtle: "#F8FAFC",

  // Structural Dark Navy Sidebar
  sidebar: "#0B132B",
  sidebarHover: "#152243",
  sidebarText: "#F8FAFC",
  sidebarMuted: "#94A3B8",

  // High-Contrast Ink (WCAG 2.2 AA)
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#64748B",
  textInverse: "#FFFFFF",

  // Precision Borders
  borderSubtle: "#F1F5F9",
  borderDefault: "#E2E8F0",
  borderStrong: "#CBD5E1",
  borderFocus: "#00A884",

  // Operational Semantic Colors
  action: "#008069", // Canonical WhatsApp Green (4.89:1 on #FFFFFF - WCAG 2.2 AA compliant for normal text)
  actionHover: "#006E5A", // 6.22:1 on #FFFFFF
  actionSubtle: "#E6F4F1",
  actionAccent: "#00A884", // Vibrant accent for dark sidebar icons

  operational: "#2563EB",
  operationalHover: "#1D4ED8",
  operationalSubtle: "#EFF6FF",

  ai: "#7C3AED",
  aiHover: "#6D28D9",
  aiSubtle: "#F5F3FF",

  warning: "#D97706",
  warningHover: "#B45309",
  warningSubtle: "#FFFBEB",

  danger: "#DC2626",
  dangerHover: "#B91C1C",
  dangerSubtle: "#FEF2F2",
} as const;

export type Colors = typeof colors;
