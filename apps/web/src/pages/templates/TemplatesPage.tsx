import { useState, useEffect, useCallback, type FC } from "react";
import {
  PageHeader,
  Button,
  Input,
  EmptyState,
  LoadingState,
  SegmentedControl,
} from "@sos-sales/ui";
import { Plus, FileText, Search, Send } from "lucide-react";
import { apiClient, type MessageTemplateSummary } from "../../services/api-client";
import type { UseSessionReturn } from "../../hooks/useSession";
import { CreateTemplateDialog } from "./CreateTemplateDialog";
import { TemplateDetailDialog } from "./TemplateDetailDialog";
import { BroadcastTemplateDialog } from "./BroadcastTemplateDialog";
import { TemplatesTable } from "./TemplatesTable";
import { CampaignsList } from "./CampaignsList";

interface TemplatesPageProps {
  session: UseSessionReturn;
}

export const TemplatesPage: FC<TemplatesPageProps> = ({ session }) => {
  const workspaceId = session.activeWorkspace?.id;
  const token = session.token;

  const [activeTab, setActiveTab] = useState<"TEMPLATES" | "CAMPAIGNS">("TEMPLATES");
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplateSummary | null>(null);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastTemplate, setBroadcastTemplate] = useState<MessageTemplateSummary | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!workspaceId || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getTemplates(workspaceId, {}, { token });
      setTemplates(res.templates || []);
    } catch {
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchName = t.name.toLowerCase().includes(term);
      const matchBody = t.bodyText.toLowerCase().includes(term);
      if (!matchName && !matchBody) return false;
    }
    return true;
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1080px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <PageHeader
          title={activeTab === "TEMPLATES" ? "Modelos WABA" : "Campanhas & Testes A/B"}
          description={
            activeTab === "TEMPLATES"
              ? "Templates oficiais pré-aprovados pela Meta para disparo ativo e reabertura de janelas 24h."
              : "Rastreamento estilo e-mail marketing: entrega, taxas de leitura, respostas e cliques em botões CTA."
          }
          actions={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Button
                size="sm"
                variant={activeTab === "CAMPAIGNS" ? "primary" : "secondary"}
                prefixIcon={<Send size={14} />}
                onClick={() => {
                  setBroadcastTemplate(null);
                  setIsBroadcastOpen(true);
                }}
              >
                Disparo em Massa
              </Button>
              {activeTab === "TEMPLATES" && (
                <Button
                  size="sm"
                  variant="primary"
                  prefixIcon={<Plus size={14} />}
                  onClick={() => setIsCreateOpen(true)}
                >
                  Novo Modelo
                </Button>
              )}
            </div>
          }
        />

        {/* Tab Switch: Modelos vs Campanhas */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <SegmentedControl
            value={activeTab}
            onChange={(val) => setActiveTab(val as typeof activeTab)}
            options={[
              { value: "TEMPLATES", label: `Modelos Homologados (${templates.length})` },
              { value: "CAMPAIGNS", label: "Campanhas & Testes A/B" },
            ]}
          />
        </div>

        {activeTab === "TEMPLATES" ? (
          <>
            {/* Filters Bar */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ maxWidth: "340px", width: "100%" }}>
                <Input
                  placeholder="Buscar por nome ou conteúdo..."
                  prefixIcon={<Search size={16} />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <SegmentedControl
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "ALL", label: `Todos (${templates.length})` },
                  { value: "UTILITY", label: "Utilidade" },
                  { value: "MARKETING", label: "Marketing" },
                ]}
              />
            </div>

            {/* Content Section */}
            {isLoading && templates.length === 0 ? (
              <div style={{ padding: "32px 0" }}>
                <LoadingState variant="skeleton" lines={4} text="Carregando modelos homologados..." />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <EmptyState
                icon={<FileText size={48} />}
                title="Nenhum modelo cadastrado"
                description="Cadastre seu primeiro modelo WABA acima para disparar mensagens fora da janela de 24h Meta."
                action={
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      variant="primary"
                      size="sm"
                      prefixIcon={<Plus size={14} />}
                      onClick={() => setIsCreateOpen(true)}
                    >
                      Cadastrar Modelo
                    </Button>
                  </div>
                }
              />
            ) : (
              <TemplatesTable
                templates={filteredTemplates}
                onSelectPreview={(t) => setPreviewTemplate(t)}
                onSelectBroadcast={(t) => {
                  setBroadcastTemplate(t);
                  setIsBroadcastOpen(true);
                }}
              />
            )}
          </>
        ) : (
          workspaceId && token && (
            <CampaignsList
              workspaceId={workspaceId}
              token={token}
              onOpenNewBroadcast={() => {
                setBroadcastTemplate(null);
                setIsBroadcastOpen(true);
              }}
            />
          )
        )}
      </div>

      {workspaceId && token && (
        <CreateTemplateDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          workspaceId={workspaceId}
          token={token}
          onCreated={fetchTemplates}
        />
      )}

      {workspaceId && token && (
        <BroadcastTemplateDialog
          isOpen={isBroadcastOpen}
          onClose={() => {
            setIsBroadcastOpen(false);
            setBroadcastTemplate(null);
          }}
          workspaceId={workspaceId}
          token={token}
          initialTemplate={broadcastTemplate}
          onBroadcastSuccess={() => {
            fetchTemplates();
            setActiveTab("CAMPAIGNS");
          }}
        />
      )}

      <TemplateDetailDialog
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    </div>
  );
};
