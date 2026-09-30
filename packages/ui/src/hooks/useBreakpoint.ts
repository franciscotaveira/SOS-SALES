import { useState, useEffect } from "react";
import { breakpoints } from "../tokens/breakpoints";

export interface BreakpointState {
  breakpoint: "sm" | "md" | "lg" | "xl";
  isMobile: boolean; // < 768px
  isTablet: boolean; // >= 768px && < 1280px
  isTabletCompact: boolean; // >= 768px && < 1024px
  isTabletWide: boolean; // >= 1024px && < 1280px
  isDesktop: boolean; // >= 1280px
}

const getBreakpointState = (width: number): BreakpointState => {
  const isMobile = width < breakpoints.md;
  const isTablet = width >= breakpoints.md && width < breakpoints.xl;
  const isTabletCompact = width >= breakpoints.md && width < breakpoints.lg;
  const isTabletWide = width >= breakpoints.lg && width < breakpoints.xl;
  const isDesktop = width >= breakpoints.xl;

  let breakpoint: BreakpointState["breakpoint"] = "sm";
  if (width >= breakpoints.xl) {
    breakpoint = "xl";
  } else if (width >= breakpoints.lg) {
    breakpoint = "lg";
  } else if (width >= breakpoints.md) {
    breakpoint = "md";
  } else {
    breakpoint = "sm";
  }

  return {
    breakpoint,
    isMobile,
    isTablet,
    isTabletCompact,
    isTabletWide,
    isDesktop,
  };
};

export const useBreakpoint = (): BreakpointState => {
  const [state, setState] = useState<BreakpointState>(() => {
    if (typeof window === "undefined") {
      return {
        breakpoint: "xl",
        isMobile: false,
        isTablet: false,
        isTabletCompact: false,
        isTabletWide: false,
        isDesktop: true,
      };
    }
    return getBreakpointState(window.innerWidth);
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQueries = [
      window.matchMedia(`(max-width: ${breakpoints.sm - 1}px)`),
      window.matchMedia(`(min-width: ${breakpoints.sm}px) and (max-width: ${breakpoints.md - 1}px)`),
      window.matchMedia(`(min-width: ${breakpoints.md}px) and (max-width: ${breakpoints.lg - 1}px)`),
      window.matchMedia(`(min-width: ${breakpoints.lg}px) and (max-width: ${breakpoints.xl - 1}px)`),
      window.matchMedia(`(min-width: ${breakpoints.xl}px)`),
    ];

    const updateState = () => {
      setState(getBreakpointState(window.innerWidth));
    };

    updateState();

    mediaQueries.forEach((mq) => {
      if (mq.addEventListener) {
        mq.addEventListener("change", updateState);
      } else if ("addListener" in mq) {
        (mq as unknown as { addListener: (cb: () => void) => void }).addListener(updateState);
      }
    });

    window.addEventListener("resize", updateState);

    return () => {
      mediaQueries.forEach((mq) => {
        if (mq.removeEventListener) {
          mq.removeEventListener("change", updateState);
        } else if ("removeListener" in mq) {
          (mq as unknown as { removeListener: (cb: () => void) => void }).removeListener(updateState);
        }
      });
      window.removeEventListener("resize", updateState);
    };
  }, []);

  return state;
};
