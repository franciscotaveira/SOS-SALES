/**
 * SOS Sales V3 — CockpitPage (MCT OS v2.0)
 * Aligned with official design board (Light theme default, Dark Navy sidebar, Inter + Mono typography).
 * Implements Truth in Data: zero simulated conversations, honest state handling.
 */

import { useState, type FC } from "react";
import {
  Button,
  Input,
  Badge,
  Alert,
  EmptyState,
  LoadingState,
  Drawer,
} from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import {
  Search,
  MessageSquare,
  Building2,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

interface CockpitPageProps {
  session: UseSessionReturn;
  onOpenCatalog?: () => void;
}

export const CockpitPage: FC<CockpitPageProps> = ({ session }) => {
  const {
    activeWorkspace,
    activeWorkspaceDetails,
    isLoadingMe,
    isLoadingWorkspace,
    error,
    refreshWorkspace,
    refreshSession,
  } = session;

  const [queueFilter, setQueueFilter] = useState<"all" | "open" | "closed">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDossierDrawerOpen, setIsDossierDrawerOpen] = useState(false);

  // 1. Tratamento de Estados de Erro Críticos
  if (error) {
    if (error.type === "auth") {
      const isLab = import.meta.env.VITE_ENABLE_LAB_TOOLS === "true";
      return (
        <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
          <Alert
            variant="danger"
            title="Autenticação Necessária (401)"
            action={
              isLab ? (
                <Button size="sm" variant="danger" onClick={refreshSession}>
                  Reconectar
                </Button>
              ) : undefined
            }
          >
            {error.detail ||
              (isLab
                ? "Sessão não autorizada ou token expirado. Insira um token Bearer válido na barra de laboratório acima."
                : "Sessão expirada ou não autorizada. O acesso ao cockpit aguarda nova configuração de credenciais.")}
          </Alert>
        </div>
      );
    }

    if (error.type === "forbidden") {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "640px", margin: "0 auto" }}>
          <EmptyState
            icon={<ShieldCheck size={36} color="var(--color-danger, #DC2626)" />}
            title="Acesso Negado ao Workspace (403)"
            description={error.detail || "Você não possui permissão para visualizar este workspace."}
            action={
              <Button variant="secondary" onClick={refreshSession}>
                Voltar à Lista de Workspaces
              </Button>
            }
          />
        </div>
      );
    }

    if (error.type === "membership") {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "640px", margin: "0 auto" }}>
          <EmptyState
            icon={<Building2 size={36} color="var(--color-warning, #D97706)" />}
            title="Nenhum Workspace Vinculado"
            description="Sua identidade foi autenticada, mas você ainda não é membro de nenhuma organização comercial."
            action={
              <Button variant="primary" onClick={refreshSession}>
                Verificar Novamente
              </Button>
            }
          />
        </div>
      );
    }

    if (error.type === "network") {
      return (
        <div style={{ padding: "48px 24px", maxWidth: "600px", margin: "0 auto" }}>
          <Alert
            variant="danger"
            title="Falha de Conectividade com a API"
            action={
              <Button
                size="sm"
                variant="danger"
                prefixIcon={<RefreshCw size={14} />}
                onClick={refreshWorkspace}
              >
                Tentar Conectar
              </Button>
            }
          >
            {error.detail}
          </Alert>
        </div>
      );
    }
  }

  // 2. Loading da Sessão Inicial
  if (isLoadingMe && !activeWorkspace) {
    return (
      <div style={{ padding: "48px 24px", maxWidth: "900px", margin: "0 auto" }}>
        <LoadingState variant="skeleton" lines={6} text="Conectando à API Fastify e carregando permissões..." />
      </div>
    );
  }

  // 3. Estado Desconectado / Não Autenticado (Truth in Data)
  if (!session.user && !isLoadingMe) {
    const isLab = import.meta.env.VITE_ENABLE_LAB_TOOLS === "true";
    return (
      <div style={{ padding: "64px 24px", maxWidth: "600px", margin: "0 auto" }}>
        <EmptyState
          icon={<ShieldCheck size={40} color="var(--color-operational, #2563EB)" />}
          title="Nenhuma Sessão Ativa"
          description={
            isLab
              ? "O cockpit comercial opera com isolamento multi-tenant estrito (RLS). Insira um token Bearer válido na barra de laboratório acima para carregar sua organização."
              : "O cockpit comercial opera com autenticação protegida. O acesso ao cockpit aguarda a configuração de credenciais da sua organização."
          }
          action={
            isLab ? (
              <Button variant="outline" onClick={refreshSession}>
                Recarregar Sessão
              </Button>
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "var(--radius-sm, 6px)",
                  backgroundColor: "var(--bg-subtle, #F1F5F9)",
                  border: "1px solid var(--border-default, #E2E8F0)",
                  color: "var(--text-muted, #64748B)",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Acesso aguardando configuração
              </div>
            )
          }
        />
      </div>
    );
  }

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
      {/* Sub-header de Contexto Operacional */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Workspace: {activeWorkspace ? activeWorkspace.name : "Nenhum selecionado"}
          </span>
          <Badge variant={activeWorkspace ? "action" : "neutral"} pulseDot={!!activeWorkspace}>
            {activeWorkspace ? "Tenant Conectado" : "Aguardando Seleção"}
          </Badge>
          {activeWorkspaceDetails?.workspace && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                color: "var(--text-muted, #94A3B8)",
              }}
            >
              Fuso: {activeWorkspaceDetails.workspace.timezone} • Moeda: {activeWorkspaceDetails.workspace.currency}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            onClick={() => setIsDossierDrawerOpen(true)}
            style={{
              background: "none",
              border: "1px solid var(--border-default, #E2E8F0)",
              borderRadius: "var(--radius-sm, 6px)",
              padding: "4px 8px",
              fontSize: "0.75rem",
              color: "var(--text-secondary, #475569)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <SlidersHorizontal size={12} />
            Dossiê & Permissões
          </button>
        </div>
      </div>

      {/* Grid Principal Tripartite (Bounded Containers) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr 340px",
          flex: 1,
          overflow: "hidden",
        }}
        className="sos-cockpit-grid"
      >
        {/* Coluna 1: Fila de Atendimento (Queue) */}
        <section
          aria-label="Fila de Atendimento"
          style={{
            borderRight: "1px solid var(--border-default, #E2E8F0)",
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Header da Fila com Busca */}
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border-subtle, #F1F5F9)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F172A)" }}>
                Fila de Atendimento
              </h2>
              <Badge variant="neutral">0 Ativas</Badge>
            </div>

            <Input
              placeholder="Buscar por telefone ou nome..."
              prefixIcon={<Search size={14} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: "0.85rem", height: "36px" }}
            />

            {/* Filtros da Fila */}
            <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
              {(["open", "all", "closed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setQueueFilter(f)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "none",
                    backgroundColor:
                      queueFilter === f ? "var(--color-operational-subtle, #EFF6FF)" : "transparent",
                    color:
                      queueFilter === f
                        ? "var(--color-operational, #2563EB)"
                        : "var(--text-secondary, #475569)",
                    cursor: "pointer",
                  }}
                >
                  {f === "open" ? "Abertas" : f === "all" ? "Todas" : "Pausadas"}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Chats: Truth in Data (Zero mock chats em produção) */}
          <div style={{ flex: 1, padding: "24px 16px" }}>
            <EmptyState
              icon={<MessageSquare size={28} />}
              title="Sem Conversas na Fila"
              description="Nenhum atendimento aberto para este workspace. Mensagens recebidas no WhatsApp aparecerão aqui."
            />
          </div>
        </section>

        {/* Coluna 2: Área Central de Conversa / Cockpit */}
        <section
          aria-label="Área de Conversa Ativa"
          style={{
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "24px",
            borderRight: "1px solid var(--border-default, #E2E8F0)",
            textAlign: "center",
          }}
        >
          {isLoadingWorkspace ? (
            <div style={{ width: "100%", maxWidth: "480px" }}>
              <LoadingState variant="skeleton" lines={5} text="Carregando dados do workspace..." />
            </div>
          ) : (
            <div
              style={{
                maxWidth: "480px",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                padding: "36px 24px",
                borderRadius: "var(--radius-lg, 12px)",
                border: "1px solid var(--border-default, #E2E8F0)",
                boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-action-subtle, #E6F7F3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px auto",
                  color: "var(--color-action, #00A884)",
                }}
              >
                <MessageSquare size={28} />
              </div>

              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary, #0F172A)", marginBottom: "8px" }}>
                Atendimento Selecionado
              </h3>
              <p style={{ color: "var(--text-secondary, #475569)", fontSize: "0.9rem", marginBottom: "20px" }}>
                Selecione um contato na fila à esquerda para visualizar as mensagens, dossiê do lead e acionar o copiloto de IA.
              </p>

              <div
                style={{
                  backgroundColor: "var(--bg-canvas, #F8FAFC)",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md, 8px)",
                  fontSize: "0.8rem",
                  color: "var(--text-secondary, #475569)",
                  border: "1px solid var(--border-subtle, #F1F5F9)",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)", marginBottom: "4px" }}>
                  Módulo de Mensageria (Iteração 4)
                </div>
                <div>
                  Integração via Evolution API e pipeline RAG para geração de respostas com guardrails.
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Coluna 3: Dossiê e Informações do Workspace */}
        <aside
          aria-label="Dossiê do Workspace e Contato"
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            padding: "20px",
            gap: "24px",
          }}
        >
          {/* Card: Metadados do Workspace Conectado */}
          <div>
            <h3
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: "var(--text-primary, #0F172A)",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Building2 size={16} color="var(--color-operational, #2563EB)" />
              Contexto do Workspace
            </h3>

            {isLoadingWorkspace ? (
              <LoadingState variant="skeleton" lines={4} />
            ) : activeWorkspaceDetails ? (
              <div
                style={{
                  backgroundColor: "var(--bg-canvas, #F8FAFC)",
                  padding: "14px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: "1px solid var(--border-default, #E2E8F0)",
                  fontSize: "0.8rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted, #94A3B8)" }}>Nome:</span>
                  <strong style={{ color: "var(--text-primary, #0F172A)" }}>
                    {activeWorkspaceDetails.workspace.name}
                  </strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted, #94A3B8)" }}>ID:</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    {activeWorkspaceDetails.workspace.id.substring(0, 8)}...
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted, #94A3B8)" }}>Papel do Usuário:</span>
                  <Badge variant="operational">{activeWorkspaceDetails.userRole}</Badge>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted, #94A3B8)" }}>Fuso Horário:</span>
                  <span>{activeWorkspaceDetails.workspace.timezone}</span>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted, #94A3B8)", fontSize: "0.8rem" }}>
                Nenhum detalhe disponível.
              </p>
            )}
          </div>

          {/* Card: Permissões Efetivas do Usuário */}
          {activeWorkspaceDetails && (
            <div>
              <h3
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "var(--text-primary, #0F172A)",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <ShieldCheck size={16} color="var(--color-action, #00A884)" />
                Permissões Ativas
              </h3>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {activeWorkspaceDetails.permissions.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.7rem",
                      padding: "2px 6px",
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
          )}

          {/* Card: Status de Integração Comercial (Honesto) */}
          <div
            style={{
              padding: "14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px dashed var(--border-strong, #CBD5E1)",
              backgroundColor: "var(--bg-canvas, #F8FAFC)",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)", marginBottom: "4px" }}>
              Dossiê & Histórico de Compras
            </div>
            <p style={{ color: "var(--text-secondary, #475569)", fontSize: "0.75rem", lineHeight: 1.4 }}>
              Módulo de dados do cliente e integração de pagamentos pendente de especificação na próxima sprint.
            </p>
          </div>
        </aside>
      </div>

      {/* Drawer com Detalhes do Dossiê para Telas Menores */}
      <Drawer
        isOpen={isDossierDrawerOpen}
        onClose={() => setIsDossierDrawerOpen(false)}
        title="Dossiê do Workspace"
        description="Configurações e permissões ativas do tenant selecionado."
        footer={
          <Button variant="secondary" onClick={() => setIsDossierDrawerOpen(false)}>
            Fechar
          </Button>
        }
      >
        {activeWorkspaceDetails && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "0.85rem" }}>
            <div>
              <strong>Tenant ID:</strong>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", marginTop: "4px" }}>
                {activeWorkspaceDetails.workspace.id}
              </div>
            </div>
            <div>
              <strong>Papel:</strong> {activeWorkspaceDetails.userRole}
            </div>
            <div>
              <strong>Permissões:</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {activeWorkspaceDetails.permissions.map((p) => (
                  <Badge key={p} variant="operational">{p}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
