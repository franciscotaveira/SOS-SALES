import { useState, useEffect, useCallback, type FC } from "react";
import { Alert, Badge, Button, Input } from "@sos-sales/ui";
import {
  Braces,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  Send,
  Webhook,
  Key,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import {
  apiClient,
  type OutboundWebhookSubscription,
  type WebhookTestResult,
} from "../../services/api-client";

const AVAILABLE_EVENTS = [
  { id: "*", label: "Todos os Eventos (*)" },
  { id: "lead.created", label: "Novo Lead Criado" },
  { id: "message.received", label: "Mensagem Recebida" },
  { id: "proposal.created", label: "Proposta Comercial Criada" },
  { id: "payment.settled", label: "Pagamento Pix Confirmado" },
  { id: "stage.changed", label: "Mudança de Etapa / Funil" },
];

export const IntegrationsSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<OutboundWebhookSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Creation form state
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["*"]);
  const [customSecret, setCustomSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Testing feedback state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, WebhookTestResult>>({});

  const workspaceId = session.activeWorkspace?.id || "";
  const token = session.token || "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const loadWebhooks = useCallback(async () => {
    if (!workspaceId || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.listWebhooks(workspaceId, { token });
      setWebhooks(res.webhooks || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao carregar webhooks.");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !token || !newUrl.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await apiClient.createWebhook(
        workspaceId,
        {
          url: newUrl.trim(),
          description: newDescription.trim() || undefined,
          events: selectedEvents.length > 0 ? selectedEvents : ["*"],
          secret: customSecret.trim() || undefined,
        },
        { token }
      );

      setNewUrl("");
      setNewDescription("");
      setSelectedEvents(["*"]);
      setCustomSecret("");
      setIsAdding(false);
      await loadWebhooks();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao cadastrar webhook.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    if (!workspaceId || !token) return;
    setTestingId(webhookId);
    setErrorMsg(null);

    try {
      const result = await apiClient.testWebhook(workspaceId, webhookId, { token });
      setTestResults((prev) => ({ ...prev, [webhookId]: result }));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha no teste de webhook.");
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!workspaceId || !token) return;
    if (!confirm("Tem certeza que deseja remover esta assinatura de webhook?")) return;

    try {
      await apiClient.deleteWebhook(workspaceId, webhookId, { token });
      await loadWebhooks();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao excluir webhook.");
    }
  };

  const toggleEvent = (eventId: string) => {
    if (eventId === "*") {
      setSelectedEvents(["*"]);
      return;
    }
    const filtered = selectedEvents.filter((e) => e !== "*");
    if (filtered.includes(eventId)) {
      const next = filtered.filter((e) => e !== eventId);
      setSelectedEvents(next.length === 0 ? ["*"] : next);
    } else {
      setSelectedEvents([...filtered, eventId]);
    }
  };

  const endpoints = [
    {
      method: "GET",
      path: `/v1/workspaces/${workspaceId}/integrations/candidates`,
      use: "Ler conversas candidatas para uma automação.",
    },
    {
      method: "POST",
      path: `/v1/workspaces/${workspaceId}/integrations/suggestions`,
      use: "Devolver uma sugestão governada ao Radar.",
    },
    {
      method: "POST",
      path: `/v1/workspaces/${workspaceId}/integrations/radar/scan`,
      use: "Executar a análise nativa sob demanda.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {errorMsg && (
        <Alert variant="danger" title="Atenção">
          {errorMsg}
        </Alert>
      )}

      {/* 1. API de Integracoes */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={title}>
              <Braces size={17} /> API de Integrações
            </h2>
            <p style={description}>
              Conecte n8n, sistemas internos ou agentes ao Chat Sales sem entregar controle direto do WhatsApp.
            </p>
          </div>
          <Badge variant="action">API disponível</Badge>
        </div>
        <Alert variant="info" title="Como funciona">
          O sistema externo lê candidatos e devolve sugestões. O operador revisa no Radar antes de qualquer mensagem ser enviada.
        </Alert>
        <CopyRow label="URL base" value={baseUrl} copied={copied === "base"} onCopy={() => copy("base", baseUrl)} />
        <CopyRow label="Workspace" value={workspaceId} copied={copied === "workspace"} onCopy={() => copy("workspace", workspaceId)} />
        <div style={{ display: "grid", gap: 8 }}>
          {endpoints.map((item) => (
            <div key={item.path} style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge variant={item.method === "GET" ? "operational" : "ai"}>{item.method}</Badge>
                <code style={{ fontSize: 11, overflowWrap: "anywhere" }}>{item.path}</code>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>{item.use}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Webhooks de Saida (Novo & Totalmente Operacional) */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={title}>
              <Webhook size={17} /> Webhooks de Saída
            </h2>
            <p style={description}>
              Envie eventos em tempo real para o n8n ou seu backend quando ocorrerem ações no Chat Sales (leads, mensagens, propostas, pagamentos Pix).
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              size="xs"
              variant="outline"
              prefixIcon={<RefreshCw size={13} />}
              onClick={loadWebhooks}
              disabled={isLoading}
            >
              Atualizar
            </Button>
            {!isAdding && (
              <Button
                size="xs"
                variant="primary"
                prefixIcon={<Plus size={13} />}
                onClick={() => setIsAdding(true)}
              >
                Novo Webhook
              </Button>
            )}
          </div>
        </div>

        {/* Formulario de Novo Webhook */}
        {isAdding && (
          <form
            onSubmit={handleCreateWebhook}
            style={{
              padding: 16,
              background: "var(--bg-canvas)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              Cadastrar Novo Destino de Webhook
            </div>

            <Input
              label="URL de Destino (Endpoint HTTP/HTTPS) *"
              placeholder="https://meu-n8n.meudominio.com/webhook/chat-sales"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              required
            />

            <Input
              label="Descrição / Identificação (Opcional)"
              placeholder="Ex: n8n Produção - Disparo de E-mail de Boas Vindas"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
                Eventos a Notificar
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {AVAILABLE_EVENTS.map((ev) => {
                  const isChecked = selectedEvents.includes(ev.id);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => toggleEvent(ev.id)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        borderRadius: 16,
                        border: isChecked ? "1px solid var(--color-primary)" : "1px solid var(--border-default)",
                        backgroundColor: isChecked ? "var(--bg-surface-elevated)" : "var(--bg-surface)",
                        color: isChecked ? "var(--color-primary)" : "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {isChecked && <Check size={12} />}
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Input
              label="Segredo HMAC-SHA256 (Opcional — gerado automaticamente se vazio)"
              placeholder="whsec_..."
              value={customSecret}
              onChange={(e) => setCustomSecret(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <Button size="xs" variant="ghost" onClick={() => setIsAdding(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button size="xs" variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Webhook"}
              </Button>
            </div>
          </form>
        )}

        {/* Lista de Webhooks Cadastrados */}
        {webhooks.length === 0 && !isAdding ? (
          <div
            style={{
              padding: 24,
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {isLoading ? "Carregando assinaturas de webhook..." : "Nenhum webhook de saída cadastrado neste workspace."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {webhooks.map((wh) => {
              const testRes = testResults[wh.id];
              return (
                <div
                  key={wh.id}
                  style={{
                    padding: 14,
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "var(--bg-surface)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <code style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                          {wh.url}
                        </code>
                        <Badge variant={wh.is_active ? "operational" : "neutral"}>
                          {wh.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      {wh.description && (
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                          {wh.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Button
                        size="xs"
                        variant="outline"
                        prefixIcon={<Send size={12} />}
                        onClick={() => handleTestWebhook(wh.id)}
                        disabled={testingId === wh.id}
                      >
                        {testingId === wh.id ? "Testando..." : "Testar (Ping)"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        prefixIcon={<Trash2 size={13} color="var(--color-danger)" />}
                        onClick={() => handleDeleteWebhook(wh.id)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>

                  {/* Detalhes: Eventos e Segredo */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Eventos:</span>
                      {wh.events.map((ev) => (
                        <Badge key={ev} variant="neutral">
                          {ev}
                        </Badge>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Key size={12} /> Segredo:
                      </span>
                      <code style={{ fontSize: 11, background: "var(--bg-canvas)", padding: "2px 6px", borderRadius: 4 }}>
                        {wh.secret.slice(0, 10)}...
                      </code>
                      <Button
                        size="xs"
                        variant="ghost"
                        prefixIcon={copied === wh.id ? <Check size={12} /> : <Copy size={12} />}
                        onClick={() => copy(wh.id, wh.secret)}
                      >
                        {copied === wh.id ? "Copiado" : "Copiar"}
                      </Button>
                    </div>
                  </div>

                  {/* Feedback de Teste */}
                  {testRes && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontSize: 12,
                        backgroundColor: testRes.success ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        border: testRes.success ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                        color: testRes.success ? "var(--color-success, #10B981)" : "var(--color-danger, #EF4444)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        {testRes.success
                          ? `✓ Destino respondeu HTTP ${testRes.statusCode} com sucesso (${testRes.durationMs}ms)`
                          : `✕ Falha no teste: ${testRes.errorMessage || `HTTP ${testRes.statusCode}`}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ShieldCheck size={14} color="var(--color-primary)" /> Assinatura Criptográfica HMAC SHA-256
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Cada payload enviado pelo Chat Sales inclui o cabeçalho <code>X-ChatSales-Signature-256: sha256=&lt;hash&gt;</code>. Valide esse hash no n8n usando o segredo do webhook para garantir autenticidade e evitar requisições forjadas.
          </p>
        </div>
      </section>

      {/* 3. Instrucoes n8n */}
      <section style={card}>
        <h2 style={title}>
          <ExternalLink size={17} /> Configuração no n8n
        </h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
          <li>
            Para <strong>receber eventos</strong>: crie um node <strong>Webhook</strong> no n8n e cadastre a URL gerada na seção de Webhooks acima.
          </li>
          <li>
            Para <strong>enviar dados / ler candidatos</strong>: use o node <strong>HTTP Request</strong> apontando para os endpoints da API.
          </li>
          <li>Adicione <code>X-Workspace-Id</code> com o identificador do workspace.</li>
          <li>Autentique chamadas à API com <code>Authorization: Bearer</code> usando sua credencial de integração.</li>
        </ol>
      </section>
    </div>
  );
};

const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const title: React.CSSProperties = {
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
  color: "var(--text-primary)",
};

const description: React.CSSProperties = {
  margin: "5px 0 0",
  fontSize: 12,
  color: "var(--text-secondary)",
  lineHeight: 1.55,
};

const CopyRow: FC<{ label: string; value: string; copied: boolean; onCopy: () => void }> = ({
  label,
  value,
  copied,
  onCopy,
}) => (
  <div
    style={{
      padding: 12,
      background: "var(--bg-canvas)",
      borderRadius: 8,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
      <code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{value || "Indisponível"}</code>
    </div>
    <Button
      size="xs"
      variant="ghost"
      prefixIcon={copied ? <Check size={13} /> : <Copy size={13} />}
      onClick={onCopy}
    >
      {copied ? "Copiado" : "Copiar"}
    </Button>
  </div>
);
