import type { FC } from "react";
import type { NavItem } from "./AppShell.types";

interface MobileNavProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  hidden?: boolean;
}

export const MobileNav: FC<MobileNavProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
  hidden = false,
}) => {
  if (hidden) return null;

  // Mobile nav shows up to 5 primary items
  const displayItems = navItems.slice(0, 5);

  return (
    <nav
      aria-label="Navegação Inferior Mobile"
      className="sos-mobile-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "calc(var(--mobile-nav-h, 56px) + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        borderTop: "1px solid var(--border-default, #E2E8F0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        zIndex: 30,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {displayItems.map((item) => {
        const isActive = item.id === activeNavId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.onClick) item.onClick();
              onNavSelect(item.id);
            }}
            aria-current={isActive ? "page" : undefined}
            disabled={item.disabled}
            style={{
              flex: 1,
              height: "100%",
              minHeight: "44px", // Accessible touch target
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              background: "none",
              border: "none",
              color: isActive
                ? "var(--color-action, #008069)"
                : "var(--text-secondary, #64748B)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: isActive ? 600 : 500,
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              {item.icon}
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60px" }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
