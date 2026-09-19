/**
 * SOS Sales V3 — Main Application Shell (MCT OS v2.0)
 * Integrates @sos-sales/ui primitives, useSession with session-generation guards,
 * verified Fastify connectivity polling, and dedicated navigation views.
 * Truth in Data: Zero fictitious fallbacks, laboratory controls quarantined to DEV.
 */

import { useState, useEffect, useCallback, type FC } from "react";
import { AppShell, Button } from "@sos-sales/ui";
import { useSession } from "./hooks/useSession";
import { useConnectivity } from "./hooks/useConnectivity";
import { apiClient } from "./services/api-client";
import { DevLabToolbar } from "./components/DevLabToolbar";
import { CockpitPage } from "./pages/CockpitPage";
import { ContactsPage } from "./pages/ContactsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CatalogPage } from "./pages/CatalogPage";
import {
  MessageSquare,
  Users,
  Send,
  Settings,
} from "lucide-react";

export const isLabDistribution = (): boolean => {
  return Boolean(
    import.meta.env.DEV ||
    import.meta.env.VITE_ENABLE_LAB_TOOLS === "true" ||
    import.meta.env.MODE === "lab"
  );
};

export const App: FC = () => {
  const isLab = isLabDistribution();

  // Token state: In explicit lab distribution only, allow persistence in sessionStorage for lab convenience.
  // Stored strictly under isLab guard. Zero token in production bundle or VITE_* env.
  const [token, setToken] = useState<string | null>(() => {
    if (isLab && typeof window !== "undefined") {
      return sessionStorage.getItem("sos_v3_lab_token");
    }
    return null;
  });

  const [activeNavId, setActiveNavId] = useState<string>("cockpit");
  const [activeView, setActiveView] = useState<"cockpit" | "catalog">(() => {
    if (isLab && typeof window !== "undefined" && window.location.hash === "#catalog") {
      return "catalog";
    }
    return "cockpit";
  });
  const [isOfflineSimulated, setIsOfflineSimulated] = useState<boolean>(false);

  // Synchronize hash with activeView ONLY in explicit lab distribution
  useEffect(() => {
    if (!isLab) return;

    const handleHash = () => {
      if (window.location.hash === "#catalog") {
        setActiveView("catalog");
      } else if (window.location.hash === "" || window.location.hash === "#cockpit") {
        setActiveView("cockpit");
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [isLab]);

  // Real-time Fastify /ready health polling
  const connectivity = useConnectivity();

  // Tenant & Session Hook with atomic switching, session generation & AbortController
  const session = useSession(token);

  const handleTokenChange = useCallback((newToken: string | null) => {
    if (!isLab) return;
    setToken(newToken);
    if (typeof window !== "undefined") {
      if (newToken) {
        sessionStorage.setItem("sos_v3_lab_token", newToken);
      } else {
        sessionStorage.removeItem("sos_v3_lab_token");
      }
    }
  }, [isLab]);

  const handleSimulateOffline = useCallback(() => {
    apiClient.setBaseUrl("http://localhost:9999"); // Intentionally invalid port
    setIsOfflineSimulated(true);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const handleResetOffline = useCallback(() => {
    apiClient.setBaseUrl("http://localhost:4400"); // Normal API port
    setIsOfflineSimulated(false);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const navItems = [
    {
      id: "cockpit",
      label: "Cockpit Geral",
      icon: <MessageSquare size={18} />,
    },
    {
      id: "contacts",
      label: "Contatos & Leads",
      icon: <Users size={18} />,
    },
    {
      id: "campaigns",
      label: "Disparos CAPI",
      icon: <Send size={18} />,
    },
    {
      id: "settings",
      label: "Configurações",
      icon: <Settings size={18} />,
    },
  ];

  // Verified system status badge (Truth in Data)
  const systemStatus = {
    label: isOfflineSimulated
      ? "Modo Offline (Simulado)"
      : connectivity.status === "connected"
      ? "Sistema online"
      : connectivity.status === "offline"
      ? "Sistema offline"
      : connectivity.status === "degraded"
      ? "Sistema instável"
      : "Verificando...",
    shortLabel: isOfflineSimulated
      ? "Offline"
      : connectivity.status === "connected"
      ? "Online"
      : connectivity.status === "offline"
      ? "Offline"
      : connectivity.status === "degraded"
      ? "Instável"
      : "...",
    tooltip:
      connectivity.dbLatencyMs !== null && connectivity.dbLatencyMs !== undefined
        ? `Sistema online (latência: ${connectivity.dbLatencyMs}ms)`
        : undefined,
    variant:
      isOfflineSimulated || connectivity.status === "offline"
        ? ("danger" as const)
        : connectivity.status === "degraded"
        ? ("warning" as const)
        : connectivity.status === "connected"
        ? ("action" as const)
        : ("neutral" as const),
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Dev Lab Toolbar — Quarantined strictly to import.meta.env.DEV */}
      <DevLabToolbar
        token={token}
        onTokenChange={handleTokenChange}
        onSimulateOffline={handleSimulateOffline}
        onResetOffline={handleResetOffline}
        isOfflineSimulated={isOfflineSimulated}
        activeView={activeView}
        onToggleView={setActiveView}
        onRefresh={() => {
          session.refreshSession();
          connectivity.checkNow();
        }}
      />

      {/* Main Responsive Sovereign Shell */}
      <AppShell
        navItems={navItems}
        activeNavId={activeNavId}
        onNavSelect={(id) => {
          setActiveNavId(id);
          setActiveView("cockpit");
          if (window.location.hash === "#catalog") {
            window.location.hash = "";
          }
        }}
        workspaces={session.workspaces}
        activeWorkspace={session.activeWorkspace}
        onWorkspaceSelect={(ws) => session.selectWorkspace(ws.id)}
        isLoadingWorkspaces={session.isLoadingMe}
        userEmail={session.user?.email || undefined}
        userRole={session.user?.activeRole || undefined}
        systemStatus={systemStatus}
        headerActions={
          session.user ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                session.logout();
                handleTokenChange(null);
              }}
            >
              Sair
            </Button>
          ) : undefined
        }
      >
        {isLab && activeView === "catalog" ? (
          <CatalogPage onClose={() => setActiveView("cockpit")} />
        ) : activeNavId === "contacts" ? (
          <ContactsPage session={session} />
        ) : activeNavId === "campaigns" ? (
          <CampaignsPage session={session} />
        ) : activeNavId === "settings" ? (
          <SettingsPage session={session} />
        ) : (
          <CockpitPage session={session} />
        )}
      </AppShell>
    </div>
  );
};
