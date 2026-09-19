import { useState, useEffect, type FC } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Drawer } from "../Drawer/Drawer";
import type { AppShellProps } from "./AppShell.types";

export const AppShell: FC<AppShellProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
  workspaces,
  activeWorkspace,
  onWorkspaceSelect,
  isLoadingWorkspaces,
  userEmail,
  userRole,
  systemStatus,
  children,
  headerActions,
  sidebarCollapsed: controlledCollapsed,
  onSidebarCollapseToggle,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const isCollapsed =
    controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggleCollapse = () => {
    if (onSidebarCollapseToggle) {
      onSidebarCollapseToggle();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  // Window resize observer to adapt responsive layout
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 760);
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  return (
    <div
      className="sos-app-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--bg-canvas, #F8FAFC)",
        color: "var(--text-primary, #0F172A)",
        fontFamily: "var(--font-sans, sans-serif)",
        overflowX: "hidden",
        width: "100%",
        maxWidth: "100vw",
      }}
    >
      {/* Desktop & Tablet Sidebar (Hidden on Mobile) */}
      {!isMobile && (
        <Sidebar
          navItems={navItems}
          activeNavId={activeNavId}
          onNavSelect={onNavSelect}
          collapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      )}

      {/* Mobile Drawer Navigation */}
      {isMobile && (
        <Drawer
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          title="SOS SALES"
          description="Navegação do Operador"
          position="left"
          width="280px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {navItems.map((item) => {
              const isActive = item.id === activeNavId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.onClick) item.onClick();
                    onNavSelect(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  disabled={item.disabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "none",
                    backgroundColor: isActive
                      ? "var(--bg-surface-elevated, #F1F5F9)"
                      : "transparent",
                    color: isActive
                      ? "var(--color-action, #008069)"
                      : "var(--text-primary, #0F172A)",
                    cursor: item.disabled ? "not-allowed" : "pointer",
                    fontSize: "0.9375rem",
                    fontWeight: isActive ? 600 : 500,
                    textAlign: "left",
                    minHeight: "44px",
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Drawer>
      )}

      {/* Right Main Region: Header + Scrollable Content Area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflowX: "hidden",
          paddingBottom: isMobile ? "68px" : 0, // Space for mobile bottom bar
        }}
      >
        <Header
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onWorkspaceSelect={onWorkspaceSelect}
          isLoadingWorkspaces={isLoadingWorkspaces}
          userEmail={userEmail}
          userRole={userRole}
          systemStatus={systemStatus}
          onOpenMobileMenu={isMobile ? () => setIsMobileMenuOpen(true) : undefined}
          actions={headerActions}
          isMobile={isMobile}
        />

        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            padding: isMobile ? "16px" : "28px 32px",
            overflowY: "auto",
            overflowX: "hidden",
            outline: "none",
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <MobileNav
          navItems={navItems}
          activeNavId={activeNavId}
          onNavSelect={onNavSelect}
        />
      )}
    </div>
  );
};
