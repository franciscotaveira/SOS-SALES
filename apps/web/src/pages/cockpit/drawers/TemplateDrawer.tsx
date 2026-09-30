import { type FC, useState, useEffect } from "react";
import { Drawer, Button, Badge, Input, SegmentedControl } from "@sos-sales/ui";
import { Zap, ExternalLink, AlertCircle } from "lucide-react";
import { apiClient, type MessageTemplateSummary, type CommercialThreadSummary } from "../../../services/api-client";

interface TemplateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onTemplateSent?: () => void;
}

export const TemplateDrawer: FC<TemplateDrawerProps> = ({
  isOpen,
  onClose,
  thread,
  workspaceId,
  token,
  onTemplateSent,
}) => {
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplateSummary | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;
    apiClient
      .getTemplates(workspaceId, {}, { token })
      .then((res) => {
        setTemplates(res.templates || []);
        if (res.templates?.length > 0 && !selectedTemplate) {
          setSelectedTemplate(res.templates[0] ?? null);
        }
      })
      .catch(() => {});
  }, [isOpen, workspaceId, token, selectedTemplate]);

  // Extract variable keys {{1}}, {{2}} etc.
  const variableMatches = selectedTemplate?.bodyText
    ? Array.from(new Set(selectedTemplate.bodyText.match(/\{\{(\d+)\}\}/g) || []))
    : [];

  const handleVariableChange = (match: string, val: string) => {
    const key = match.replace(/[{}]/g, "");
    setVariables((prev) => ({ ...prev, [key]: val }));
  };

  const handleSend = async () => {
    if (!thread || !selectedTemplate || !workspaceId || !token) return;
    setIsSending(true);
    setError(null);

    try {
      const varKeys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
      const parameters = varKeys.map((k) => ({
        type: "text",
        text: variables[k] || `{{${k}}}`,
      }));

      let renderedBody = selectedTemplate.bodyText;
      varKeys.forEach((k) => {
        renderedBody = renderedBody.split(`{{${k}}}`).join(variables[k] || `{{${k}}}`);
      });
      if (selectedTemplate.headerText) renderedBody = `[${selectedTemplate.headerText}]\n\n${renderedBody}`;
      if (selectedTemplate.footerText) renderedBody = `${renderedBody}\n\n_${selectedTemplate.footerText}_`;

      await apiClient.sendOutboundMessage(
        workspaceId,
        thread.channelInstanceId,
        {
          recipientPhoneE164: thread.contactPhone,
          contentType: "template",
          body: renderedBody,
          template: {
            name: selectedTemplate.name,
            language: selectedTemplate.language || "pt_BR",
            components: parameters.length > 0 ? [{ type: "body", parameters }] : [],
          },
        },
        { token }
      );

      onTemplateSent?.();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Falha ao enviar modelo.");
    } finally {
      setIsSending(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter === "all") return true;
    return t.category.toLowerCase() === categoryFilter.toLowerCase();
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Disparo de Modelo Oficial WABA"
      description="Selecione um modelo aprovado para abrir ou reabrir a janela de 24h Meta Cloud API."
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <a
            href="/modelos"
            style={{
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--color-action)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Criar modelo</span>
            <ExternalLink size={12} />
          </a>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={isSending || !selectedTemplate}
              onClick={handleSend}
              prefixIcon={<Zap size={14} />}
            >
              Disparar Modelo
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <SegmentedControl
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "all", label: "Todos" },
            { value: "utility", label: "Utilidade" },
            { value: "marketing", label: "Marketing" },
          ]}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500, color: "var(--text-secondary)" }}>
            Selecione o Modelo ({filteredTemplates.length})
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
            {filteredTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedTemplate(tpl)}
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: tpl.id === selectedTemplate?.id
                    ? "2px solid var(--color-action)"
                    : "1px solid var(--border-default)",
                  backgroundColor: tpl.id === selectedTemplate?.id
                    ? "var(--color-action-subtle)"
                    : "var(--bg-surface)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 500 }}>
                    {tpl.name}
                  </div>
                  <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                    {tpl.category} · {tpl.language}
                  </div>
                </div>
                <Badge variant={tpl.metaTemplateId ? "action" : "neutral"}>
                  {tpl.metaTemplateId ? "Meta Aprovado" : "Local"}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        {selectedTemplate && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Pré-visualização do Corpo
            </div>
            <div style={{ fontSize: "var(--font-size-sm, 0.875rem)", whiteSpace: "pre-wrap" }}>
              {selectedTemplate.bodyText}
            </div>

            {variableMatches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500 }}>
                  Preencher Variáveis:
                </span>
                {variableMatches.map((m) => {
                  const key = m.replace(/[{}]/g, "");
                  return (
                    <Input
                      key={m}
                      label={`Variável {{${key}}}`}
                      placeholder={`Valor para {{${key}}}`}
                      value={variables[key] || ""}
                      onChange={(e) => handleVariableChange(m, e.target.value)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};
