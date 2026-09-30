/**
 * SOS Sales V3 — Canonical Breakpoints Specification
 */

export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type BreakpointKey = keyof typeof breakpoints;
