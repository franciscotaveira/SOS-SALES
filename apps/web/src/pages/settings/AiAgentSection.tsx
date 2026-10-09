import { useState, useEffect, type FC } from "react";
import { Button, Input } from "@sos-sales/ui";
import { Bot, Sparkles, CheckCircle2, Zap, ShoppingBag, QrCode, Calendar, BarChart3, Save } from "lucide-react";
import { apiClient, type AiAgentConfig } from "../../services/api-client";

interface AiAgentSectionProps {
  workspaceId?: string;
  token?: string;
}

export const AiAgentSection: FC<AiAgentSectionProps> = ({ workspaceId, token }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState("Assistente Virtual");
  const [personality, setPersonality] = useState<AiAgentConfig["personality"]>("cordial_comercial");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [skills, setSkills] = useState<{
    qualify_lead: boolean;
    catalog_offers: boolean;
    pix_charges: boolean;
    appointments: boolean;
    capi_tracking: boolean;
  }>({
    qualify_lead: true,
    catalog_offers: true,
    pix_charges: true,
    appointments: true,
    capi_tracking: true,
  });

  useEffect(() => {
    if (!workspaceId || !token) return;
    setLoading(true);
    setErrorMsg(null);
    apiClient
      .getAiAgentConfig(workspaceId, { token })
      .then((res) => {
        if (res.config) {
          setEnabled(res.config.enabled);
          setName(res.config.name || "Assistente Virtual");
          setPersonality(res.config.personality || "cordial_comercial");
          setSystemPrompt(res.config.systemPrompt || "");
          setSkills({
            qualify_lead: res.config.skills.qualify_lead ?? true,
            catalog_offers: res.config.skills.catalog_offers ?? true,
            pix_charges: res.config.skills.pix_charges ?? true,
            appointments: res.config.skills.appointments ?? true,
            capi_tracking: res.config.skills.capi_tracking ?? true,
          });
        }
      })
      .catch((err: unknown) => {
        setErrorMsg((err as Error).message || "Falha ao carregar configurações da IA.");
      })
      .finally(() => setLoading(false));
  }, [workspaceId, token]);

  const handleToggleSkill = (skillKey: keyof typeof skills) => {
    setSkills((prev) => ({
      ...prev,
      [skillKey]: !prev[skillKey],
    }));
  };

  const handleSave = async () => {
    if (!workspaceId || !token) return;
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      await apiClient.updateAiAgentConfig(
        workspaceId,
        {
          enabled,
          name: name.trim(),
          personality,
          systemPrompt: systemPrompt.trim(),
          skills,
        },
        { token }
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Falha ao salvar configurações da IA.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
        Carregando parâmetros do atendente virtual...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" }}>
      {/* Header card with toggle */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              backgroundColor: enabled ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
              color: enabled ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={26} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-size-base, 1rem)", fontWeight: 600 }}>
              Atendimento Inteligente no WhatsApp
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              {enabled
                ? "A IA responde e qualifica leads automaticamente nas conversas sem intervenção humana."
                : "Atendimento IA desativado. As conversas permanecem sob controle manual dos atendentes."}
            </p>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)" }}>
          <span>{enabled ? "Ativo" : "Inativo"}</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
          />
        </label>
      </div>

      {errorMsg && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--color-danger-subtle, rgba(239, 68, 68, 0.1))",
            color: "var(--color-danger, #ef4444)",
            borderRadius: "var(--radius-md, 8px)",
            fontSize: "var(--font-size-sm, 0.875rem)",
          }}
        >
          {errorMsg}
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--color-success-subtle, rgba(16, 185, 129, 0.1))",
            color: "var(--color-success, #10b981)",
            borderRadius: "var(--radius-md, 8px)",
            fontSize: "var(--font-size-sm, 0.875rem)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} /> Configurações da IA de Atendimento salvas com sucesso!
        </div>
      )}

      {/* Persona settings */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={16} color="var(--color-action, #059669)" /> Identidade & Tom de Voz
        </h4>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Input
            label="Nome da Atendente Virtual"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Sofia - Haven Escovaria"
            helperText="Nome apresentado aos leads durante o atendimento."
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
              Arquétipo de Comunicação
            </label>
            <select
              value={personality}
              onChange={(e) => setPersonality(e.target.value as AiAgentConfig["personality"])}
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
              }}
            >
              <option value="cordial_comercial">Cordial & Comercial (Recomendado para Vendas)</option>
              <option value="direto_objetivo">Direto & Objetivo (Rápido e focado em respostas curtas)</option>
              <option value="especialista_consultivo">Especialista & Consultivo (Focado em tirar dúvidas técnicas)</option>
              <option value="empatico_acolhedor">Empático & Acolhedor (Foco em beleza, saúde e estética)</option>
            </select>
          </div>
        </div>

        {/* Prompt */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Instruções Gerais do Agente (System Prompt)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder="Ex.: Você é a assistente de vendas da empresa. Atenda os clientes com carinho e agilidade, apresente nossos pacotes de escova e tratamentos, tire dúvidas de preços e convide para agendar um horário..."
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", textAlign: "right" }}>
            {systemPrompt.length} / 5000 caracteres
          </div>
        </div>
      </div>

      {/* Commercial Skills toggles */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <Zap size={16} color="var(--color-primary, #10b981)" /> Habilidades Comerciais (Skills)
        </h4>
        <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
          Defina quais capacidades autônomas estão liberadas para a IA executar durante as conversas no WhatsApp:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {/* Skill 1: Qualify lead */}
          <div
            onClick={() => handleToggleSkill("qualify_lead")}
            style={{
              padding: "12px 14px",
              backgroundColor: skills.qualify_lead ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.qualify_lead ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Zap size={20} color={skills.qualify_lead ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Evolução Automática do Funil</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Avança o contato de &quot;Lead&quot; para &quot;Qualificado&quot; assim que responder no WhatsApp.
                </p>
              </div>
            </div>
            <input type="checkbox" checked={skills.qualify_lead} readOnly style={{ pointerEvents: "none", accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 2: Catalog offers */}
          <div
            onClick={() => handleToggleSkill("catalog_offers")}
            style={{
              padding: "12px 14px",
              backgroundColor: skills.catalog_offers ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.catalog_offers ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <ShoppingBag size={20} color={skills.catalog_offers ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Oferta de Itens do Catálogo</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Apresenta produtos e serviços com valores, fotos e descrições conforme a necessidade do lead.
                </p>
              </div>
            </div>
            <input type="checkbox" checked={skills.catalog_offers} readOnly style={{ pointerEvents: "none", accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 3: Pix charges */}
          <div
            onClick={() => handleToggleSkill("pix_charges")}
            style={{
              padding: "12px 14px",
              backgroundColor: skills.pix_charges ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.pix_charges ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <QrCode size={20} color={skills.pix_charges ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Emissão e Cobrança Pix</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Gera payload Pix BACEN Copia e Cola para reserva ou pagamento imediato no WhatsApp.
                </p>
              </div>
            </div>
            <input type="checkbox" checked={skills.pix_charges} readOnly style={{ pointerEvents: "none", accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 4: Appointments */}
          <div
            onClick={() => handleToggleSkill("appointments")}
            style={{
              padding: "12px 14px",
              backgroundColor: skills.appointments ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.appointments ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Calendar size={20} color={skills.appointments ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Agendamento de Horários</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Identifica dia e horário solicitado pelo lead e avança a oportunidade para a etapa &quot;Agendado&quot;.
                </p>
              </div>
            </div>
            <input type="checkbox" checked={skills.appointments} readOnly style={{ pointerEvents: "none", accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 5: Meta CAPI */}
          <div
            onClick={() => handleToggleSkill("capi_tracking")}
            style={{
              padding: "12px 14px",
              backgroundColor: skills.capi_tracking ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.capi_tracking ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <BarChart3 size={20} color={skills.capi_tracking ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Telemetria Meta Conversions API (CAPI)</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Envia evento PurchaseCompleted para otimizar os anúncios do Gerenciador de Anúncios da Meta.
                </p>
              </div>
            </div>
            <input type="checkbox" checked={skills.capi_tracking} readOnly style={{ pointerEvents: "none", accentColor: "var(--color-primary, #10b981)" }} />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="md"
          variant="primary"
          prefixIcon={<Save size={16} />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Salvando alterações..." : "Salvar Configurações da IA"}
        </Button>
      </div>
    </div>
  );
};
