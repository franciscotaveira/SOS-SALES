import type { FC } from "react";
import type { NavItem } from "./AppShell.types";

interface MobileNavProps {
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
}

export const MobileNav: FC<MobileNavProps> = ({
  navItems,
  activeNavId,
  onNavSelect,
}) => {
  // Mobile nav shows up to 4 items
  const displayItems = navItems.slice(0, 4);

  return (
    <nav
      aria-label="Navegação Inferior Mobile"
      className="sos-mobile-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "60px",
        backgroundColor: "var(--bg-surface, #FFFFFF)",
        borderTop: "1px solid var(--border-default, #E2E8F0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        zIndex: 30,
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.05)",
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
              minHeight: "44px", // Accessible tap target
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              background: "none",
              border: "none",
              color: isActive
                ? "var(--color-action, #008069)"
                : "var(--text-secondary, #64748B)",
              cursor: item.disabled ? "not-allowed" : "pointer",
              fontSize: "0.6875rem",
              fontWeight: isActive ? 600 : 500,
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
