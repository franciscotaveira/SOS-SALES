import { type FC, useState, useEffect } from "react";
import { Drawer, EmptyState, useBreakpoint } from "@sos-sales/ui";
import { MessageSquare } from "lucide-react";
import { useSession, type UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type CommercialProposalSummary } from "../../services/api-client";
import { useInbox } from "./hooks/useInbox";
import { useConversation } from "./hooks/useConversation";
import { useCockpitLayout } from "./hooks/useCockpitLayout";
import { InboxList } from "./InboxList/InboxList";
import { ConversationHeader } from "./Conversation/ConversationHeader";
import { MessageList } from "./Conversation/MessageList";
import { Composer } from "./Conversation/Composer";
import { ContextPanel } from "./ContextPanel/ContextPanel";
import { CockpitDrawers, type DrawerType } from "./drawers/CockpitDrawers";
import { panelFrame, PANEL_GAP } from "./utils/panelFrame";

interface CockpitPageProps {
  session?: UseSessionReturn;
}

export const CockpitPage: FC<CockpitPageProps> = ({ session: propSession }) => {
  const fallbackSession = useSession(null);
  const session = propSession || fallbackSession;
  const { isMobile, isTablet } = useBreakpoint();
  const layout = useCockpitLayout();
  const inbox = useInbox(session);
  const conversation = useConversation(layout.selectedThreadId, session, inbox.threads, inbox.refreshThreads);

  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [proposals, setProposals] = useState<CommercialProposalSummary[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);

  useEffect(() => {
    if (!layout.selectedThreadId || !session.activeWorkspace?.id || !session.token) {
      setProposals([]);
      return;
    }
    apiClient
      .getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token })
      .then((res) => setProposals(res.items || []))
      .catch(() => setProposals([]));
  }, [layout.selectedThreadId, session.activeWorkspace?.id, session.token]);

  const handleUpdateProposalStatus = async (proposalId: string, status: CommercialProposalSummary["status"]) => {
    if (!session.activeWorkspace?.id || !session.token) return;
    setProposalError(null);
    try {
      await apiClient.patchProposalStatus(session.activeWorkspace.id, proposalId, { status }, { token: session.token });
      if (layout.selectedThreadId) {
        const res = await apiClient.getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token });
        setProposals(res.items || []);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      setProposalError(msg.includes("409") ? "A proposta foi alterada por outra pessoa — recarregue a página." : msg || "Falha ao atualizar proposta.");
    }
  };

  const isThreadActive = Boolean(layout.selectedThreadId && conversation.selectedThread);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden", backgroundColor: "var(--bg-canvas)", gap: isMobile ? 0 : PANEL_GAP, padding: isMobile ? 0 : PANEL_GAP, boxSizing: "border-box" }}>
      {/* 1. Inbox List Panel */}
      {(!isMobile || !isThreadActive) && (
        <InboxList
          threads={inbox.filteredThreads}
          selectedThreadId={layout.selectedThreadId}
          onSelectThread={layout.setSelectedThreadId}
          queueFilter={inbox.queueFilter}
          onQueueFilterChange={inbox.setQueueFilter}
          searchQuery={inbox.searchQuery}
          onSearchQueryChange={inbox.setSearchQuery}
          isCollapsed={layout.isLeftCollapsed}
          onToggleCollapse={layout.toggleLeft}
          activeChannel={inbox.activeChannel}
          isMobile={isMobile}
        />
      )}

      {/* 2. Conversation / Empty State Area */}
      {(!isMobile || isThreadActive) && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0, backgroundColor: "var(--bg-surface)", ...panelFrame(isMobile) }}>
          {conversation.selectedThread ? (
            <>
              <ConversationHeader
                thread={conversation.selectedThread}
                onBack={layout.handleBackToList}
                isMobile={isMobile}
                onRefresh={async () => {
                  await Promise.all([conversation.refreshMessages(), inbox.refreshThreads()]);
                }}
                isRefreshing={conversation.isLoadingMessages}
                onOpenRadar={() => setActiveDrawer("radar")}
                onOpenDossier={() => setActiveDrawer("dossier")}
                onToggleContext={() => isMobile || isTablet ? layout.setIsContextDrawerOpen(!layout.isContextDrawerOpen) : layout.toggleRight()}
                isContextOpen={!layout.isRightCollapsed || layout.isContextDrawerOpen}
              />
              <MessageList messages={conversation.messages} isLoading={conversation.isLoadingMessages} />
              <Composer
                draft={conversation.messageInput}
                onDraftChange={conversation.handleMessageInputChange}
                attachedFile={conversation.attachedFile}
                onAttachFile={conversation.setAttachedFile}
                onSend={conversation.handleSendMessage}
                isSending={conversation.isSendingMessage}
                windowInfo={conversation.windowInfo}
                onOpenTemplates={() => setActiveDrawer("template")}
                onOpenCatalog={() => setActiveDrawer("catalog")}
                onOpenFlows={() => setActiveDrawer("flow")}
                onOpenPix={() => setActiveDrawer("pix")}
                isMobile={isMobile}
              />
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-6, 24px)" }}>
              <EmptyState
                icon={<MessageSquare size={48} />}
                title="Selecione uma conversa"
                description="Escolha um lead na fila de atendimento à esquerda para iniciar o atendimento comercial."
              />
            </div>
          )}
        </main>
      )}

      {/* 3. Context Panel (Desktop Inline, Tablet / Mobile in Drawer) */}
      {!isMobile && !isTablet && !layout.isRightCollapsed && conversation.selectedThread && (
        <ContextPanel
          thread={conversation.selectedThread}
          onClose={layout.toggleRight}
          proposals={proposals}
          onCreateProposal={() => setActiveDrawer("proposal")}
          onUpdateProposalStatus={handleUpdateProposalStatus}
          proposalError={proposalError}
          onGeneratePix={() => setActiveDrawer("pix")}
        />
      )}

      {(isMobile || isTablet) && conversation.selectedThread && (
        <Drawer
          isOpen={layout.isContextDrawerOpen}
          onClose={() => layout.setIsContextDrawerOpen(false)}
          title="Contexto do Lead"
          position={isMobile ? "bottom" : "right"}
        >
          <ContextPanel
            thread={conversation.selectedThread}
            onClose={() => layout.setIsContextDrawerOpen(false)}
            proposals={proposals}
            onCreateProposal={() => setActiveDrawer("proposal")}
            onUpdateProposalStatus={handleUpdateProposalStatus}
            proposalError={proposalError}
            onGeneratePix={() => setActiveDrawer("pix")}
            isMobile={true}
          />
        </Drawer>
      )}

      <CockpitDrawers
        activeDrawer={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        selectedThread={conversation.selectedThread}
        session={session}
        onTemplateSent={conversation.refreshMessages}
        onProposalCreated={() => {
          if (layout.selectedThreadId && session.activeWorkspace?.id && session.token) {
            apiClient.getThreadProposals(session.activeWorkspace.id, layout.selectedThreadId, { token: session.token })
              .then((res) => setProposals(res.items || []));
          }
        }}
        onPixCreated={conversation.refreshMessages}
        onRadarDraftApplied={(draft) => conversation.handleMessageInputChange(draft)}
      />
    </div>
  );
};

export default CockpitPage;
