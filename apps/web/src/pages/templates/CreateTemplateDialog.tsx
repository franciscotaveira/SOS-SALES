import { useState, type FC, type FormEvent } from "react";
import { Button, Input, Dialog, SegmentedControl, useBreakpoint } from "@sos-sales/ui";
import { apiClient } from "../../services/api-client";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";
import { Sparkles } from "lucide-react";

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  onCreated: () => void;
}

export const CreateTemplateDialog: FC<CreateTemplateDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onCreated,
}) => {
  const { isMobile } = useBreakpoint();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [formLanguage, setFormLanguage] = useState("pt_BR");
  const [formHeader, setFormHeader] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formFooter, setFormFooter] = useState("");
  const [formButton, setFormButton] = useState("");
  const [aiObjective, setAiObjective] = useState("");
  const [aiAudience, setAiAudience] = useState("Clientes e leads da empresa");
  const [aiTone, setAiTone] = useState<"PROFESSIONAL" | "FRIENDLY" | "DIRECT">("FRIENDLY");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [variableLabels, setVariableLabels] = useState<string[]>([]);

  const resetForm = () => {
    setFormName("");
    setFormCategory("UTILITY");
    setFormLanguage("pt_BR");
    setFormHeader("");
    setFormBody("");
    setFormFooter("");
    setFormButton("");
    setFormErrors({});
    setServerError(null);
    setAiObjective("");
    setAiAudience("Clientes e leads da empresa");
    setAiTone("FRIENDLY");
    setAiExplanation(null);
    setVariableLabels([]);
  };

  const handleGenerateWithAi = async () => {
    setServerError(null);
    if (aiObjective.trim().length < 10) {
      setServerError("Explique em uma frase o que a mensagem precisa conseguir.");
      return;
    }
    setIsGenerating(true);
    try {
      const { generated } = await apiClient.generateTemplate(
        workspaceId,
        { objective: aiObjective.trim(), audience: aiAudience.trim(), tone: aiTone },
        { token }
      );
      setFormName(generated.name);
      setFormCategory(generated.category);
      setFormHeader(generated.headerText || "");
      setFormBody(generated.bodyText);
      setFormFooter(generated.footerText || "");
      setFormButton(generated.buttonText || "");
      setVariableLabels(generated.variableLabels);
      setAiExplanation(generated.explanation);
    } catch (err: unknown) {
      setServerError((err as Error).message || "Não foi possível gerar o modelo com IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setServerError(null);

    const errors: Record<string, string> = {};
    const cleanName = formName.trim().toLowerCase();
    if (!cleanName) {
      errors.name = "Nome do modelo é obrigatório";
    } else if (!/^[a-z0-9_]+$/.test(cleanName)) {
      errors.name = "Nome deve conter apenas letras minúsculas, números e sublinhados (ex: oferta_v1)";
    } else if (cleanName.length > 128) {
      errors.name = "Nome deve ter no máximo 128 caracteres";
    }

    const cleanBody = formBody.trim();
    if (!cleanBody) {
      errors.bodyText = "Corpo do texto é obrigatório";
    } else if (cleanBody.length > 1024) {
      errors.bodyText = "Corpo do texto deve ter no máximo 1024 caracteres";
    }

    const cleanHeader = formHeader.trim();
    if (cleanHeader.length > 60) {
      errors.headerText = "Cabeçalho deve ter no máximo 60 caracteres";
    }

    const cleanFooter = formFooter.trim();
    if (cleanFooter.length > 60) {
      errors.footerText = "Rodapé deve ter no máximo 60 caracteres";
    }

    const cleanButton = formButton.trim();
    if (cleanButton.length > 25) {
      errors.buttonText = "Texto do botão deve ter no máximo 25 caracteres";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createTemplate(
        workspaceId,
        {
          name: cleanName,
          category: formCategory,
          language: formLanguage.trim() || "pt_BR",
          headerText: cleanHeader || null,
          bodyText: cleanBody,
          footerText: cleanFooter || null,
          buttons: cleanButton ? [{ type: "QUICK_REPLY", text: cleanButton }] : [],
          status: "PENDING",
        },
        { token }
      );

      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      setServerError((err as Error).message || "Falha ao registrar modelo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const WABA_PRESETS = [
    {
      id: "pix",
      label: "Cobrança Pix",
      name: "cobranca_pix_instantaneo",
      category: "UTILITY" as const,
      header: "Pagamento do Pedido",
      body: "Olá {{1}}, segue o link/chave Pix no valor de {{2}} referente ao seu pedido {{3}}. Por favor, efetue o pagamento para confirmação imediata.",
      footer: "Chat Sales Oficial",
      button: "Copiar Chave Pix",
    },
    {
      id: "catalog",
      label: "Oferta Catálogo",
      name: "oferta_catalogo_produto",
      category: "MARKETING" as const,
      header: "Novidade Exclusiva",
      body: "Olá {{1}}, separamos esta condição especial do produto {{2}} por apenas {{3}}. O que acha de aproveitarmos agora?",
      footer: "Oferta por tempo limitado",
      button: "Ver Detalhes",
    },
    {
      id: "flow",
      label: "Flow Formulário",
      name: "formulario_qualificacao_lead",
      category: "UTILITY" as const,
      header: "Qualificação de Atendimento",
      body: "Olá {{1}}, para agilizarmos sua proposta personalizada de {{2}}, preencha as preferências no formulário rápido abaixo.",
      footer: "Leva menos de 1 minuto",
      button: "Abrir Formulário",
    },
    {
      id: "reengagement",
      label: "Reengajamento 24h",
      name: "retomada_conversa_lead",
      category: "UTILITY" as const,
      header: "Retomada de Atendimento",
      body: "Olá {{1}}, estamos retomando seu contato sobre o assunto {{2}}. Ainda tem interesse ou podemos tirar mais alguma dúvida?",
      footer: "SOS Sales Suporte",
      button: "Falar com Consultor",
    },
  ];

  const applyPreset = (preset: typeof WABA_PRESETS[0]) => {
    setFormName(preset.name);
    setFormCategory(preset.category);
    setFormHeader(preset.header);
    setFormBody(preset.body);
    setFormFooter(preset.footer);
    setFormButton(preset.button);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Cadastrar Modelo WABA"
      maxWidth="880px"
      description="Conte o que deseja comunicar. A IA prepara o modelo e explica os campos para você revisar."
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {serverError && (
          <div
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {serverError}
          </div>
        )}

        <div style={{ padding: "14px", backgroundColor: "var(--color-operational-subtle)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-operational)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--text-primary)" }}>
            <Sparkles size={18} /> Criar com ajuda da IA
          </div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Explique o resultado desejado em linguagem simples. Você poderá revisar tudo antes de salvar e enviar à Meta.
          </span>
          <textarea rows={2} value={aiObjective} onChange={(e) => setAiObjective(e.target.value)} placeholder="Ex.: Quero lembrar clientes que abandonaram o orçamento e convidá-los a retomar a conversa." style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", font: "inherit", resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px" }}>
            <Input label="Para quem?" value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} placeholder="Ex.: clientes com orçamento parado" />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>Tom da mensagem</label>
              <SegmentedControl value={aiTone} onChange={(value) => setAiTone(value as typeof aiTone)} options={[{ value: "FRIENDLY", label: "Próximo" }, { value: "PROFESSIONAL", label: "Profissional" }, { value: "DIRECT", label: "Direto" }]} />
            </div>
          </div>
          <div><Button type="button" size="sm" variant="primary" prefixIcon={<Sparkles size={14} />} loading={isGenerating} onClick={handleGenerateWithAi}>Gerar sugestão</Button></div>
          {aiExplanation && (
            <div style={{ padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Por que a IA sugeriu isso:</strong> {aiExplanation}
              {variableLabels.length > 0 && <div style={{ marginTop: "6px" }}><strong>Variáveis:</strong> {variableLabels.map((label, index) => `{{${index + 1}}} = ${label}`).join(" · ")}</div>}
            </div>
          )}
        </div>

        {/* Quick WABA Presets */}
        <div
          style={{
            padding: "10px 12px",
            backgroundColor: "var(--bg-canvas)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Ou comece com um exemplo pronto:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {WABA_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                size="xs"
                variant="secondary"
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 300px)", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
            <Input
              label="Identificador do Modelo (slug)"
              placeholder="ex: confirmacao_proposta_v1"
              value={formName}
              onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              error={formErrors.name}
              helperText="Apenas letras minúsculas e _"
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
                Categoria Meta
              </label>
              <SegmentedControl
                value={formCategory}
                onChange={(val) => setFormCategory(val as "UTILITY" | "MARKETING")}
                options={[
                  { value: "UTILITY", label: "Utilidade (Transacional)" },
                  { value: "MARKETING", label: "Marketing (Promocional)" },
                ]}
              />
            </div>

            <Input
              label="Cabeçalho (Opcional)"
              placeholder="ex: Proposta Comercial Liberada"
              value={formHeader}
              onChange={(e) => setFormHeader(e.target.value)}
              error={formErrors.headerText}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
                Corpo da Mensagem (com variáveis {"{{1}}"}, {"{{2}}"})
              </label>
              <textarea
                rows={4}
                placeholder="Olá {{1}}, sua proposta para {{2}} está pronta..."
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: formErrors.bodyText ? "1px solid var(--color-danger)" : "1px solid var(--border-default)",
                  fontSize: "var(--font-size-sm)",
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              {formErrors.bodyText && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
                  {formErrors.bodyText}
                </span>
              )}
            </div>

            <Input
              label="Rodapé (Opcional)"
              placeholder="ex: Responda SAIR para cancelar"
              value={formFooter}
              onChange={(e) => setFormFooter(e.target.value)}
              error={formErrors.footerText}
            />

            <Input
              label="Botão de Ação Rápida (Opcional)"
              placeholder="ex: Ver Proposta"
              value={formButton}
              onChange={(e) => setFormButton(e.target.value)}
              error={formErrors.buttonText}
            />
          </div>

          {/* Live WhatsApp Bubble Preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Pré-visualização WhatsApp
            </span>
            <div
              style={{
                backgroundColor: "var(--bg-canvas)",
                padding: "16px",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  padding: "12px 14px",
                  borderRadius: "10px 0 10px 10px",
                  boxShadow: "var(--shadow-sm)",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  fontSize: "var(--font-size-sm)",
                  boxSizing: "border-box",
                }}
              >
                {formHeader && (
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.85rem", overflowWrap: "anywhere" }}>
                    {formHeader}
                  </div>
                )}
                <div style={{ color: "var(--text-primary)", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                  {formBody ? renderWhatsappMarkdown(formBody) : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Corpo do modelo aparecerá aqui...</span>}
                </div>
                {formFooter && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                    {formFooter}
                  </div>
                )}
                {formButton && (
                  <div
                    style={{
                      marginTop: "8px",
                      paddingTop: "8px",
                      borderTop: "1px solid var(--border-subtle)",
                      textAlign: "center",
                      color: "var(--color-operational)",
                      fontWeight: 600,
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    {formButton}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
          <Button size="sm" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={isSubmitting}>
            Salvar Modelo
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
