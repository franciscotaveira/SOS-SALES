import { useState, type FC, type ReactNode } from "react";
import { Building2, ChevronDown, Check, Menu } from "lucide-react";
import { Badge } from "../Badge/Badge";
import type { WorkspaceItem } from "./AppShell.types";

interface HeaderProps {
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem | null;
  onWorkspaceSelect?: (workspace: WorkspaceItem) => void;
  isLoadingWorkspaces?: boolean;
  userEmail?: string;
  userRole?: string;
  systemStatus?: {
    label: string;
    shortLabel?: string;
    tooltip?: string;
    variant: "action" | "operational" | "warning" | "danger" | "neutral";
  };
  onOpenMobileMenu?: () => void;
  actions?: ReactNode;
  isMobile?: boolean;
}

export const Header: FC<HeaderProps> = ({
  workspaces = [],
  activeWorkspace,
  onWorkspaceSelect,
  isLoadingWorkspaces = false,
  userEmail,
  userRole,
  systemStatus,
  onOpenMobileMenu,
  actions,
  isMobile = false,
}) => {
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const isMobileView = isMobile || Boolean(onOpenMobileMenu);

  return (
    <header
      className="sos-app-header"
      style={{
        height: "64px",
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        borderBottom: "1px solid var(--border-default, #E2E8F0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobileView ? "0 12px" : "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 15,
        fontFamily: "var(--font-sans, sans-serif)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Left: Mobile Menu Trigger + Workspace Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobileView ? "8px" : "16px",
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu de navegação"
            className="sos-mobile-menu-btn"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary, #0F172A)",
              padding: "6px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm, 6px)",
              minWidth: "44px",
              minHeight: "44px",
              flexShrink: 0,
            }}
          >
            <Menu size={22} />
          </button>
        )}

        {/* Workspace Selector Dropdown */}
        <div style={{ position: "relative", minWidth: 0, flexShrink: 1 }}>
          <button
            type="button"
            onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
            aria-expanded={isWorkspaceDropdownOpen}
            aria-haspopup="listbox"
            className="sos-workspace-trigger"
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobileView ? "6px" : "8px",
              padding: isMobileView ? "8px 10px" : "8px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              color: "var(--text-primary, #0F172A)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "border-color 0.15s ease",
              maxWidth: isMobileView ? "160px" : "200px",
              minHeight: "44px",
              minWidth: "44px",
              boxSizing: "border-box",
            }}
          >
            <Building2 size={16} color="var(--color-operational, #2563EB)" style={{ flexShrink: 0 }} />
            <span
              style={{
                maxWidth: isMobileView ? "85px" : "130px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: isMobileView ? "0.8125rem" : "0.875rem",
              }}
            >
              {isLoadingWorkspaces
                ? "Carregando..."
                : activeWorkspace?.name || "Nenhum workspace"}
            </span>
            <ChevronDown size={14} color="var(--text-muted, #64748B)" style={{ flexShrink: 0 }} />
          </button>

          {isWorkspaceDropdownOpen && (
            <div
              role="listbox"
              aria-label="Workspaces disponíveis"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                width: "240px",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-default, #E2E8F0)",
                borderRadius: "var(--radius-md, 8px)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
                zIndex: 50,
              }}
            >
              <div
                style={{
                  padding: "6px 8px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-muted, #64748B)",
                  letterSpacing: "0.05em",
                }}
              >
                Seus Workspaces
              </div>

              {workspaces.length === 0 ? (
                <div
                  style={{
                    padding: "8px",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted, #64748B)",
                  }}
                >
                  Nenhum workspace vinculado.
                </div>
              ) : (
                workspaces.map((ws) => {
                  const isSelected = activeWorkspace?.id === ws.id;

                  return (
                    <button
                      key={ws.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        if (onWorkspaceSelect) onWorkspaceSelect(ws);
                        setIsWorkspaceDropdownOpen(false);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-sm, 6px)",
                        border: "none",
                        backgroundColor: isSelected
                          ? "var(--bg-surface-elevated, #F1F5F9)"
                          : "transparent",
                        color: "var(--text-primary, #0F172A)",
                        fontSize: "0.875rem",
                        fontWeight: isSelected ? 600 : 400,
                        cursor: "pointer",
                        textAlign: "left",
                        minHeight: "44px",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ws.name}
                      </span>
                      {isSelected && (
                        <Check size={14} color="var(--color-action, #008069)" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions, Status & User Profile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobileView ? "6px" : "12px",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}
      >
        {actions}

        {systemStatus && (
          <Badge
            variant={systemStatus.variant}
            pulseDot
            className="sos-header-status-badge"
            title={systemStatus.tooltip || systemStatus.label}
          >
            {isMobileView && systemStatus.shortLabel
              ? systemStatus.shortLabel
              : systemStatus.label}
          </Badge>
        )}

        {userEmail && (
          <div
            style={{
              display: isMobileView ? "none" : "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 8px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              border: "1px solid var(--border-default, #E2E8F0)",
            }}
          >
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-primary, #0F172A)",
                fontWeight: 500,
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userEmail}
            </span>
            {userRole && (
              <Badge variant="neutral">
                {userRole.toUpperCase()}
              </Badge>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
