import type { FC } from "react";
import { Badge, Button, ListItem, useBreakpoint } from "@sos-sales/ui";
import { FileText, Eye, Send } from "lucide-react";
import type { MessageTemplateSummary } from "../../services/api-client";

interface TemplatesTableProps {
  templates: MessageTemplateSummary[];
  onSelectPreview: (template: MessageTemplateSummary) => void;
  onSelectBroadcast?: (template: MessageTemplateSummary) => void;
}

export const TemplatesTable: FC<TemplatesTableProps> = ({
  templates,
  onSelectPreview,
  onSelectBroadcast,
}) => {
  const { isMobile } = useBreakpoint();

  if (isMobile) {
    return (
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        {templates.map((t) => (
          <ListItem
            key={t.id}
            height="md"
            leading={
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-action-subtle)",
                  color: "var(--color-action)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FileText size={18} />
              </div>
            }
            title={<span style={{ fontWeight: 600 }}>{t.name}</span>}
            subtitle={
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                <span>{t.category}</span>
                <span>•</span>
                <span>{t.language}</span>
              </div>
            }
            meta={
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Badge variant={t.metaTemplateId ? "action" : "neutral"}>
                  {t.metaTemplateId ? "Meta Aprovado" : "Local"}
                </Badge>
                {onSelectBroadcast && (
                  <Button
                    size="xs"
                    variant="primary"
                    prefixIcon={<Send size={11} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBroadcast(t);
                    }}
                  >
                    Disparar
                  </Button>
                )}
              </div>
            }
            onClick={() => onSelectPreview(t)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          fontSize: "var(--font-size-sm)",
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderBottom: "1px solid var(--border-default)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Nome do Modelo
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Categoria
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Idioma
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              Status Homologação
            </th>
            <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", textAlign: "right" }}>
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr
              key={t.id}
              style={{
                height: "48px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <td style={{ padding: "0 16px", fontWeight: 600, color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FileText size={16} style={{ color: "var(--color-action)" }} />
                  <span>{t.name}</span>
                </div>
              </td>
              <td style={{ padding: "0 16px" }}>
                <Badge variant="operational">{t.category}</Badge>
              </td>
              <td style={{ padding: "0 16px", fontFamily: "var(--font-mono)" }}>
                {t.language}
              </td>
              <td style={{ padding: "0 16px" }}>
                <Badge variant={t.metaTemplateId ? "action" : "neutral"}>
                  {t.metaTemplateId ? "Meta Aprovado" : "Local — não submetido"}
                </Badge>
              </td>
              <td style={{ padding: "0 16px", textAlign: "right" }}>
                <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    prefixIcon={<Eye size={14} />}
                    onClick={() => onSelectPreview(t)}
                  >
                    Visualizar
                  </Button>
                  {onSelectBroadcast && (
                    <Button
                      size="sm"
                      variant="primary"
                      prefixIcon={<Send size={13} />}
                      onClick={() => onSelectBroadcast(t)}
                    >
                      Disparar em Massa
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
