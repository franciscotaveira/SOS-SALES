import { useState, useEffect, useMemo, type FC, type FormEvent } from "react";
import {
  Dialog,
  Button,
  Input,
  Badge,
  Alert,
  SegmentedControl,
  LoadingState,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Send,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  apiClient,
  type MessageTemplateSummary,
  type ChannelSummary,
} from "../../services/api-client";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";

interface BroadcastTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  initialTemplate?: MessageTemplateSummary | null;
  onBroadcastSuccess?: () => void;
}

export const BroadcastTemplateDialog: FC<BroadcastTemplateDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  initialTemplate,
  onBroadcastSuccess,
}) => {
  const { isMobile } = useBreakpoint();

  const [isLoadingPreflight, setIsLoadingPreflight] = useState(true);
  const [channels, setChannels] = useState<Array<ChannelSummary & { isBlockedForBroadcast: boolean }>>([]);
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [totalActiveContacts, setTotalActiveContacts] = useState(0);

  // Campaign Configuration
  const [campaignName, setCampaignName] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [isAbTest, setIsAbTest] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTemplateBId, setSelectedTemplateBId] = useState("");
  const [audienceType, setAudienceType] = useState<"ALL_CONTACTS" | "BY_STAGE" | "MANUAL">("ALL_CONTACTS");
  const [stage, setStage] = useState("LEAD");
  const [manualPhones, setManualPhones] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variablesB, setVariablesB] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    batchId: string;
    enqueuedCount: number;
    totalTargeted: number;
    templateName: string;
    isAbTest: boolean;
  } | null>(null);

  // Load preflight data on open
  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;

    let isMounted = true;
    setIsLoadingPreflight(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    apiClient
      .getBroadcastPreflight(workspaceId, { token })
      .then((res) => {
        if (!isMounted) return;
        setChannels(res.channels || []);
        setTemplates(res.templates || []);
        setTotalActiveContacts(res.totalActiveContacts || 0);

        // Pre-select channel: prioritize ready meta_waba or connected channel
        const readyChannel =
          res.channels.find((ch) => ch.provider === "meta_waba" && ch.metaBillingConfigured && ch.status === "connected") ||
          res.channels.find((ch) => ch.status === "connected") ||
          res.channels[0];

        if (readyChannel) {
          setSelectedChannelId(readyChannel.id);
        }

        // Pre-select template A
        if (initialTemplate) {
          setSelectedTemplateId(initialTemplate.id);
        } else if (res.templates && res.templates.length > 0 && res.templates[0]) {
          setSelectedTemplateId(res.templates[0].id);
        }

        // Pre-select template B (prioritize a second template if available)
        if (res.templates && res.templates.length > 1 && res.templates[1]) {
          setSelectedTemplateBId(res.templates[1].id);
        } else if (res.templates && res.templates.length > 0 && res.templates[0]) {
          setSelectedTemplateBId(res.templates[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Falha ao carregar canais e modelos para disparo."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreflight(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceId, token, initialTemplate]);

  // Selected Channel Object
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId),
    [channels, selectedChannelId]
  );

  // Selected Template A Object
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || initialTemplate,
    [templates, selectedTemplateId, initialTemplate]
  );

  // Selected Template B Object
  const selectedTemplateB = useMemo(
    () => templates.find((t) => t.id === selectedTemplateBId),
    [templates, selectedTemplateBId]
  );

  // Extract variables for Template A
  const templateVarKeys = useMemo<string[]>(() => {
    if (!selectedTemplate) return [];
    if (selectedTemplate.variables && selectedTemplate.variables.length > 0) {
      return selectedTemplate.variables;
    }
    const rawBody = selectedTemplate.bodyText || (selectedTemplate as any)?.body_text || "";
    if (!rawBody) return [];
    const matches = rawBody.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    const keys = Array.from<string>(new Set(matches.map((m: string) => m.replace(/[{}]/g, ""))));
    return keys.sort((a, b) => Number(a) - Number(b));
  }, [selectedTemplate]);

  // Extract variables for Template B
  const templateVarKeysB = useMemo<string[]>(() => {
    if (!selectedTemplateB) return [];
    if (selectedTemplateB.variables && selectedTemplateB.variables.length > 0) {
      return selectedTemplateB.variables;
    }
    const rawBody = selectedTemplateB.bodyText || (selectedTemplateB as any)?.body_text || "";
    if (!rawBody) return [];
    const matches = rawBody.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    const keys = Array.from<string>(new Set(matches.map((m: string) => m.replace(/[{}]/g, ""))));
    return keys.sort((a, b) => Number(a) - Number(b));
  }, [selectedTemplateB]);

  // Preview body A
  const previewBody = useMemo(() => {
    if (!selectedTemplate) return "";
    let body = selectedTemplate.bodyText || (selectedTemplate as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeys) {
      const val = variables[key] || `{{${key}}}`;
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplate, templateVarKeys, variables]);

  // Preview body B
  const previewBodyB = useMemo(() => {
    if (!selectedTemplateB) return "";
    let body = selectedTemplateB.bodyText || (selectedTemplateB as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeysB) {
      const val = variablesB[key] || `{{${key}}}`;
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplateB, templateVarKeysB, variablesB]);

  // Mandatory Billing Gate Check
  const isMetaWaba = selectedChannel?.provider === "meta_waba";
  const isMetaBillingConfigured = Boolean(selectedChannel?.metaBillingConfigured);
  const isBillingBlocked = isMetaWaba && !isMetaBillingConfigured;
  const isChannelConnected = selectedChannel?.status === "connected";

  const canSubmit =
    !isLoadingPreflight &&
    !isSubmitting &&
    Boolean(selectedChannelId) &&
    isChannelConnected &&
    !isBillingBlocked &&
    Boolean(selectedTemplateId) &&
    (!isAbTest || Boolean(selectedTemplateBId));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedChannel || !selectedTemplate) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let customPhoneNumbers: string[] | undefined;
      if (audienceType === "MANUAL") {
        const cleaned = manualPhones
          .split(/[\n,;]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (cleaned.length === 0) {
          throw new Error("Informe pelo menos um número de telefone com DDI (ex: +554999999999).");
        }

        const validE164 = /^\+[1-9][0-9]{8,14}$/;
        for (const phone of cleaned) {
          if (!validE164.test(phone)) {
            throw new Error(`Número inválido: "${phone}". Use o formato internacional com + (ex: +554999999999).`);
          }
        }
        customPhoneNumbers = cleaned;
      }

      const res = await apiClient.createBroadcast(
        workspaceId,
        {
          name: campaignName.trim() || undefined,
          channelInstanceId: selectedChannel.id,
          templateId: selectedTemplate.id,
          isAbTest,
          variantBTemplateId: isAbTest && selectedTemplateB ? selectedTemplateB.id : undefined,
          audience: {
            type: audienceType,
            stage: audienceType === "BY_STAGE" ? stage : undefined,
            customPhoneNumbers,
          },
          variables,
          variantBVariables: isAbTest ? variablesB : undefined,
        },
        { token }
      );

      setSuccessInfo({
        batchId: res.batchId,
        enqueuedCount: res.enqueuedCount,
        totalTargeted: res.totalTargeted,
        templateName: res.template.name,
        isAbTest,
      });

      onBroadcastSuccess?.();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Falha ao enfileirar disparo em massa."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isAbTest ? "Disparo com Teste A/B (Divisão 50/50)" : "Disparo em Massa de Modelo WABA"}
      maxWidth="840px"
      description="Envie mensagens ativas aprovadas pela Meta com rastreamento completo de entrega, leitura, resposta e cliques."
    >
      {isLoadingPreflight ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingState variant="spinner" text="Verificando canais, trava de faturamento e base..." />
        </div>
      ) : successInfo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px 0" }}>
          <div
            style={{
              padding: "20px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid #10b981",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={48} color="#10b981" />
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Campanha Enfileirada com Sucesso!
              </h3>
              <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                {successInfo.enqueuedCount} mensagens foram geradas e enviadas ao Outbox via{" "}
                <strong>{selectedChannel?.displayName}</strong>.
                {successInfo.isAbTest && (
                  <span style={{ display: "block", marginTop: "4px", color: "var(--color-operational)", fontWeight: 600 }}>
                    ⚡ Teste A/B ativo: O público foi dividido 50% para a Variante A e 50% para a Variante B.
                  </span>
                )}
              </p>
            </div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--bg-surface)",
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
              }}
            >
              Batch ID: {successInfo.batchId}
            </div>
          </div>

          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-canvas)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
            }}
          >
            <strong>Regra de Faturamento Meta:</strong> O SOS Sales não cobra nem intermedeia tarifas. Todas as mensagens
            entregues são tarifadas diretamente pela Meta no cartão cadastrado na sua conta do WhatsApp Business Manager.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <Button variant="primary" size="sm" onClick={onClose}>
              Ver Métricas da Campanha
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {errorMessage && (
            <Alert variant="danger" title="Atenção">
              {errorMessage}
            </Alert>
          )}

          {/* 1. Nome da Campanha & Modo A/B */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: "12px", alignItems: "end" }}>
            <Input
              label="Nome da Campanha (Opcional)"
              placeholder="Ex: Oferta Relâmpago - Leads Qualificados"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                Tipo de Disparo
              </label>
              <SegmentedControl
                value={isAbTest ? "AB_TEST" : "SINGLE"}
                onChange={(val) => setIsAbTest(val === "AB_TEST")}
                options={[
                  { value: "SINGLE", label: "Disparo Único" },
                  { value: "AB_TEST", label: "Teste A/B (50/50)" },
                ]}
              />
            </div>
          </div>

          {/* 2. Seleção de Canal & Trava de Faturamento Meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Canal de Envio (Linha WhatsApp)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px" }}>
              {channels.map((ch) => {
                const isSelected = ch.id === selectedChannelId;
                const isBlocked = ch.provider === "meta_waba" && !ch.metaBillingConfigured;

                return (
                  <div
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    style={{
                      border: isSelected
                        ? (isBlocked ? "2px solid #ef4444" : "2px solid var(--color-action)")
                        : (isBlocked ? "1px dashed rgba(239, 68, 68, 0.4)" : "1px solid var(--border-default)"),
                      borderRadius: "var(--radius-lg)",
                      padding: "12px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--bg-surface)" : "var(--bg-canvas)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease",
                      opacity: isBlocked ? 0.9 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                        {ch.displayName}
                      </span>
                      <Badge variant={ch.status === "connected" ? "action" : "danger"}>
                        {ch.status === "connected" ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>

                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {ch.provider.toUpperCase()} {ch.phoneNumberE164 ? `· ${ch.phoneNumberE164}` : ""}
                    </div>

                    {ch.provider === "meta_waba" && (
                      <div style={{ marginTop: "4px" }}>
                        {ch.metaBillingConfigured ? (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldCheck size={12} /> Cartão Meta Configurado
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldAlert size={12} /> Cartão Meta Não Vinculado
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* TRAVA OBRIGATÓRIA DE CARTÃO META */}
            {selectedChannel && isBillingBlocked && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "14px 16px",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid #ef4444",
                  borderRadius: "var(--radius-lg)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <ShieldAlert size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "#b91c1c" }}>
                    Disparo Ativo Bloqueado — Cartão Meta Não Vinculado
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    O <strong>SOS Sales não cobra nem intermedeia tarifas</strong> de mensagens da Meta.
                    Para realizar disparos ativos neste canal oficial, você deve ter um cartão de crédito cadastrado diretamente no seu <strong>Gerenciador de Negócios da Meta (Business Manager)</strong>.
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Cadastre o cartão na Meta e vá em <strong>Configurações &gt; Canais WhatsApp</strong> para confirmar a vinculação.
                  </span>
                </div>
              </div>
            )}

            {selectedChannel && isMetaWaba && isMetaBillingConfigured && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid #10b981",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Faturamento Direto Meta Ativo:</strong> Tarifas cobradas diretamente no seu cartão cadastrado no Business Manager. O SOS Sales não cobra intermediários.
                </span>
              </div>
            )}

            {selectedChannel && !isMetaWaba && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Canal via QR Code (WAHA). Sem custo por mensagem, porém sujeito a limites e moderação do WhatsApp.
                </span>
              </div>
            )}
          </div>

          {/* 3. Seleção de Público-Alvo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Público-Alvo do Disparo
            </label>
            <SegmentedControl
              value={audienceType}
              onChange={(v) => setAudienceType(v as typeof audienceType)}
              options={[
                { value: "ALL_CONTACTS", label: `Todos Ativos (${totalActiveContacts})` },
                { value: "BY_STAGE", label: "Por Estágio do Funil" },
                { value: "MANUAL", label: "Lista Manual" },
              ]}
            />

            {audienceType === "BY_STAGE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  Selecione a etapa dos contatos no funil comercial:
                </span>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="LEAD">Leads em Prospecção (LEAD)</option>
                  <option value="QUALIFIED">Qualificados (QUALIFIED)</option>
                  <option value="PROPOSAL">Com Proposta Enviada (PROPOSAL)</option>
                  <option value="NEGOTIATION">Em Negociação (NEGOTIATION)</option>
                  <option value="WON">Clientes Fechados (WON)</option>
                  <option value="LOST">Oportunidades Perdidas (LOST)</option>
                </select>
              </div>
            )}

            {audienceType === "MANUAL" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  Cole os números de telefone em formato internacional (separados por vírgula ou linha):
                </span>
                <textarea
                  rows={3}
                  value={manualPhones}
                  onChange={(e) => setManualPhones(e.target.value)}
                  placeholder="+554999999999, +5511988887777"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--font-size-xs)",
                    resize: "vertical",
                  }}
                />
              </div>
            )}
          </div>

          {/* 4. Modelos e Variáveis: Modo Simples vs Modo Teste A/B */}
          {!isAbTest ? (
            /* Modo Disparo Simples */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                  Modelo Aprovado (Template WABA)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {templates.length === 0 ? (
                    <option value="">Nenhum modelo cadastrado</option>
                  ) : (
                    templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.category}) {tpl.metaTemplateId ? "— Meta Aprovado" : "— Local"}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {templateVarKeys.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "12px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Variáveis Dinâmicas do Modelo:
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px" }}>
                    {templateVarKeys.map((k) => (
                      <Input
                        key={k}
                        label={`Variável {{${k}}}`}
                        placeholder={`Conteúdo para {{${k}}} (ex: Nome / Desconto)`}
                        value={variables[k] || ""}
                        onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Prévia da Mensagem (WhatsApp)
                  </span>
                  <div
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      padding: "12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "var(--shadow-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {selectedTemplate.headerText && (
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {selectedTemplate.headerText}
                        </div>
                      )}
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                        {renderWhatsappMarkdown(previewBody)}
                      </div>
                      {selectedTemplate.footerText && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          {selectedTemplate.footerText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Modo Teste A/B 50/50 */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  backgroundColor: "rgba(139, 92, 246, 0.08)",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <Sparkles size={18} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Divisão 50/50 Automatizada:</strong> O sistema dividirá seu público igualmente. Você poderá comparar lado a lado a taxa de abertura, respostas e cliques no painel da campanha.
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
                {/* Coluna Variante A */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="action">Variante A (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos ímpares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo A</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-surface)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeys.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis A:</span>
                      {templateVarKeys.map((k) => (
                        <Input
                          key={k}
                          label={`{{${k}}}`}
                          placeholder={`Conteúdo {{${k}}}`}
                          value={variables[k] || ""}
                          onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                        />
                      ))}
                    </div>
                  )}

                  {selectedTemplate && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {renderWhatsappMarkdown(previewBody)}
                    </div>
                  )}
                </div>

                {/* Coluna Variante B */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="warning">Variante B (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos pares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo B</label>
                    <select
                      value={selectedTemplateBId}
                      onChange={(e) => setSelectedTemplateBId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-surface)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} ({tpl.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeysB.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis B:</span>
                      {templateVarKeysB.map((k) => (
                        <Input
                          key={k}
                          label={`{{${k}}}`}
                          placeholder={`Conteúdo {{${k}}}`}
                          value={variablesB[k] || ""}
                          onChange={(e) => setVariablesB({ ...variablesB, [k]: e.target.value })}
                        />
                      ))}
                    </div>
                  )}

                  {selectedTemplateB && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {renderWhatsappMarkdown(previewBodyB)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ações do Rodapé */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "14px",
            }}
          >
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!canSubmit}
              prefixIcon={isAbTest ? <Layers size={14} /> : <Send size={14} />}
              title={
                isBillingBlocked
                  ? "Disparo travado: Cadastre o cartão no Meta Business Manager e confirme nas configurações de canais"
                  : !isChannelConnected
                  ? "Canal selecionado está desconectado"
                  : isAbTest
                  ? "Iniciar Teste A/B 50/50"
                  : "Iniciar disparo ativo"
              }
            >
              {isBillingBlocked
                ? "Disparo Travado (Sem Cartão Meta)"
                : isAbTest
                ? "Iniciar Teste A/B (50/50)"
                : "Iniciar Disparo em Massa"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
};
