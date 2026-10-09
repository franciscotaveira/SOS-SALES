import { useState, useEffect, type FC } from "react";
import { PageHeader, useBreakpoint } from "@sos-sales/ui";
import { Radio, Bot, QrCode, AlertTriangle, Braces } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ChannelSummary } from "../../services/api-client";
import { ChannelsSection } from "./ChannelsSection";
import { AiAgentSection } from "./AiAgentSection";
import { PixSection } from "./PixSection";
import { DangerSection } from "./DangerSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { ChannelWizardDialog } from "./ChannelWizardDialog";
import { QrCodeDialog } from "./QrCodeDialog";

type SettingsTab = "canais" | "ia" | "pix" | "integracoes" | "perigo";

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const [activeTab, setActiveTab] = useState<SettingsTab>("canais");

  // Channels state
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dialogs
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [qrModal, setQrModal] = useState<{
    channelId: string;
    channelName: string;
    qrDataUri?: string;
    isLoading: boolean;
    error?: string;
  } | null>(null);

  const loadChannels = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoadingChannels(true);
    try {
      const res = await apiClient.getChannels(activeWorkspace.id, { token, includeInactive: true });
      setChannels(res.channels || []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [activeWorkspace?.id, token]);

  const handleOpenQr = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    setQrModal({ channelId, channelName, isLoading: true });
    try {
      const res = await apiClient.getChannelQrCode(activeWorkspace.id, channelId, { token });
      if (res.success) {
        setQrModal({ channelId, channelName, qrDataUri: res.qrDataUri, isLoading: false });
      } else {
        setQrModal({ channelId, channelName, isLoading: false, error: res.error || "QR Code indisponível." });
      }
    } catch (err: unknown) {
      setQrModal({ channelId, channelName, isLoading: false, error: err instanceof Error ? err.message : "Erro ao carregar QR Code." });
    }
  };

  const handleRevoke = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    const confirmed = window.confirm(`Deseja revogar as credenciais do canal "${channelName}"?`);
    if (!confirmed) return;

    setRevokingId(channelId);
    try {
      await apiClient.revokeChannel(activeWorkspace.id, channelId, { token });
      await loadChannels();
    } catch {
      // Non-fatal
    } finally {
      setRevokingId(null);
    }
  };

  const handleDelete = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    const confirmed = window.confirm(`Deseja excluir ou arquivar o canal "${channelName}"?`);
    if (!confirmed) return;

    setDeletingId(channelId);
    try {
      const res = await apiClient.deleteChannel(activeWorkspace.id, channelId, { token });
      await loadChannels();
      alert(res.message);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir canal.");
    } finally {
      setDeletingId(null);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: "canais", label: "Canais WhatsApp", icon: Radio },
    { id: "ia", label: "Atendimento IA & Skills", icon: Bot },
    { id: "pix", label: "Cobrança Pix", icon: QrCode },
    { id: "integracoes", label: "API & Webhooks", icon: Braces },
    { id: "perigo", label: "Zona de Perigo", icon: AlertTriangle },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Configurações"
          description="Gerencie os canais do WhatsApp, cobranças e integrações da empresa."
        />

        {/* Layout: 200px Left Nav + 720px Right Content */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: "24px",
            alignItems: "flex-start",
          }}
        >
          {/* 220px Left Section Navigation Card */}
          <nav
            aria-label="Seções de Configuração"
            style={{
              width: isMobile ? "100%" : "220px",
              minWidth: isMobile ? "100%" : "220px",
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: "4px",
              overflowX: isMobile ? "auto" : "visible",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              padding: "8px",
              boxSizing: "border-box",
            }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDanger = tab.id === "perigo";

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive
                      ? isDanger
                        ? "var(--color-danger-subtle)"
                        : "var(--color-action-subtle)"
                      : "transparent",
                    color: isDanger
                      ? "var(--color-danger)"
                      : isActive
                      ? "var(--color-action)"
                      : "var(--text-secondary)",
                    boxShadow: "none",
                    whiteSpace: "nowrap",
                    transition: "background-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease)",
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Max 720px Right Content Area */}
          <div style={{ flex: 1, maxWidth: "720px", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            {activeTab === "canais" && (
              <ChannelsSection
                channels={channels}
                isLoading={isLoadingChannels}
                onOpenWizard={() => setIsWizardOpen(true)}
                onOpenQr={handleOpenQr}
                onRevoke={handleRevoke}
                revokingId={revokingId}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            )}
            {activeTab === "ia" && <AiAgentSection workspaceId={activeWorkspace?.id} token={token ?? undefined} />}
            {activeTab === "pix" && <PixSection session={session} />}
            {activeTab === "integracoes" && <IntegrationsSection session={session} />}
            {activeTab === "perigo" && <DangerSection session={session} />}
          </div>
        </div>
      </div>

      {/* Connection Wizard Dialog */}
      <ChannelWizardDialog
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={activeWorkspace?.id}
        token={token ?? undefined}
        onChannelCreated={loadChannels}
      />

      {/* WAHA QR Code Dialog */}
      <QrCodeDialog
        isOpen={Boolean(qrModal)}
        onClose={() => setQrModal(null)}
        channelName={qrModal?.channelName || ""}
        qrDataUri={qrModal?.qrDataUri}
        isLoading={Boolean(qrModal?.isLoading)}
        error={qrModal?.error}
      />
    </div>
  );
};

export default SettingsPage;
