import { useEffect, useState, type FC } from "react";
import { Drawer, Button, Badge, LoadingState } from "@sos-sales/ui";
import { Check, X, RefreshCw, Radar } from "lucide-react";
import { apiClient, type IntegrationSuggestionSummary } from "../../../services/api-client";

interface RadarDrawerProps {
  isOpen: boolean; onClose: () => void; workspaceId?: string; token?: string;
  threadId?: string; onDraftApplied?: (draft: string) => void;
}

export const RadarDrawer: FC<RadarDrawerProps> = ({ isOpen, onClose, workspaceId, token, threadId, onDraftApplied }) => {
  const [suggestions, setSuggestions] = useState<IntegrationSuggestionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!workspaceId || !token) return;
    setIsLoading(true); setError(null);
    try {
      const result = await apiClient.getIntegrationSuggestions(workspaceId, { status: "pending", threadId, limit: 50 }, { token });
      setSuggestions(result.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o Radar.");
    } finally { setIsLoading(false); }
  };

  useEffect(() => { if (isOpen) void load(); }, [isOpen, workspaceId, token, threadId]);

  const scan = async () => {
    if (!workspaceId || !token) return;
    setIsScanning(true); setError(null);
    try {
      const result = await apiClient.scanRadar(workspaceId, { minHoursSinceLastMessage: 12, limit: 1, threadId }, { token });
      setEnabled(result.enabled);
      if (!result.enabled) { setError("O Radar está desativado para este workspace."); return; }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar as conversas.");
    } finally { setIsScanning(false); }
  };

  const decide = async (suggestion: IntegrationSuggestionSummary, status: "accepted" | "dismissed") => {
    if (!workspaceId || !token) return;
    setError(null);
    try {
      const result = await apiClient.decideIntegrationSuggestion(workspaceId, suggestion.id, { status, stateVersion: suggestion.stateVersion }, { token });
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      if (status === "accepted" && result.draftMessage) { onDraftApplied?.(result.draftMessage); onClose(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "A sugestão foi alterada. Atualize o Radar.");
      await load();
    }
  };

  return <Drawer isOpen={isOpen} onClose={onClose} title="Radar de Oportunidades"
    description="Analisa conversas paradas e clientes aguardando retorno. Nenhuma mensagem é enviada sem sua aprovação."
    footer={<div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
      <Button size="sm" variant="secondary" prefixIcon={<RefreshCw size={14}/>} onClick={scan} disabled={isScanning || isLoading}>{isScanning ? "Analisando..." : "Analisar agora"}</Button>
      <Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>
    </div>}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
      {error && <div role="alert" style={{ padding: 12, borderRadius: 8, color: "var(--color-danger)", background: "var(--color-danger-subtle)", fontSize: 13 }}>{error}</div>}
      {isLoading ? <LoadingState variant="skeleton" lines={3} text="Consultando oportunidades..." />
      : suggestions.length === 0 ? <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)" }}>
          <Radar size={36} style={{ marginBottom: 10 }}/>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Nenhuma sugestão pendente</div>
          <div style={{ fontSize: 13 }}>{enabled === false ? "O módulo precisa ser ativado nas configurações." : "Clique em “Analisar agora” para examinar as conversas paradas há pelo menos 12 horas."}</div>
        </div>
      : suggestions.map((sug) => <div key={sug.id} style={{ padding: 14, background: "var(--bg-canvas)", border: "1px solid var(--border-default)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 14 }}>{sug.title}</strong><Badge variant={sug.priority === "high" || sug.priority === "urgent" ? "warning" : "ai"}>{sug.priority === "high" ? "Prioridade" : "Sugestão"}</Badge></div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{sug.body}</p>
          {sug.draftMessage && <div style={{ padding: 10, background: "var(--bg-surface)", borderRadius: 8, fontSize: 13 }}><div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Rascunho sugerido</div>{sug.draftMessage}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button size="xs" variant="ghost" prefixIcon={<X size={12}/>} onClick={() => decide(sug, "dismissed")}>Ignorar</Button>
            <Button size="xs" variant="primary" prefixIcon={<Check size={12}/>} onClick={() => decide(sug, "accepted")}>Usar rascunho</Button>
          </div>
        </div>)}
    </div>
  </Drawer>;
};
