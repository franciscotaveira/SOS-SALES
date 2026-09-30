import { useState, useCallback } from "react";
import { useBreakpoint } from "@sos-sales/ui";

export const useCockpitLayout = () => {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isContextDrawerOpen, setIsContextDrawerOpen] = useState(false);

  // Left sidebar (inbox queue) collapse preference
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("sos_sales_left_collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Right sidebar (context dossier) collapse preference
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("sos_sales_right_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleLeft = useCallback(() => {
    setIsLeftCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sos_sales_left_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleRight = useCallback(() => {
    setIsRightCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sos_sales_right_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleSelectThread = useCallback((threadId: string | null) => {
    setSelectedThreadId(threadId);
    if (!threadId) {
      setIsContextDrawerOpen(false);
    }
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedThreadId(null);
    setIsContextDrawerOpen(false);
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop,
    selectedThreadId,
    setSelectedThreadId: handleSelectThread,
    handleBackToList,
    isLeftCollapsed,
    toggleLeft,
    isRightCollapsed,
    toggleRight,
    isContextDrawerOpen,
    setIsContextDrawerOpen,
  };
};
