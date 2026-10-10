import { useState, useEffect, useCallback, type FC } from "react";
import {
  Badge,
  Button,
  Input,
  LoadingState,
  EmptyState,
  SegmentedControl,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Send,
  RefreshCw,
  Search,
  CheckCircle2,
  Eye,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Layers,
  Award,
  Clock,
  Radio,
} from "lucide-react";
import {
  apiClient,
  type BroadcastCampaignSummary,
} from "../../services/api-client";

interface CampaignsListProps {
  workspaceId: string;
  token: string;
  onOpenNewBroadcast: () => void;
}

export const CampaignsList: FC<CampaignsListProps> = ({
  workspaceId,
  token,
  onOpenNewBroadcast,
}) => {
  const { isMobile } = useBreakpoint();
  const [campaigns, setCampaigns] = useState<BroadcastCampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "AB_ONLY" | "SINGLE">("ALL");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadCampaigns = useCallback(async () => {
    if (!workspaceId || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getBroadcastCampaigns(workspaceId, { token });
      setCampaigns(res.campaigns || []);
      setLastRefreshedAt(new Date());
    } catch {
      setCampaigns([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    if (filterType === "AB_ONLY" && !c.isAbTest) return false;
    if (filterType === "SINGLE" && c.isAbTest) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchName = c.name.toLowerCase().includes(term);
      const matchTemplate = c.template.name.toLowerCase().includes(term);
      const matchChannel = c.channel.name.toLowerCase().includes(term);
      if (!matchName && !matchTemplate && !matchChannel) return false;
    }
    return true;
  });

  // Calculate aggregated top-line metrics across all campaigns
  const totals = campaigns.reduce(
    (acc, c) => {
      acc.sent += c.metrics.sent;
      acc.delivered += c.metrics.delivered;
      acc.read += c.metrics.read;
      acc.replied += c.metrics.replied;
      acc.clicked += c.metrics.clicked;
      return acc;
    },
    { sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0 }
  );

  const avgDeliveryRate = totals.sent > 0 ? ((totals.delivered / totals.sent) * 100).toFixed(1) : "0.0";
  const avgOpenRate = totals.delivered > 0 ? ((totals.read / totals.delivered) * 100).toFixed(1) : "0.0";
  const avgReplyRate = totals.delivered > 0 ? ((totals.replied / totals.delivered) * 100).toFixed(1) : "0.0";
  const avgCtr = totals.delivered > 0 ? ((totals.clicked / totals.delivered) * 100).toFixed(1) : "0.0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. Header de Ações e Métricas Globais */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
            Última sincronização: {lastRefreshedAt.toLocaleTimeString("pt-BR")}
          </span>
          <Button
            size="sm"
            variant="secondary"
            prefixIcon={<RefreshCw size={12} className={isLoading ? "animate-spin" : undefined} />}
            onClick={loadCampaigns}
            disabled={isLoading}
          >
            Atualizar Métricas
          </Button>
        </div>

        <Button
          size="sm"
          variant="primary"
          prefixIcon={<Send size={14} />}
          onClick={onOpenNewBroadcast}
        >
          Novo Disparo / Teste A/B
        </Button>
      </div>

      {/* 2. Barra de Métricas Estilo E-mail Marketing */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
          gap: "12px",
        }}
      >
        {/* KPI 1: Total Enviadas */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Total Enviadas
            </span>
            <Send size={14} style={{ color: "var(--color-primary)" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {totals.sent}
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            Em {campaigns.length} disparos
          </span>
        </div>

        {/* KPI 2: Taxa de Entrega */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Taxa de Entrega
            </span>
            <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#10b981" }}>
            {avgDeliveryRate}%
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {totals.delivered} de {totals.sent} recebidas
          </span>
        </div>

        {/* KPI 3: Taxa de Abertura / Leitura */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Taxa de Leitura
            </span>
            <Eye size={14} style={{ color: "#3b82f6" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#3b82f6" }}>
            {avgOpenRate}%
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {totals.read} mensagens lidas
          </span>
        </div>

        {/* KPI 4: Taxa de Resposta */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              Taxa de Resposta
            </span>
            <MessageSquare size={14} style={{ color: "#8b5cf6" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#8b5cf6" }}>
            {avgReplyRate}%
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {totals.replied} contatos responderam
          </span>
        </div>

        {/* KPI 5: CTR de Botões CTA */}
        <div
          style={{
            padding: "14px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
              CTR de Botões
            </span>
            <TrendingUp size={14} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f59e0b" }}>
            {avgCtr}%
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {totals.clicked} cliques em botões CTA
          </span>
        </div>
      </div>

      {/* 3. Filtros da Lista */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ maxWidth: "340px", width: "100%" }}>
          <Input
            placeholder="Buscar por nome, modelo ou canal..."
            prefixIcon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <SegmentedControl
          value={filterType}
          onChange={(v) => setFilterType(v as typeof filterType)}
          options={[
            { value: "ALL", label: `Todas (${campaigns.length})` },
            { value: "AB_ONLY", label: "Testes A/B (50/50)" },
            { value: "SINGLE", label: "Disparos Simples" },
          ]}
        />
      </div>

      {/* 4. Lista de Campanhas & Detalhes A/B */}
      {isLoading && campaigns.length === 0 ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingState variant="skeleton" lines={4} text="Carregando campanhas e telemetria de disparos..." />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <EmptyState
          icon={<Send size={48} />}
          title="Nenhuma campanha encontrada"
          description="Você ainda não realizou disparos ativos com rastreamento neste workspace. Inicie sua primeira campanha ou teste A/B."
          action={
            <Button variant="primary" size="sm" prefixIcon={<Send size={14} />} onClick={onOpenNewBroadcast}>
              Novo Disparo em Massa
            </Button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredCampaigns.map((camp) => {
            const formattedDate = new Date(camp.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={camp.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border-default)",
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  boxShadow: "var(--shadow-sm)",
                  transition: "border-color 0.15s ease",
                }}
              >
                {/* Top Header do Card da Campanha */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {camp.name}
                      </h4>
                      {camp.isAbTest ? (
                        <Badge variant="warning">
                          <Layers size={11} style={{ marginRight: "3px" }} /> Teste A/B (50/50)
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Disparo Simples</Badge>
                      )}
                      <Badge variant="action">
                        <CheckCircle2 size={11} style={{ marginRight: "3px" }} /> Concluído
                      </Badge>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} /> {formattedDate}
                      </span>
                      <span>·</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Radio size={12} /> {camp.channel.name}
                      </span>
                      <span>·</span>
                      <span>Público: <strong>{camp.audienceType === "ALL_CONTACTS" ? "Todos Ativos" : camp.audienceType === "BY_STAGE" ? `Estágio ${camp.audienceStage}` : "Lista Manual"}</strong></span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Base Impactada</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {camp.metrics.sent} contatos
                    </span>
                  </div>
                </div>

                {/* Funil Visual de Entrega e Conversão */}
                <div
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)",
                    gap: "12px",
                  }}
                >
                  {/* Etapa 1: Enviados */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      1. Enviadas
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {camp.metrics.sent}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>100% da fila</span>
                  </div>

                  {/* Etapa 2: Entregues */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      2. Entregues
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981" }}>
                      {camp.metrics.delivered}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: 600 }}>
                      {camp.metrics.deliveryRate}% taxa entrega
                    </span>
                  </div>

                  {/* Etapa 3: Lidos */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      3. Lidas (Abertas)
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#3b82f6" }}>
                      {camp.metrics.read}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#3b82f6", fontWeight: 600 }}>
                      {camp.metrics.openRate}% taxa leitura
                    </span>
                  </div>

                  {/* Etapa 4: Respostas */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      4. Respondidas
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#8b5cf6" }}>
                      {camp.metrics.replied}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#8b5cf6", fontWeight: 600 }}>
                      {camp.metrics.replyRate}% conversão
                    </span>
                  </div>

                  {/* Etapa 5: Cliques CTA */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      5. Cliques Botão
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: "#f59e0b" }}>
                      {camp.metrics.clicked}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "#f59e0b", fontWeight: 600 }}>
                      {camp.metrics.ctr}% CTR
                    </span>
                  </div>
                </div>

                {/* Seção Exclusiva de Teste A/B: Comparador Lado a Lado e Vencedor */}
                {camp.isAbTest && camp.abReport && (
                  <div
                    style={{
                      borderTop: "1px dashed var(--border-subtle)",
                      paddingTop: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Sparkles size={14} color="#8b5cf6" />
                        Relatório Comparativo do Teste A/B (50% vs 50%)
                      </span>

                      {camp.abReport.winner !== "TIED" ? (
                        <div
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "rgba(245, 158, 11, 0.15)",
                            border: "1px solid #f59e0b",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--font-size-xs)",
                            fontWeight: 700,
                            color: "#d97706",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Award size={14} /> Variante Vencedora: Variante {camp.abReport.winner}
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "4px 10px",
                            backgroundColor: "var(--bg-canvas)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--font-size-xs)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Empate técnico entre as variantes
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                      {/* Card Variante A */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: camp.abReport.winner === "A" ? "rgba(16, 185, 129, 0.05)" : "var(--bg-canvas)",
                          border: camp.abReport.winner === "A" ? "2px solid #10b981" : "1px solid var(--border-default)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                            Variante A (50%)
                          </span>
                          {camp.abReport.winner === "A" && (
                            <Badge variant="action">
                              <Award size={11} style={{ marginRight: "3px" }} /> Melhor Copy
                            </Badge>
                          )}
                        </div>

                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          Modelo: <strong>{camp.abReport.variantA.templateName}</strong> ({camp.abReport.variantA.category})
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Leitura</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>
                              {camp.abReport.variantA.openRate}%
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{camp.abReport.variantA.read} lidas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Resposta</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#8b5cf6" }}>
                              {camp.abReport.variantA.replyRate}%
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{camp.abReport.variantA.replied} respostas</span>
                          </div>
                        </div>
                      </div>

                      {/* Card Variante B */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "var(--radius-md)",
                          backgroundColor: camp.abReport.winner === "B" ? "rgba(16, 185, 129, 0.05)" : "var(--bg-canvas)",
                          border: camp.abReport.winner === "B" ? "2px solid #10b981" : "1px solid var(--border-default)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                            Variante B (50%)
                          </span>
                          {camp.abReport.winner === "B" && (
                            <Badge variant="action">
                              <Award size={11} style={{ marginRight: "3px" }} /> Melhor Copy
                            </Badge>
                          )}
                        </div>

                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                          Modelo: <strong>{camp.abReport.variantB.templateName}</strong> ({camp.abReport.variantB.category})
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Leitura</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>
                              {camp.abReport.variantB.openRate}%
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{camp.abReport.variantB.read} lidas</span>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Taxa de Resposta</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#8b5cf6" }}>
                              {camp.abReport.variantB.replyRate}%
                            </span>
                            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{camp.abReport.variantB.replied} respostas</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
