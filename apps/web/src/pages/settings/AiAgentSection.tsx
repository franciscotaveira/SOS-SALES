import { useState, useEffect, type FC } from "react";
import { Button, Input } from "@sos-sales/ui";
import {
  Bot,
  Sparkles,
  CheckCircle2,
  Zap,
  ShoppingBag,
  QrCode,
  Calendar,
  BarChart3,
  Save,
  ShieldCheck,
  HelpCircle,
  Plus,
  Trash2,
  Clock,
  MapPin,
  CreditCard,
  AlertTriangle,
  Cpu,
  Play,
  Key,
  Terminal,
  Loader2,
} from "lucide-react";
import {
  apiClient,
  type AiAgentConfig,
  type AiBusinessRules,
  type AiFaqItem,
  type AiSimulationResult,
} from "../../services/api-client";

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
  const [strictMode, setStrictMode] = useState(true);
  const [temperature, setTemperature] = useState(0.1);

  // Multi-Provider & Model State
  const [provider, setProvider] = useState<"nvidia" | "openrouter">("nvidia");
  const [model, setModel] = useState("meta/llama-3.3-70b-instruct");
  const [apiKey, setApiKey] = useState("");
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);

  // Simulation Playground State
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<AiSimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const [businessRules, setBusinessRules] = useState<AiBusinessRules>({
    openingHours: "",
    address: "",
    cancellationPolicy: "",
    paymentMethods: "",
    generalRules: "",
  });

  const [faq, setFaq] = useState<AiFaqItem[]>([]);

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
          setStrictMode(res.config.strictMode ?? true);
          setTemperature(res.config.temperature !== undefined ? Number(res.config.temperature) : 0.1);
          setProvider(res.config.provider || "nvidia");
          setModel(
            res.config.model ||
              (res.config.provider === "openrouter"
                ? "anthropic/claude-3.5-sonnet"
                : "meta/llama-3.3-70b-instruct")
          );
          setHasCustomApiKey(Boolean(res.config.hasCustomApiKey));
          setApiKey("");
          setBusinessRules({
            openingHours: res.config.businessRules?.openingHours || "",
            address: res.config.businessRules?.address || "",
            cancellationPolicy: res.config.businessRules?.cancellationPolicy || "",
            paymentMethods: res.config.businessRules?.paymentMethods || "",
            generalRules: res.config.businessRules?.generalRules || "",
          });
          setFaq(Array.isArray(res.config.faq) ? res.config.faq : []);
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

  const handleUpdateBusinessRule = (field: keyof AiBusinessRules, value: string) => {
    setBusinessRules((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddFaq = () => {
    setFaq((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        question: "",
        answer: "",
      },
    ]);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    setFaq((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (current) {
        copy[index] = {
          ...current,
          [field]: value,
        };
      }
      return copy;
    });
  };

  const handleRemoveFaq = (index: number) => {
    setFaq((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectProvider = (newProvider: "nvidia" | "openrouter") => {
    setProvider(newProvider);
    if (newProvider === "nvidia") {
      setModel("meta/llama-3.3-70b-instruct");
    } else {
      setModel("anthropic/claude-3.5-sonnet");
    }
  };

  const handleSimulate = async (customMessage?: string) => {
    const textToSimulate = (customMessage !== undefined ? customMessage : simInput).trim();
    if (!workspaceId || !token || !textToSimulate) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await apiClient.simulateAiAgent(
        workspaceId,
        {
          message: textToSimulate,
        },
        { token }
      );
      setSimResult(res);
      if (customMessage !== undefined) {
        setSimInput(customMessage);
      }
    } catch (err: unknown) {
      setSimError((err as Error).message || "Falha ao simular atendimento.");
    } finally {
      setSimLoading(false);
    }
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
          provider,
          model,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          skills,
          businessRules,
          faq: faq.filter((item) => item.question.trim() || item.answer.trim()),
          strictMode,
          temperature,
        },
        { token }
      );
      if (apiKey.trim()) {
        setHasCustomApiKey(true);
        setApiKey("");
      }
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
          <CheckCircle2 size={16} /> Configurações e base de conhecimento da IA salvas com sucesso!
        </div>
      )}

      {/* AI ENGINE & PROVIDER SELECTION */}
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
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
              color: "var(--color-primary, #10b981)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cpu size={22} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Motor de Inteligência Artificial & Provedor LLM
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Escolha entre a infraestrutura corporativa de inferência acelerada da <strong>NVIDIA NIM</strong> (padrão soberano) ou o catálogo multi-modelos da <strong>OpenRouter</strong>.
            </p>
          </div>
        </div>

        {/* Provider Selector Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {/* Option 1: Nvidia NIM */}
          <div
            onClick={() => handleSelectProvider("nvidia")}
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              border: provider === "nvidia" ? "2px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              backgroundColor: provider === "nvidia" ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))" : "var(--bg-canvas)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={18} color="var(--color-primary, #10b981)" />
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>NVIDIA NIM</strong>
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.2))",
                  color: "var(--color-primary, #10b981)",
                  fontWeight: 700,
                }}
              >
                Padrão Ativo
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Inferência ultra-rápida em GPUs corporativas NVIDIA. Otimizada para respostas em milissegundos com baixo custo operacional.
            </p>
          </div>

          {/* Option 2: OpenRouter */}
          <div
            onClick={() => handleSelectProvider("openrouter")}
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              border: provider === "openrouter" ? "2px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              backgroundColor: provider === "openrouter" ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))" : "var(--bg-canvas)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Cpu size={18} color="var(--color-action, #3b82f6)" />
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>OpenRouter</strong>
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.15))",
                  color: "var(--color-action, #3b82f6)",
                  fontWeight: 700,
                }}
              >
                Multi-Modelos
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Amplo catálogo de modelos incluindo Claude 3.5 Sonnet, Gemini 2.5 Flash e DeepSeek. Requer chave própria da OpenRouter.
            </p>
          </div>
        </div>

        {/* Model Selection */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
          <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-primary)" }}>
            Modelo Neuronal Selecionado ({provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"}):
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
            {(provider === "nvidia"
              ? [
                  { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", badge: "Recomendado" },
                  { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B Instruct", badge: "Factual" },
                  { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B Instruct", badge: "Ultraleve" },
                ]
              : [
                  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", badge: "Alta Precisão" },
                  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", badge: "Ultra Rápido" },
                  { id: "deepseek/deepseek-chat", label: "DeepSeek V3 / R1", badge: "Custo-Benefício" },
                  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", badge: "Open Source" },
                ]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: model === m.id ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                  backgroundColor: model === m.id ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
                  color: model === m.id ? "var(--color-primary, #10b981)" : "var(--text-primary)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: model === m.id ? 600 : 400,
                }}
              >
                <span>{m.label}</span>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    backgroundColor: model === m.id ? "var(--color-primary, #10b981)" : "var(--border-default)",
                    color: model === m.id ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {m.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* API Key Input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Key size={14} /> Chave de API ({provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"}):
            </label>
            {hasCustomApiKey && (
              <span style={{ fontSize: "0.7rem", color: "var(--color-primary, #10b981)", fontWeight: 600 }}>
                ✓ Chave personalizada ativa no workspace
              </span>
            )}
          </div>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasCustomApiKey
                ? "•••••••••••••••• (Substituir chave salva)"
                : provider === "nvidia"
                ? "Opcional: usando chave padrão do servidor (NVIDIA_API_KEY)"
                : "Insira sua chave sk-or-v1-... da OpenRouter"
            }
          />
          <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.7rem)", color: "var(--text-secondary)" }}>
            {provider === "nvidia"
              ? "Deixe em branco para usar o endpoint corporativo nativo do SOS Sales, ou informe sua chave própria para bilhetagem direta."
              : "Obtenha sua chave em openrouter.ai/keys. A chave é encriptada e isolada por tenant no banco de dados."}
          </p>
        </div>
      </div>

      {/* ANTI-HALLUCINATION & ASSURANCE SECTION */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: strictMode ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: strictMode ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
                color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                  Blindagem Anti-Alucinação (Protocolo de Ignorância & Grounding)
                </h4>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: strictMode ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.15))" : "var(--bg-canvas)",
                    color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {strictMode ? "Proteção Ativa" : "Modo Livre"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Impede que a IA invente preços, promoções ou informações que não existam no Catálogo ou nas Regras Oficiais.
              </p>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)" }}>
            <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)" }}>
              {strictMode ? "Modo Estrito Ligado" : "Desativado"}
            </span>
            <input
              type="checkbox"
              checked={strictMode}
              onChange={(e) => setStrictMode(e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
            />
          </label>
        </div>

        <div
          style={{
            padding: "12px 14px",
            backgroundColor: "var(--bg-canvas)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            fontSize: "var(--font-size-xs, 0.75rem)",
            lineHeight: 1.5,
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", color: "var(--text-primary)" }}>
            <AlertTriangle size={15} style={{ color: "var(--color-action, #f59e0b)", flexShrink: 0, marginTop: "2px" }} />
            <span>
              <strong>Como a IA se torna especialista sem alucinar:</strong> A IA recebe 3 fontes de verdade: (1) O <em>Catálogo em tempo real</em> com itens e preços oficiais; (2) As <em>Políticas Fatuais</em> da empresa (endereço, horário, cancelamento); (3) O <em>FAQ Oficial</em>. Se um lead perguntar algo ausente dessas 3 fontes, a IA <strong>obrigatoriamente</strong> diz que vai confirmar com a equipe e solicita apoio humano, sem adivinhar.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "4px", paddingTop: "8px", borderTop: "1px solid var(--border-default)" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>Temperatura de Amostragem do Modelo:</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { label: "0.1 (Factual & Estrito - Recomendado)", val: 0.1 },
                { label: "0.3 (Equilibrado)", val: 0.3 },
                { label: "0.7 (Criativo)", val: 0.7 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setTemperature(opt.val)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: temperature === opt.val ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                    backgroundColor: temperature === opt.val ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-surface)",
                    color: temperature === opt.val ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    fontWeight: temperature === opt.val ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CATALOG GROUNDING INFO */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.1))",
              color: "var(--color-action, #3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShoppingBag size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Catálogo de Produtos & Serviços Integrado
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              A IA carrega dinamicamente todos os produtos ativos cadastrados no seu Catálogo. Ela nunca inventa valores ou durações.
            </p>
          </div>
        </div>
        <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--color-action, #3b82f6)", fontWeight: 600 }}>
          Sincronização Ativa
        </span>
      </div>

      {/* BUSINESS RULES (FACTUAL KNOWLEDGE) */}
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
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Clock size={18} color="var(--color-primary, #10b981)" />
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Regras e Políticas Fatuais do Negócio
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Informações fixas sobre a operação que a IA usará como verdade absoluta para tirar dúvidas dos clientes.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Clock size={14} /> Horário de Funcionamento
            </label>
            <input
              type="text"
              value={businessRules.openingHours || ""}
              onChange={(e) => handleUpdateBusinessRule("openingHours", e.target.value)}
              placeholder="Ex.: Segunda a Sexta das 08h às 19h. Sábado das 08h às 17h."
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
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <MapPin size={14} /> Endereço e Localização
            </label>
            <input
              type="text"
              value={businessRules.address || ""}
              onChange={(e) => handleUpdateBusinessRule("address", e.target.value)}
              placeholder="Ex.: Rua das Palmeiras, 150, Centro - Em frente à Praça Coronel."
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
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <CreditCard size={14} /> Formas de Pagamento Aceitas
            </label>
            <input
              type="text"
              value={businessRules.paymentMethods || ""}
              onChange={(e) => handleUpdateBusinessRule("paymentMethods", e.target.value)}
              placeholder="Ex.: Pix à vista, Cartão de Crédito em até 3x sem juros, Dinheiro."
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
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <AlertTriangle size={14} /> Política de Cancelamentos & Atrasos
            </label>
            <input
              type="text"
              value={businessRules.cancellationPolicy || ""}
              onChange={(e) => handleUpdateBusinessRule("cancellationPolicy", e.target.value)}
              placeholder="Ex.: Tolerância de até 15 min de atraso. Reagendamento com 2h de antecedência."
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
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Regras Operacionais Extras & Condições Especiais
          </label>
          <textarea
            value={businessRules.generalRules || ""}
            onChange={(e) => handleUpdateBusinessRule("generalRules", e.target.value)}
            rows={3}
            placeholder="Ex.: Temos estacionamento conveniado gratuito na esquina. Para procedimentos químicos solicitamos teste de mecha prévio. Não atendemos aos domingos e feriados."
            style={{
              width: "100%",
              padding: "8px 12px",
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
        </div>
      </div>

      {/* FAQ & OBJECTIONS (KNOWLEDGE BASE) */}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <HelpCircle size={18} color="var(--color-primary, #10b981)" />
            <div>
              <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                FAQ Oficial & Tratamento de Objeções
              </h4>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Cadastre respostas homologadas para dúvidas recorrentes. A IA utilizará essas respostas com fidelidade total.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            prefixIcon={<Plus size={14} />}
            onClick={handleAddFaq}
          >
            Adicionar Pergunta
          </Button>
        </div>

        {faq.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              backgroundColor: "var(--bg-canvas)",
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              color: "var(--text-secondary)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <HelpCircle size={24} style={{ opacity: 0.5 }} />
            <div>
              <strong>Nenhuma dúvida ou FAQ personalizado cadastrado ainda.</strong>
              <p style={{ margin: "4px 0 0 0" }}>
                Clique em &quot;Adicionar Pergunta&quot; para cadastrar respostas oficiais (ex.: durabilidade de serviços, cuidados prévios, garantias).
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {faq.map((item, index) => (
              <div
                key={item.id || index}
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--color-primary, #10b981)" }}>
                    FAQ #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFaq(index)}
                    title="Excluir pergunta"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--color-danger, #ef4444)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <input
                  type="text"
                  value={item.question}
                  onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                  placeholder="Pergunta ou Dúvida (ex.: Quanto tempo dura a escova progressiva?)"
                  style={{
                    width: "100%",
                    height: "34px",
                    padding: "0 10px",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />

                <textarea
                  value={item.answer}
                  onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                  rows={2}
                  placeholder="Resposta Oficial da Empresa (ex.: Nossa progressiva é livre de formol e dura em média de 3 a 5 meses dependendo do tipo de fio e cuidados diários com shampoo sem sulfato.)"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-primary)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontFamily: "inherit",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

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
            Instruções Gerais de Contexto (System Prompt)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
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

      {/* DRY-RUN SIMULATOR PLAYGROUND */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1.5px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
                color: "var(--color-primary, #10b981)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Terminal size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                  Simulador de Atendimento (Playground Dry-Run)
                </h4>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.15))",
                    color: "var(--color-action, #3b82f6)",
                    fontWeight: 700,
                  }}
                >
                  Teste em Tempo Real
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Envie perguntas de teste para validar como a IA responde usando os produtos e regras reais salvas, conferindo latência e acionamento de transbordo.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Question Chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "var(--font-size-xs, 0.7rem)", color: "var(--text-secondary)", fontWeight: 600 }}>
            Testes Rápidos Sugeridos:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[
              { label: "💰 Consulta de Valores", text: "Olá! Quais são os produtos e valores disponíveis?" },
              { label: "⏰ Horário & Regras", text: "Qual o horário de atendimento e formas de pagamento?" },
              { label: "🛡️ Teste de Ignorância", text: "Vocês aceitam permuta por um carro ou fazem fiado?" },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSimulate(chip.text)}
                disabled={simLoading}
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--bg-canvas)",
                  color: "var(--text-primary)",
                  cursor: simLoading ? "not-allowed" : "pointer",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input and Trigger */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="text"
            value={simInput}
            onChange={(e) => setSimInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !simLoading && simInput.trim()) {
                e.preventDefault();
                handleSimulate();
              }
            }}
            placeholder="Digite a mensagem simulada do cliente..."
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text-primary)",
              fontSize: "var(--font-size-sm, 0.875rem)",
              outline: "none",
            }}
          />
          <Button
            size="md"
            variant="secondary"
            onClick={() => handleSimulate()}
            disabled={simLoading || !simInput.trim()}
            prefixIcon={simLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          >
            {simLoading ? "Executando..." : "Testar Resposta"}
          </Button>
        </div>

        {simError && (
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle, rgba(239, 68, 68, 0.1))",
              color: "var(--color-danger, #ef4444)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
            }}
          >
            {simError}
          </div>
        )}

        {/* Result Preview Box */}
        {simResult && (
          <div
            style={{
              marginTop: "8px",
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Telemetry Bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                alignItems: "center",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--border-default)",
                fontSize: "var(--font-size-xs, 0.75rem)",
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  fontWeight: 600,
                }}
              >
                ⚡ Latência: <strong>{simResult.latencyMs}ms</strong>
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                🧠 Motor: <strong>{simResult.provider}</strong> ({simResult.model})
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                📦 Produtos Grounding: <strong>{simResult.matchedCatalogCount} itens</strong>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  backgroundColor: simResult.needsHandoff
                    ? "var(--color-danger-subtle, rgba(239, 68, 68, 0.15))"
                    : "var(--color-success-subtle, rgba(16, 185, 129, 0.15))",
                  color: simResult.needsHandoff ? "var(--color-danger, #ef4444)" : "var(--color-success, #10b981)",
                }}
              >
                {simResult.needsHandoff ? "⚠️ Transbordo Acionado" : "✅ Factual Aprovado"}
              </span>
            </div>

            {/* Chat Simulation Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* User Bubble */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: "12px 12px 2px 12px",
                    backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.2))",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-xs, 0.8rem)",
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, opacity: 0.7, marginBottom: "2px" }}>
                    CLIENTE (SIMULADO)
                  </div>
                  {simInput}
                </div>
              </div>

              {/* AI Bubble */}
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 16px",
                    borderRadius: "12px 12px 12px 2px",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-xs, 0.8rem)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Bot size={14} color="var(--color-primary, #10b981)" />
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-primary, #10b981)" }}>
                      {name || "Assistente Virtual"}
                    </span>
                  </div>
                  {simResult.replyText}
                </div>
              </div>
            </div>

            {/* Handoff Notice if triggered */}
            {simResult.needsHandoff && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#d97706" }}>
                  <AlertTriangle size={15} /> Protocolo de Ignorância Ativado (Transbordo Humano Seguro)
                </div>
                <span>
                  A IA se recusou a inventar dados e solicitou intervenção humana. Motivo registrado:
                </span>
                <code
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.7rem",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {simResult.handoffReason || "Dúvida não encontrada na base factual de catálogo e regras"}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", position: "sticky", bottom: "16px", zIndex: 10 }}>
        <Button
          size="md"
          variant="primary"
          prefixIcon={<Save size={16} />}
          onClick={handleSave}
          disabled={saving}
          style={{ boxShadow: "var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1))" }}
        >
          {saving ? "Salvando alterações..." : "Salvar Configurações da IA"}
        </Button>
      </div>
    </div>
  );
};
