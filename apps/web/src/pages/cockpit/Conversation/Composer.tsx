import { type FC, type KeyboardEvent, useRef } from "react";
import { Button, IconButton } from "@sos-sales/ui";
import { Send, Paperclip, FileCode, ShoppingBag, Workflow, QrCode } from "lucide-react";
import type { WindowInfo } from "../hooks/useConversation";

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
  windowInfo: WindowInfo;
  onOpenTemplates: () => void;
  onOpenCatalog?: () => void;
  onOpenFlows?: () => void;
  onOpenPix?: () => void;
  isMobile?: boolean;
}

export const Composer: FC<ComposerProps> = ({
  draft,
  onDraftChange,
  onSend,
  isSending,
  windowInfo,
  onOpenTemplates,
  onOpenCatalog,
  onOpenFlows,
  onOpenPix,
  isMobile = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isWindowClosed = !windowInfo.isOpen;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim() && !isSending && !isWindowClosed) {
        onSend();
      }
    }
  };

  const handleTextChange = (val: string) => {
    onDraftChange(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 140);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  };

  return (
    <footer
      style={{
        backgroundColor: "var(--bg-surface)",
        borderTop: "1px solid var(--border-default)",
        padding: "var(--space-3, 12px) var(--space-4, 16px)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        boxSizing: "border-box",
      }}
    >
      {/* Quick Action Tools Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <Button
          size="xs"
          variant={isWindowClosed ? "primary" : "secondary"}
          prefixIcon={<FileCode size={14} />}
          onClick={onOpenTemplates}
          title="Selecionar ou disparar modelo Meta Cloud API"
        >
          Modelo
        </Button>
        {onOpenCatalog && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<ShoppingBag size={14} />}
            onClick={onOpenCatalog}
            title="Catálogo de Produtos"
          >
            Catálogo
          </Button>
        )}
        {onOpenFlows && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<Workflow size={14} />}
            onClick={onOpenFlows}
            title="Formulários nativos WhatsApp"
          >
            Flow
          </Button>
        )}
        {onOpenPix && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<QrCode size={14} />}
            onClick={onOpenPix}
            title="Gerar Cobrança Instantânea Pix"
          >
            Pix
          </Button>
        )}
      </div>

      {/* Main Composer Input Area */}
      {isWindowClosed ? (
        <div
          style={{
            backgroundColor: "var(--bg-canvas)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "var(--space-3, 12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: isMobile ? "16px" : "var(--font-size-sm, 0.875rem)",
              color: "var(--text-secondary)",
            }}
          >
            Janela de 24h fechada — só modelos aprovados
          </span>
          <Button size="sm" variant="primary" onClick={onOpenTemplates}>
            Enviar Modelo
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
          <IconButton
            aria-label="Anexar arquivo"
            icon={<Paperclip size={18} />}
            size="sm"
            variant="ghost"
            tooltip="Anexar arquivo"
          />

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escrever mensagem..."
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              minHeight: "36px",
              maxHeight: "140px",
              padding: "8px 12px",
              fontSize: isMobile ? "16px" : "var(--font-size-base, 1rem)",
              lineHeight: "1.4",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />

          <Button
            size="sm"
            variant="primary"
            disabled={!draft.trim() || isSending}
            onClick={onSend}
            prefixIcon={<Send size={15} />}
            title="Enviar mensagem (Enter)"
          >
            Enviar
          </Button>
        </div>
      )}
    </footer>
  );
};
