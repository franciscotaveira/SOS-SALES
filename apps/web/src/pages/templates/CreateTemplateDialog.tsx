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
  const [aiStrategy, setAiStrategy] = useState<"UTILITY_TROJAN" | "DIRECT_MARKETING">("UTILITY_TROJAN");
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
    setAiStrategy("UTILITY_TROJAN");
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
        {
          objective: aiObjective.trim(),
          audience: aiAudience.trim(),
          tone: aiTone,
          strategy: aiStrategy,
        },
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
      id: "trojan-schedule",
      label: "⚡ Encaixe Prioritário (Utility -85%)",
      name: "confirmacao_horario_prioritario_v1",
      category: "UTILITY" as const,
      header: "Reserva de Atendimento",
      body: "Olá {{1}}! Identificamos uma vaga prioritária para seu atendimento de {{2}} nesta semana. Podemos confirmar seu horário preferencial?",
      footer: "SOS Sales • Confirmação",
      button: "Confirmar Horário",
    },
    {
      id: "trojan-loyalty",
      label: "⚡ Crédito Pendente (Utility -85%)",
      name: "notificacao_credito_pendente_v1",
      category: "UTILITY" as const,
      header: "Atualização de Cadastro",
      body: "Olá {{1}}, consta em seu cadastro um benefício/crédito ativo referente a {{2}}. Deseja consultar as opções disponíveis para utilização?",
      footer: "Atendimento ao Cliente",
      button: "Consultar Benefício",
    },
    {
      id: "trojan-proposal",
      label: "⚡ Atualização de Proposta (Utility -85%)",
      name: "atualizacao_proposta_v1",
      category: "UTILITY" as const,
      header: "Atualização de Atendimento",
      body: "Olá {{1}}, seu protocolo de proposta para {{2}} foi atualizado com condições prioritárias. Podemos apresentar os detalhes agora?",
      footer: "Equipe de Atendimento",
      button: "Ver Proposta",
    },
    {
      id: "pix",
      label: "⚡ Cobrança Pix (Utility)",
      name: "cobranca_pix_instantaneo_v1",
      category: "UTILITY" as const,
      header: "Pagamento do Pedido",
      body: "Olá {{1}}, segue o link/chave Pix no valor de {{2}} referente ao seu pedido {{3}}. Por favor, efetue o pagamento para confirmação imediata.",
      footer: "Chat Sales Oficial",
      button: "Copiar Chave Pix",
    },
    {
      id: "catalog",
      label: "⭐ Oferta Catálogo (Marketing)",
      name: "oferta_catalogo_produto_v1",
      category: "MARKETING" as const,
      header: "Novidade Exclusiva",
      body: "Olá {{1}}, separamos esta condição especial do produto {{2}} por apenas {{3}}. O que acha de aproveitarmos agora?",
      footer: "Oferta por tempo limitado",
      button: "Ver Detalhes",
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--text-primary)" }}>
              <Sparkles size={18} /> Criar com Inteligência Artificial
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: aiStrategy === "UTILITY_TROJAN" ? "#10b981" : "var(--text-muted)" }}>
              {aiStrategy === "UTILITY_TROJAN" ? "⚡ Custo Mínimo (~R$ 0,04) + 24h Grátis" : "⭐ Marketing Direto (~R$ 0,40)"}
            </span>
          </div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Explique o objetivo da mensagem em linguagem simples. A IA formula o texto e os botões seguindo os padrões da Meta.
          </span>
          <textarea rows={2} value={aiObjective} onChange={(e) => setAiObjective(e.target.value)} placeholder="Ex.: Quero reativar clientes que pararam de responder sobre o orçamento de procedimentos estéticos." style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", font: "inherit", resize: "vertical" }} />
          
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px" }}>
            <Input label="Para quem?" value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} placeholder="Ex.: clientes com orçamento parado" />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>Tom da mensagem</label>
              <SegmentedControl value={aiTone} onChange={(value) => setAiTone(value as typeof aiTone)} options={[{ value: "FRIENDLY", label: "Próximo" }, { value: "PROFESSIONAL", label: "Profissional" }, { value: "DIRECT", label: "Direto" }]} />
            </div>
          </div>

          {/* Seletor Estratégico de Redução de Custo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Estratégia de Custo Meta
            </label>
            <SegmentedControl
              value={aiStrategy}
              onChange={(value) => setAiStrategy(value as typeof aiStrategy)}
              options={[
                { value: "UTILITY_TROJAN", label: "⚡ Cavalo de Troia (Paga como Utilidade ~R$ 0,04)" },
                { value: "DIRECT_MARKETING", label: "⭐ Campanha Promocional Direta (~R$ 0,40)" },
              ]}
            />
          </div>

          {aiStrategy === "UTILITY_TROJAN" && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                color: "var(--text-secondary)",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "14px" }}>💡</span>
              <span>
                <strong>Cavalo de Troia da Utilidade:</strong> A IA constrói a mensagem com enquadramento operacional/transacional para a Meta aprovar como <strong>Utilidade (~R$ 0,04)</strong>. Quando o cliente clica no botão, destrava uma <strong>Janela de 24h Gratuita</strong> onde a IA faz a venda sem custos adicionais!
              </span>
            </div>
          )}

          <div><Button type="button" size="sm" variant="primary" prefixIcon={<Sparkles size={14} />} loading={isGenerating} onClick={handleGenerateWithAi}>Gerar Modelo Estratégico</Button></div>
          {aiExplanation && (
            <div style={{ padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Estratégia aplicada pela IA:</strong> {aiExplanation}
              {variableLabels.length > 0 && <div style={{ marginTop: "6px" }}><strong>Variáveis sugeridas:</strong> {variableLabels.map((label, index) => `{{${index + 1}}} = ${label}`).join(" · ")}</div>}
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
