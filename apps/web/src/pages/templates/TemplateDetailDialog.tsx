import type { FC } from "react";
import { Dialog, Badge, Button } from "@sos-sales/ui";
import type { MessageTemplateSummary, MessageTemplateButton } from "../../services/api-client";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";

interface TemplateDetailDialogProps {
  template: MessageTemplateSummary | null;
  onClose: () => void;
}

export const TemplateDetailDialog: FC<TemplateDetailDialogProps> = ({ template, onClose }) => {
  if (!template) return null;

  return (
    <Dialog
      isOpen={Boolean(template)}
      onClose={onClose}
      title={`Modelo: ${template.name}`}
      description={`Categoria: ${template.category} • Idioma: ${template.language}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Badge variant={template.metaTemplateId ? "action" : "neutral"}>
            {template.metaTemplateId ? "Meta Aprovado" : "Local — não submetido à Meta"}
          </Badge>
          {template.metaTemplateId && (
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              ID: {template.metaTemplateId}
            </span>
          )}
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-canvas)",
            padding: "16px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {template.headerText && (
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                {template.headerText}
              </div>
            )}
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {renderWhatsappMarkdown(template.bodyText)}
            </div>
            {template.footerText && (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {template.footerText}
              </div>
            )}
            {template.buttons && template.buttons.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
                {template.buttons.map((btn: MessageTemplateButton, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      textAlign: "center",
                      color: "var(--color-operational)",
                      fontWeight: 600,
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    {btn.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
