/**
 * SOS Sales V3 — SettingsPage (MCT OS v2.0)
 * Real destination for the "Configurações" navigation item.
 * Displays real active workspace parameters and WhatsApp channels from Fastify API.
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
} from "lucide-react";

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspaceDetails, activeWorkspace, token, isLoadingWorkspace } = session;

  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New channel form state
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [provider, setProvider] = useState<"waha" | "evolution" | "meta_waba">("waha");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);
  const [createErrorMsg, setCreateErrorMsg] = useState<string | null>(null);

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

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token || !displayName.trim()) return;

    setIsSubmitting(true);
    setCreateSuccessMsg(null);
    setCreateErrorMsg(null);

    try {
      const res = await apiClient.createChannel(
        activeWorkspace.id,
        {
          provider,
          displayName: displayName.trim(),
          phoneNumberE164: phoneNumber.trim() || undefined,
        },
        { token }
      );

      setCreateSuccessMsg(
        `Canal "${res.channel.displayName}" criado! Webhook Ingress gerado com sucesso.`
      );
      setDisplayName("");
      setPhoneNumber("");
      setIsAddingChannel(false);
      loadChannels();
    } catch (err: unknown) {
      setCreateErrorMsg(
        err instanceof Error ? err.message : "Falha ao criar instância de canal."
      );
    } finally {
      setIsSubmitting(false);
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
          height: "48px",
          backgroundColor: "var(--bg-surface, #FFFFFF)",
          borderBottom: "1px solid var(--border-default, #E2E8F0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Settings size={16} color="var(--color-operational, #2563EB)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Configurações & Canais de Atendimento
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
          maxWidth: "960px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
        }}
      >
        {/* Bloco 1: Parâmetros do Tenant */}
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
                    fontSize: "1.2rem",
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
                  ID: {activeWorkspaceDetails.workspace.id} • Slug:{" "}
                  {activeWorkspaceDetails.workspace.slug}
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

        {/* Bloco 2: Canais WhatsApp & Webhook Ingress */}
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
              <Radio size={20} color="var(--color-action, #00A884)" />
              <div>
                <h3
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: "var(--text-primary, #0F172A)",
                  }}
                >
                  Canais WhatsApp Conectados
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748B)" }}>
                  Instâncias ativas pareadas para envio e recebimento via WAHA, Evolution API ou Cloud API.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant={isAddingChannel ? "outline" : "primary"}
              onClick={() => setIsAddingChannel(!isAddingChannel)}
            >
              <Plus size={14} />
              {isAddingChannel ? "Fechar" : "Novo Canal WhatsApp"}
            </Button>
          </div>

          {createSuccessMsg && (
            <Alert variant="info" title="Canal Provisionado">
              {createSuccessMsg}
            </Alert>
          )}

          {createErrorMsg && (
            <Alert variant="danger" title="Erro no Provisionamento">
              {createErrorMsg}
            </Alert>
          )}

          {/* Formulário de Adicionar Canal */}
          {isAddingChannel && (
            <form
              onSubmit={handleCreateChannel}
              style={{
                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                padding: "20px",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--border-default, #E2E8F0)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>Conectar Nova Instância WhatsApp</h4>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    Provedor do WhatsApp
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    style={{
                      width: "100%",
                      height: "36px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-default, #E2E8F0)",
                      padding: "0 8px",
                      backgroundColor: "#FFFFFF",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="waha">WAHA (WhatsApp HTTP API)</option>
                    <option value="evolution">Evolution API v2</option>
                    <option value="meta_waba">Meta Cloud API (Oficial)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    Nome da Instância
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Comercial Principal"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{
                      width: "100%",
                      height: "36px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-default, #E2E8F0)",
                      padding: "0 10px",
                      backgroundColor: "#FFFFFF",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                  >
                    Telefone E.164 (Opcional)
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
                      border: "1px solid var(--border-default, #E2E8F0)",
                      padding: "0 10px",
                      backgroundColor: "#FFFFFF",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setIsAddingChannel(false)}
                >
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Provisionando..." : "Salvar e Gerar Webhook"}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de Canais */}
          {isLoadingChannels ? (
            <LoadingState variant="skeleton" lines={3} text="Carregando canais..." />
          ) : channels.length === 0 ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                border: "1px dashed var(--border-default, #E2E8F0)",
                borderRadius: "8px",
              }}
            >
              <Smartphone size={32} color="var(--text-muted, #94A3B8)" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)", marginBottom: "4px" }}>
                Nenhum canal WhatsApp configurado
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary, #64748B)" }}>
                Clique em "Novo Canal WhatsApp" para cadastrar uma instância WAHA ou Evolution API.
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
                    backgroundColor: "var(--bg-canvas, #F8FAFC)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "8px",
                        backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-action, #00A884)",
                      }}
                    >
                      <Smartphone size={20} />
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{c.displayName}</span>
                        <Badge variant={c.isActive ? "action" : "danger"}>
                          {c.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="neutral">{c.provider.toUpperCase()}</Badge>
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

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(c.id, c.id)}
                    >
                      {copiedId === c.id ? <Check size={14} color="#00A884" /> : <Copy size={14} />}
                      {copiedId === c.id ? "ID Copiado!" : "Copiar ID"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
