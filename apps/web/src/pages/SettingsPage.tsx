/**
 * SOS Sales V3 — SettingsPage (MCT OS v2.0)
 * Onboarding guiado e configuração facilitada para WhatsApp e Cobrança Pix.
 * Filosofia: "Poder invisível, simplicidade visível".
 */

import { useState, useEffect, type FC } from "react";
import { Badge, LoadingState, Alert, Button } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient, type ChannelSummary } from "../services/api-client";
import {
  Settings,
  Building2,
  ShieldCheck,
  Clock,
  Coins,
  Radio,
  Plus,
  Copy,
  Check,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Lock,
  X,
  RefreshCw,
} from "lucide-react";

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspaceDetails, activeWorkspace, token, isLoadingWorkspace, refreshWorkspace } = session;

  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // M7 — Estados de Gestão de Canal (Revogação, Auditoria e QR Code WAHA)
  const [revokingChannelId, setRevokingChannelId] = useState<string | null>(null);
  const [channelActionFeedback, setChannelActionFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [activeQrModal, setActiveQrModal] = useState<{
    channelId: string;
    channelName: string;
    qrDataUri?: string;
    qrText?: string;
    isLoading: boolean;
    error?: string;
  } | null>(null);

  // --- Estado do Bloco Pix Institucional ---
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cnpj");
  const [merchantName, setMerchantName] = useState("");
  const [merchantCity, setMerchantCity] = useState("");
  const [isSavingPix, setIsSavingPix] = useState(false);
  const [pixSuccessMsg, setPixSuccessMsg] = useState<string | null>(null);
  const [pixErrorMsg, setPixErrorMsg] = useState<string | null>(null);

  // Sincronizar dados de Pix vindos do backend
  useEffect(() => {
    if (activeWorkspaceDetails?.workspace) {
      const w = activeWorkspaceDetails.workspace;
      setPixKey(w.defaultPixKey || "");
      setPixKeyType((w.defaultPixKeyType as any) || "cnpj");
      setMerchantName(w.defaultPixMerchantName || "");
      setMerchantCity(w.defaultPixMerchantCity || "");
    }
  }, [activeWorkspaceDetails]);

  // --- Estado do Assistente Wizard de Conexão WhatsApp (3 Passos) ---
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Formulário do Wizard
  const [provider, setProvider] = useState<"meta_waba" | "waha" | "evolution">("meta_waba");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaAccountId, setWabaAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  // Validação em Tempo Real (Meta / WAHA)
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    verifiedName?: string;
    displayPhoneNumber?: string;
    qualityRating?: string;
  } | null>(null);

  // Criação & Resultado Webhook
  const [isSubmittingChannel, setIsSubmittingChannel] = useState(false);
  const [createdChannelData, setCreatedChannelData] = useState<{
    id: string;
    name: string;
    webhookUrl: string;
    webhookToken: string;
  } | null>(null);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);

  // Load active workspace channels
  const loadChannels = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoadingChannels(true);
    try {
      const res = await apiClient.getChannels(activeWorkspace.id, { token });
      setChannels(res.channels);
    } catch {
      // ignore
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [activeWorkspace?.id, token]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Salvar Parâmetros Pix da Empresa
  const handleSavePix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token) return;

    setIsSavingPix(true);
    setPixSuccessMsg(null);
    setPixErrorMsg(null);

    try {
      await apiClient.updateWorkspace(
        activeWorkspace.id,
        {
          defaultPixKey: pixKey.trim() || null,
          defaultPixKeyType: pixKeyType,
          defaultPixMerchantName: merchantName.trim() || null,
          defaultPixMerchantCity: merchantCity.trim() || null,
        },
        { token }
      );

      setPixSuccessMsg("Configurações de Chave Pix salvas com sucesso! O Cockpit já está atualizado.");
      if (refreshWorkspace) {
        refreshWorkspace();
      }
    } catch (err: unknown) {
      setPixErrorMsg(err instanceof Error ? err.message : "Falha ao salvar configurações de Pix.");
    } finally {
      setIsSavingPix(false);
    }
  };

  // Testar Conexão em tempo real
  const handleTestConnection = async () => {
    if (!activeWorkspace || !token) return;

    setIsTestingConn(true);
    setTestResult(null);

    try {
      const res = await apiClient.testChannelConnection(
        activeWorkspace.id,
        {
          provider,
          credentials: {
            phoneNumberId: phoneNumberId.trim() || undefined,
            accessToken: accessToken.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
          },
        },
        { token }
      );

      if (res.success) {
        setTestResult({
          success: true,
          verifiedName: res.verifiedName,
          displayPhoneNumber: res.displayPhoneNumber,
          qualityRating: res.qualityRating,
          message: "Conexão validada com sucesso com a Meta Graph API!",
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || "A Meta não reconheceu as credenciais informadas.",
        });
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Erro ao testar conectividade.",
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  // Concluir Wizard e Criar Linha
  const handleFinishWizard = async () => {
    if (!activeWorkspace || !token || !displayName.trim()) return;

    setIsSubmittingChannel(true);
    setCreateChannelError(null);

    try {
      const res = await apiClient.createChannel(
        activeWorkspace.id,
        {
          provider,
          displayName: displayName.trim(),
          phoneNumberE164: phoneNumber.trim() || undefined,
          credentials: {
            accessToken: accessToken.trim() || undefined,
            phoneNumberId: phoneNumberId.trim() || undefined,
            wabaAccountId: wabaAccountId.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
          },
        },
        { token }
      );

      const resolvedWebhookUrl = res.webhookUrl || (res.channel as any)?.webhookUrl || "";
      const resolvedWebhookToken = res.webhookToken || (res.channel as any)?.webhookToken || "";

      setCreatedChannelData({
        id: res.channel.id,
        name: res.channel.displayName,
        webhookUrl: resolvedWebhookUrl.startsWith("http") ? resolvedWebhookUrl : `${window.location.origin}${resolvedWebhookUrl}`,
        webhookToken: resolvedWebhookToken,
      });

      setWizardStep(3);
      loadChannels();
    } catch (err: unknown) {
      setCreateChannelError(
        err instanceof Error ? err.message : "Falha ao provisionar instância de canal."
      );
    } finally {
      setIsSubmittingChannel(false);
    }
  };

  const handleResetWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setDisplayName("");
    setPhoneNumber("");
    setPhoneNumberId("");
    setAccessToken("");
    setWabaAccountId("");
    setAppSecret("");
    setApiKey("");
    setBaseUrl("");
    setTestResult(null);
    setCreatedChannelData(null);
    setCreateChannelError(null);
  };

  // M7: Revogação com auditoria e invalidação de credenciais
  const handleRevokeChannel = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    const confirmed = window.confirm(
      `Tem certeza que deseja revogar a linha "${channelName}"? As credenciais serão invalidadas e o canal será desativado com registro de auditoria.`
    );
    if (!confirmed) return;

    setRevokingChannelId(channelId);
    setChannelActionFeedback(null);
    try {
      const res = await apiClient.revokeChannel(activeWorkspace.id, channelId, { token });
      setChannelActionFeedback({
        type: "success",
        message: res.message || `Linha "${channelName}" revogada com sucesso.`,
      });
      await loadChannels();
    } catch (err: unknown) {
      setChannelActionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Falha ao revogar linha.",
      });
    } finally {
      setRevokingChannelId(null);
    }
  };

  // M7: Visualização de QR Code WAHA Seguro (sem imprimir tokens)
  const handleOpenQrCodeModal = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    setActiveQrModal({ channelId, channelName, isLoading: true });
    try {
      const res = await apiClient.getChannelQrCode(activeWorkspace.id, channelId, { token });
      if (res.success) {
        setActiveQrModal({
          channelId,
          channelName,
          qrDataUri: res.qrDataUri,
          qrText: res.qr,
          isLoading: false,
        });
      } else {
        setActiveQrModal({
          channelId,
          channelName,
          isLoading: false,
          error: res.error || "QR Code indisponível ou sessão já conectada.",
        });
      }
    } catch (err: unknown) {
      setActiveQrModal({
        channelId,
        channelName,
        isLoading: false,
        error: err instanceof Error ? err.message : "Falha ao carregar QR Code do WAHA.",
      });
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "calc(100vh - 64px)",
        backgroundColor: "var(--bg-canvas, #F8FAFC)",
      }}
    >
      {/* Sub-header de Contexto */}
      <div
        style={{
          height: "52px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderBottom: "1px solid var(--border-default, #E2E8F0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Settings size={18} color="var(--color-operational, #2563EB)" />
          <span style={{ fontWeight: 700, color: "var(--text-primary, #0F172A)", fontSize: "0.95rem" }}>
            Configurações Soberanas & Integrações WhatsApp
          </span>
        </div>

        <div>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      <div
        style={{
          padding: "32px 24px",
          maxWidth: "980px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
        }}
      >
        {/* Bloco 1: Configuração Facilitada da Chave Pix (Fechamento no Chat) */}
        <div
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            borderRadius: "var(--radius-lg, 12px)",
            border: "1px solid #A7F3D0",
            boxShadow: "0 2px 8px rgba(16, 185, 129, 0.06)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
              paddingBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  backgroundColor: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#059669",
                }}
              >
                <QrCode size={22} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#065F46" }}>
                    Chave Pix Institucional da Empresa
                  </h3>
                  <Badge variant="action">Fechamento Imediato no Chat</Badge>
                </div>
                <p style={{ fontSize: "0.825rem", color: "var(--text-secondary, #64748B)", marginTop: "2px" }}>
                  Ao gerar ordens de pagamento no Cockpit de Vendas, o QR Code BACEN e a linha Copia e Cola usarão esses dados automaticamente.
                </p>
              </div>
            </div>
          </div>

          {pixSuccessMsg && (
            <Alert variant="info" title="Configuração Atualizada">
              {pixSuccessMsg}
            </Alert>
          )}

          {pixErrorMsg && (
            <Alert variant="danger" title="Erro ao Salvar">
              {pixErrorMsg}
            </Alert>
          )}

          <form onSubmit={handleSavePix} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary, #475569)", marginBottom: "6px" }}>
                  Chave Pix (E-mail, Telefone, CNPJ ou Aleatória)
                </label>
                <input
                  type="text"
                  placeholder="Ex: financeiro@minhaempresa.com.br ou 00.000.000/0001-91"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-default, #CBD5E1)",
                    padding: "0 12px",
                    fontSize: "0.875rem",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary, #475569)", marginBottom: "6px" }}>
                  Tipo da Chave
                </label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as any)}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-default, #CBD5E1)",
                    padding: "0 10px",
                    fontSize: "0.875rem",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone (Celular)</option>
                  <option value="cpf">CPF</option>
                  <option value="random">Chave Aleatória (EVP)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary, #475569)", marginBottom: "6px" }}>
                  Nome do Titular / Razão Social (Até 25 caracteres)
                </label>
                <input
                  type="text"
                  maxLength={25}
                  placeholder="Ex: MCT LTDA"
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-default, #CBD5E1)",
                    padding: "0 12px",
                    fontSize: "0.875rem",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary, #475569)", marginBottom: "6px" }}>
                  Cidade da Conta (Até 15 caracteres)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="Ex: CHAPECO"
                  value={merchantCity}
                  onChange={(e) => setMerchantCity(e.target.value)}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-default, #CBD5E1)",
                    padding: "0 12px",
                    fontSize: "0.875rem",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
              <Button size="sm" variant="primary" type="submit" disabled={isSavingPix}>
                {isSavingPix ? "Salvando..." : "Salvar Chave Pix 💾"}
              </Button>
            </div>
          </form>
        </div>

        {/* Bloco 2: Canais WhatsApp & Onboarding Guiado (3 Passos) */}
        <div
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            borderRadius: "var(--radius-lg, 12px)",
            border: "1px solid var(--border-default, #E2E8F0)",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
              paddingBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Radio size={22} color="var(--color-operational, #2563EB)" />
              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                  }}
                >
                  Conexões WhatsApp
                </h3>
                <p style={{ fontSize: "0.825rem", color: "var(--text-secondary, #64748B)" }}>
                  Instâncias ativas conectadas para disparo oficial, catálogo, atendimento e fechamento.
                </p>
              </div>
            </div>

            {!isWizardOpen && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setIsWizardOpen(true);
                  setWizardStep(1);
                }}
              >
                <Plus size={16} />
                Conectar Nova Linha ⚡
              </Button>
            )}
          </div>

          {/* WIZARD GUIADO EM 3 PASSOS */}
          {isWizardOpen && (
            <div
              style={{
                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                border: "1px solid var(--border-default, #CBD5E1)",
                borderRadius: "10px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {/* Stepper Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: wizardStep >= 1 ? "var(--color-operational, #2563EB)" : "#CBD5E1",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    1
                  </div>
                  <span style={{ fontWeight: wizardStep === 1 ? 700 : 500, fontSize: "0.85rem" }}>
                    Escolher Provedor
                  </span>
                  <ArrowRight size={14} color="#94A3B8" />

                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: wizardStep >= 2 ? "var(--color-operational, #2563EB)" : "#CBD5E1",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    2
                  </div>
                  <span style={{ fontWeight: wizardStep === 2 ? 700 : 500, fontSize: "0.85rem" }}>
                    Credenciais & Teste
                  </span>
                  <ArrowRight size={14} color="#94A3B8" />

                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: wizardStep === 3 ? "var(--color-action, #00A884)" : "#CBD5E1",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                    }}
                  >
                    3
                  </div>
                  <span style={{ fontWeight: wizardStep === 3 ? 700 : 500, fontSize: "0.85rem" }}>
                    Ativação Webhook
                  </span>
                </div>

                <Button size="sm" variant="outline" onClick={handleResetWizard}>
                  Cancelar
                </Button>
              </div>

              {/* PASSO 1: Seleção de Provedor */}
              {wizardStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary, #475569)" }}>
                    Selecione como deseja conectar a sua linha do WhatsApp:
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                    {/* Opção 1: Meta Cloud API */}
                    <div
                      onClick={() => setProvider("meta_waba")}
                      style={{
                        padding: "16px",
                        borderRadius: "8px",
                        border: provider === "meta_waba" ? "2px solid #2563EB" : "1px solid #E2E8F0",
                        backgroundColor: provider === "meta_waba" ? "#EFF6FF" : "#FFFFFF",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1E3A8A" }}>
                          Meta Cloud API
                        </span>
                        <Badge variant="action">Oficial</Badge>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: "1.4" }}>
                        Linha oficial Meta WABA. Zero risco de banimento, disparo de modelos, flows e catálogo nativo de produtos.
                      </p>
                    </div>

                    {/* Opção 2: WAHA */}
                    <div
                      onClick={() => setProvider("waha")}
                      style={{
                        padding: "16px",
                        borderRadius: "8px",
                        border: provider === "waha" ? "2px solid #2563EB" : "1px solid #E2E8F0",
                        backgroundColor: provider === "waha" ? "#EFF6FF" : "#FFFFFF",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0F172A" }}>
                          WAHA
                        </span>
                        <Badge variant="neutral">QR Code</Badge>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: "1.4" }}>
                        WhatsApp HTTP API. Pareamento imediato via leitura de QR Code, ideal para testes locais e números de apoio.
                      </p>
                    </div>

                    {/* Opção 3: Evolution API */}
                    <div
                      onClick={() => setProvider("evolution")}
                      style={{
                        padding: "16px",
                        borderRadius: "8px",
                        border: provider === "evolution" ? "2px solid #2563EB" : "1px solid #E2E8F0",
                        backgroundColor: provider === "evolution" ? "#EFF6FF" : "#FFFFFF",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0F172A" }}>
                          Evolution API
                        </span>
                        <Badge variant="neutral">Self-Hosted</Badge>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "#475569", lineHeight: "1.4" }}>
                        Servidor autônomo Evolution API v2 em container dedicado.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <Button size="sm" variant="primary" onClick={() => setWizardStep(2)}>
                      Próximo: Informar Credenciais <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              )}

              {/* PASSO 2: Formulário de Credenciais & Teste */}
              {wizardStep === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        Nome Identificador da Linha
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Comercial WhatsApp Oficial"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        style={{
                          width: "100%",
                          height: "36px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          padding: "0 10px",
                          fontSize: "0.85rem",
                          backgroundColor: "#FFFFFF",
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        Número E.164 (Ex: +554999998888)
                      </label>
                      <input
                        type="text"
                        placeholder="+5511999998888"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        style={{
                          width: "100%",
                          height: "36px",
                          borderRadius: "6px",
                          border: "1px solid #CBD5E1",
                          padding: "0 10px",
                          fontSize: "0.85rem",
                          backgroundColor: "#FFFFFF",
                        }}
                      />
                    </div>
                  </div>

                  {provider === "meta_waba" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            Phone Number ID (Meta Graph API)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 109876543210987"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            style={{
                              width: "100%",
                              height: "36px",
                              borderRadius: "6px",
                              border: "1px solid #CBD5E1",
                              padding: "0 10px",
                              fontSize: "0.85rem",
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                            WABA Account ID (Opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 987654321098765"
                            value={wabaAccountId}
                            onChange={(e) => setWabaAccountId(e.target.value)}
                            style={{
                              width: "100%",
                              height: "36px",
                              borderRadius: "6px",
                              border: "1px solid #CBD5E1",
                              padding: "0 10px",
                              fontSize: "0.85rem",
                              backgroundColor: "#FFFFFF",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                          Access Token Permanente (System User Token)
                        </label>
                        <input
                          type="password"
                          placeholder="EAAB..."
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.85rem",
                            backgroundColor: "#FFFFFF",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                          App Secret (Meta App Secret para validação de assinatura de webhook)
                        </label>
                        <input
                          type="password"
                          placeholder="Chave secreta do app Meta (opcional)"
                          value={appSecret}
                          onChange={(e) => setAppSecret(e.target.value)}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.85rem",
                            backgroundColor: "#FFFFFF",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                          API Key do Servidor
                        </label>
                        <input
                          type="password"
                          placeholder="Chave secreta de autenticação"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.85rem",
                            backgroundColor: "#FFFFFF",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                          URL Base da Instância
                        </label>
                        <input
                          type="text"
                          placeholder="http://localhost:3000"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.85rem",
                            backgroundColor: "#FFFFFF",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Feedback do Teste de Conexão */}
                  {testResult && (
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        backgroundColor: testResult.success ? "#ECFDF5" : "#FEF2F2",
                        border: `1px solid ${testResult.success ? "#A7F3D0" : "#FECACA"}`,
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.85rem",
                      }}
                    >
                      {testResult.success ? (
                        <CheckCircle2 size={18} color="#059669" />
                      ) : (
                        <AlertTriangle size={18} color="#DC2626" />
                      )}
                      <div>
                        <span style={{ fontWeight: 700, color: testResult.success ? "#065F46" : "#991B1B" }}>
                          {testResult.success ? "Conexão Validada com Sucesso!" : "Falha na Verificação"}
                        </span>
                        <div style={{ fontSize: "0.8rem", color: testResult.success ? "#047857" : "#B91C1C", marginTop: "2px" }}>
                          {testResult.message}
                          {testResult.verifiedName && ` • Nome Oficial: ${testResult.verifiedName}`}
                          {testResult.qualityRating && ` • Qualidade da Linha: ${testResult.qualityRating}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {createChannelError && (
                    <Alert variant="danger" title="Erro ao Conectar">
                      {createChannelError}
                    </Alert>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <Button size="sm" variant="outline" onClick={() => setWizardStep(1)}>
                      <ArrowLeft size={14} /> Voltar
                    </Button>

                    <div style={{ display: "flex", gap: "10px" }}>
                      {provider === "meta_waba" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleTestConnection}
                          disabled={isTestingConn || !phoneNumberId || !accessToken}
                        >
                          {isTestingConn ? "Testando..." : "Testar Conexão com a Meta ⚡"}
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleFinishWizard}
                        disabled={isSubmittingChannel || !displayName.trim()}
                      >
                        {isSubmittingChannel ? "Conectando..." : "Salvar e Gerar Webhook 🚀"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* PASSO 3: Sucesso & Webhook Gerado */}
              {wizardStep === 3 && createdChannelData && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      backgroundColor: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <CheckCircle2 size={24} color="#059669" />
                    <div>
                      <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#065F46" }}>
                        Canal "{createdChannelData.name}" Provisionado com Sucesso!
                      </h4>
                      <p style={{ fontSize: "0.8rem", color: "#047857", marginTop: "2px" }}>
                        As credenciais foram criptografadas com AES-256-GCM no cofre seguro. Cole as informações abaixo no painel de Webhooks da Meta ou WAHA.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        URL do Webhook Ingress (Callback URL)
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          readOnly
                          value={createdChannelData.webhookUrl}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.825rem",
                            backgroundColor: "#FFFFFF",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(createdChannelData.webhookUrl, "wh-url")}
                        >
                          {copiedId === "wh-url" ? <Check size={14} color="#00A884" /> : <Copy size={14} />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                        Token de Verificação (Verify Token)
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          readOnly
                          value={createdChannelData.webhookToken}
                          style={{
                            width: "100%",
                            height: "36px",
                            borderRadius: "6px",
                            border: "1px solid #CBD5E1",
                            padding: "0 10px",
                            fontSize: "0.825rem",
                            backgroundColor: "#FFFFFF",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopy(createdChannelData.webhookToken, "wh-token")}
                        >
                          {copiedId === "wh-token" ? <Check size={14} color="#00A884" /> : <Copy size={14} />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <Button size="sm" variant="primary" onClick={handleResetWizard}>
                      Concluir Onboarding
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {channelActionFeedback && (
            <Alert
              variant={channelActionFeedback.type === "success" ? "info" : "danger"}
              title={channelActionFeedback.type === "success" ? "Ação Realizada" : "Aviso de Canal"}
            >
              {channelActionFeedback.message}
            </Alert>
          )}

          {/* LISTA DE CANAIS CONECTADOS */}
          {isLoadingChannels ? (
            <LoadingState variant="skeleton" lines={3} text="Carregando canais..." />
          ) : channels.length === 0 ? (
            <div
              style={{
                padding: "36px",
                textAlign: "center",
                border: "1px dashed var(--border-default, #E2E8F0)",
                borderRadius: "8px",
              }}
            >
              <Smartphone size={36} color="var(--text-muted, #94A3B8)" style={{ margin: "0 auto 10px" }} />
              <p style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)", marginBottom: "4px" }}>
                Nenhuma linha WhatsApp conectada ainda
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary, #64748B)" }}>
                Clique em "Conectar Nova Linha ⚡" para ativar seu canal Meta WABA ou WAHA com setup em 3 passos.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {channels.map((c) => (
                <div
                  key={c.id}
                  style={{
                    border: "1px solid var(--border-default, #E2E8F0)",
                    borderRadius: "8px",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: c.isActive ? "var(--bg-canvas, #F8FAFC)" : "#F1F5F9",
                    opacity: c.isActive ? 1 : 0.75,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "8px",
                        backgroundColor: c.provider === "meta_waba" ? "#EFF6FF" : "var(--color-action-subtle, #E6F7F3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: c.provider === "meta_waba" ? "#2563EB" : "var(--color-action, #00A884)",
                      }}
                    >
                      <Smartphone size={22} />
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{c.displayName}</span>
                        <Badge variant={c.isActive ? "action" : "danger"}>
                          {c.isActive ? "Conectado" : "Revogado / Inativo"}
                        </Badge>
                        <Badge variant="neutral">{c.provider.toUpperCase()}</Badge>
                        <Badge variant={c.provider === "meta_waba" ? "operational" : "neutral"}>
                          {c.provider === "meta_waba" ? "Homologado Oficial" : "Laboratório Local"}
                        </Badge>
                      </div>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary, #64748B)",
                          marginTop: "2px",
                        }}
                      >
                        {c.phoneNumberE164 ? `Telefone: ${c.phoneNumberE164}` : "Sem telefone vinculado"} • ID: {c.id}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {c.provider === "waha" && c.isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenQrCodeModal(c.id, c.displayName)}
                      >
                        <QrCode size={14} /> QR Code
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(c.id, c.id)}
                    >
                      {copiedId === c.id ? <Check size={14} color="#00A884" /> : <Copy size={14} />}
                      {copiedId === c.id ? "Copiado!" : "Copiar ID"}
                    </Button>

                    {c.isActive && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={revokingChannelId === c.id}
                        onClick={() => handleRevokeChannel(c.id, c.displayName)}
                      >
                        <Lock size={14} /> {revokingChannelId === c.id ? "Revogando..." : "Revogar"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bloco 3: Parâmetros do Tenant */}
        {isLoadingWorkspace ? (
          <LoadingState variant="skeleton" lines={5} text="Carregando parâmetros do workspace..." />
        ) : activeWorkspaceDetails ? (
          <div
            style={{
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              borderRadius: "var(--radius-lg, 12px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
                paddingBottom: "16px",
              }}
            >
              <Building2 size={24} color="var(--color-operational, #2563EB)" />
              <div>
                <h2
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                  }}
                >
                  {activeWorkspaceDetails.workspace.name}
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    color: "var(--text-muted, #94A3B8)",
                  }}
                >
                  ID: {activeWorkspaceDetails.workspace.id} • Slug: {activeWorkspaceDetails.workspace.slug}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                fontSize: "0.875rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span
                  style={{
                    color: "var(--text-muted, #94A3B8)",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clock size={14} /> Fuso Horário
                </span>
                <strong>{activeWorkspaceDetails.workspace.timezone}</strong>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span
                  style={{
                    color: "var(--text-muted, #94A3B8)",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Coins size={14} /> Moeda Padrão
                </span>
                <strong>{activeWorkspaceDetails.workspace.currency}</strong>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem" }}>
                  Status Operacional
                </span>
                <div>
                  <Badge variant={activeWorkspaceDetails.workspace.isActive ? "action" : "danger"}>
                    {activeWorkspaceDetails.workspace.isActive ? "Tenant Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem" }}>
                  Papel Concedido
                </span>
                <div>
                  <Badge variant="operational">{activeWorkspaceDetails.userRole}</Badge>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle, #F1F5F9)", paddingTop: "16px" }}>
              <span
                style={{
                  color: "var(--text-muted, #94A3B8)",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "8px",
                }}
              >
                <ShieldCheck size={14} color="var(--color-action, #00A884)" /> Permissões Atribuídas
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {activeWorkspaceDetails.permissions.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      backgroundColor: "var(--color-operational-subtle, #EFF6FF)",
                      color: "var(--color-operational, #2563EB)",
                      border: "1px solid var(--color-operational-border, #BFDBFE)",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Alert variant="info" title="Nenhum Workspace Selecionado">
            Conecte-se com um token válido e selecione um workspace para visualizar seus parâmetros de configuração.
          </Alert>
        )}
      </div>

      {/* M7 Modal: QR Code WAHA Seguro */}
      {activeQrModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setActiveQrModal(null)}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "460px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <QrCode size={20} color="var(--color-operational, #2563EB)" />
                <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                  Pareamento Seguro WAHA
                </h3>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActiveQrModal(null)}>
                <X size={16} />
              </Button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary, #64748B)", margin: 0 }}>
              Linha: <strong>{activeQrModal.channelName}</strong>. Aponte a câmera do WhatsApp para autenticar a sessão local.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                backgroundColor: "#F8FAFC",
                borderRadius: "8px",
                border: "1px solid #E2E8F0",
                minHeight: "220px",
              }}
            >
              {activeQrModal.isLoading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <RefreshCw size={24} color="#2563EB" />
                  <span style={{ fontSize: "0.85rem", color: "#64748B" }}>Buscando QR Code da sessão local...</span>
                </div>
              ) : activeQrModal.error ? (
                <div style={{ textAlign: "center", color: "#DC2626", fontSize: "0.85rem" }}>
                  <AlertTriangle size={24} color="#DC2626" style={{ margin: "0 auto 8px" }} />
                  <p style={{ margin: 0 }}>{activeQrModal.error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    style={{ marginTop: "12px" }}
                    onClick={() => handleOpenQrCodeModal(activeQrModal.channelId, activeQrModal.channelName)}
                  >
                    Tentar Novamente
                  </Button>
                </div>
              ) : activeQrModal.qrDataUri ? (
                <img
                  src={activeQrModal.qrDataUri}
                  alt="QR Code WAHA"
                  style={{ width: "200px", height: "200px", borderRadius: "4px" }}
                />
              ) : activeQrModal.qrText ? (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    wordBreak: "break-all",
                    padding: "10px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #CBD5E1",
                    borderRadius: "4px",
                  }}
                >
                  {activeQrModal.qrText}
                </div>
              ) : (
                <span style={{ fontSize: "0.85rem", color: "#64748B" }}>Nenhum QR code disponível no momento.</span>
              )}
            </div>

            <div
              style={{
                fontSize: "0.78rem",
                color: "#059669",
                backgroundColor: "#ECFDF5",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #A7F3D0",
              }}
            >
              🔒 <strong>Segurança Soberana:</strong> As credenciais do servidor WAHA são mantidas no cofre do servidor e nunca transitam ou são impressas no navegador.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button size="sm" variant="outline" onClick={() => setActiveQrModal(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
