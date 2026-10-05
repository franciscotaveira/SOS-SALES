import { useState, type FC } from "react";
import { Alert, Badge, Button } from "@sos-sales/ui";
import { Braces, Check, Copy, ExternalLink, Webhook } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";

export const IntegrationsSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const workspaceId = session.activeWorkspace?.id || "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };
  const endpoints = [
    { method: "GET", path: `/v1/workspaces/${workspaceId}/integrations/candidates`, use: "Ler conversas candidatas para uma automação." },
    { method: "POST", path: `/v1/workspaces/${workspaceId}/integrations/suggestions`, use: "Devolver uma sugestão governada ao Radar." },
    { method: "POST", path: `/v1/workspaces/${workspaceId}/integrations/radar/scan`, use: "Executar a análise nativa sob demanda." },
  ];
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div><h2 style={title}><Braces size={17}/> API de Integrações</h2>
          <p style={description}>Conecte n8n, sistemas internos ou agentes ao Chat Sales sem entregar controle direto do WhatsApp.</p></div>
        <Badge variant="action">API disponível</Badge>
      </div>
      <Alert variant="info" title="Como funciona">
        O sistema externo lê candidatos e devolve sugestões. O operador revisa no Radar antes de qualquer mensagem ser enviada.
      </Alert>
      <CopyRow label="URL base" value={baseUrl} copied={copied === "base"} onCopy={() => copy("base", baseUrl)}/>
      <CopyRow label="Workspace" value={workspaceId} copied={copied === "workspace"} onCopy={() => copy("workspace", workspaceId)}/>
      <div style={{ display: "grid", gap: 8 }}>
        {endpoints.map((item) => <div key={item.path} style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge variant={item.method === "GET" ? "operational" : "ai"}>{item.method}</Badge><code style={{ fontSize: 11, overflowWrap: "anywhere" }}>{item.path}</code></div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>{item.use}</div>
        </div>)}
      </div>
    </section>
    <section style={card}>
      <h2 style={title}><ExternalLink size={17}/> Configuração no n8n</h2>
      <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        <li>Use o node <strong>HTTP Request</strong>.</li>
        <li>Informe a URL base e um dos endpoints acima.</li>
        <li>Adicione <code>X-Workspace-Id</code> com o identificador do workspace.</li>
        <li>Autentique com <code>Authorization: Bearer</code> usando uma credencial de integração dedicada.</li>
        <li>Valide primeiro em leitura; sugestões não enviam WhatsApp automaticamente.</li>
      </ol>
      <Alert variant="warning" title="Credencial dedicada ainda não é autogerenciável">
        A API está operacional, mas a criação e revogação de chaves ainda exige configuração administrativa. Não use o token de login pessoal em automações permanentes.
      </Alert>
    </section>
    <section style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div><h2 style={title}><Webhook size={17}/> Webhooks de saída</h2>
          <p style={description}>Avisos para outro sistema quando surgir lead, mensagem, proposta, pagamento ou mudança de etapa.</p></div>
        <Badge variant="warning">Em implementação</Badge>
      </div>
      <p style={{ ...description, margin: 0 }}>A entrada de WhatsApp já usa webhooks protegidos. A assinatura de destinos externos ainda precisa de segredo, tentativas automáticas, histórico, reenvio e proteção contra duplicidade antes de ser liberada.</p>
    </section>
  </div>;
};

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 20, display: "flex", flexDirection: "column", gap: 16 };
const title: React.CSSProperties = { margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: "var(--text-primary)" };
const description: React.CSSProperties = { margin: "5px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 };
const CopyRow: FC<{ label: string; value: string; copied: boolean; onCopy: () => void }> = ({ label, value, copied, onCopy }) => <div style={{ padding: 12, background: "var(--bg-canvas)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
  <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div><code style={{ fontSize: 12, overflowWrap: "anywhere" }}>{value || "Indisponível"}</code></div>
  <Button size="xs" variant="ghost" prefixIcon={copied ? <Check size={13}/> : <Copy size={13}/>} onClick={onCopy}>{copied ? "Copiado" : "Copiar"}</Button>
</div>;
