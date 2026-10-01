import { useState, useEffect, type FC } from "react";
import {
  PageHeader,
  Input,
  Button,
  LoadingState,
  EmptyState,
  Dialog,
  ListItem,
  Avatar,
  Badge,
  useBreakpoint,
} from "@sos-sales/ui";
import { Search, Plus, PhoneCall } from "lucide-react";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient, type ContactSummary } from "../services/api-client";
import { formatPhone } from "./cockpit/utils/formatPhone";

export const ContactsPage: FC<{
  session: UseSessionReturn;
}> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  // New Contact Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("+55");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadContacts = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getContacts(
        activeWorkspace.id,
        { search: search.trim() || undefined },
        { token }
      );
      setContacts(res.contacts || []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      loadContacts();
    }, 300);
    return () => clearTimeout(handler);
  }, [activeWorkspace?.id, token, search]);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token || !phoneInput.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      await apiClient.createContact(
        activeWorkspace.id,
        {
          phoneE164: phoneInput.trim(),
          name: nameInput.trim() || undefined,
        },
        { token }
      );

      setNameInput("");
      setPhoneInput("+55");
      setIsDialogOpen(false);
      loadContacts();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao registrar novo contato.");
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
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Contatos & Leads"
          description="Gestão unificada de contatos do WhatsApp com isolamento estrito de dados."
          actions={
            <Button
              size="sm"
              variant="primary"
              prefixIcon={<Plus size={14} />}
              onClick={() => {
                setErrorMsg(null);
                setIsDialogOpen(true);
              }}
            >
              Novo Contato
            </Button>
          }
        />

        {/* Search & Filter Bar Card */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ maxWidth: "400px", width: "100%" }}>
            <Input
              placeholder="Buscar por telefone ou nome..."
              prefixIcon={<Search size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", fontWeight: 500 }}>
            {contacts.length} {contacts.length === 1 ? "contato cadastrado" : "contatos cadastrados"}
          </div>
        </div>

        {/* Content Section */}
        {isLoading && contacts.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <LoadingState variant="skeleton" lines={5} text="Carregando contatos..." />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<PhoneCall size={48} />}
            title="Nenhum contato encontrado"
            description="Cadastre um novo contato acima ou envie uma mensagem no WhatsApp para captura automática."
          />
        ) : isMobile ? (
          /* Mobile List View (64px ListItems, no horizontal scrolling) */
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              overflow: "hidden",
            }}
          >
            {contacts.map((c) => (
              <ListItem
                key={c.id}
                height="md"
                leading={<Avatar id={c.id} name={c.name || undefined} size="md" />}
                title={<span style={{ fontWeight: 500 }}>{c.name || "Contato sem nome"}</span>}
                subtitle={
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>
                    {formatPhone(c.phoneE164)}
                  </span>
                }
                meta={new Date(c.createdAt).toLocaleDateString("pt-BR")}
              />
            ))}
          </div>
        ) : (
          /* Desktop / Tablet Table View (48px rows, sticky header) */
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "var(--font-size-sm)" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-surface-elevated)",
                    borderBottom: "1px solid var(--border-default)",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Nome
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Telefone
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Origem
                  </th>
                  <th style={{ padding: "0 16px", height: "48px", fontWeight: 600, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                    Cadastrado em
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      height: "48px",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <td style={{ padding: "0 16px", fontWeight: 500, color: "var(--text-primary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar id={c.id} name={c.name || undefined} size="sm" />
                        <span>{c.name || "Sem nome"}</span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "0 16px",
                        fontFamily: "var(--font-mono, monospace)",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {formatPhone(c.phoneE164)}
                    </td>
                    <td style={{ padding: "0 16px" }}>
                      <Badge variant="operational">WhatsApp</Badge>
                    </td>
                    <td style={{ padding: "0 16px", color: "var(--text-secondary)", fontSize: "var(--font-size-xs)" }}>
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Contact Dialog */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Cadastrar Novo Contato"
        description="Adicione o número e nome para iniciar atendimentos e disparos."
      >
        <form onSubmit={handleCreateContact} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {errorMsg && (
            <div
              role="alert"
              style={{
                padding: "8px 12px",
                backgroundColor: "var(--color-danger-subtle)",
                color: "var(--color-danger)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-xs)",
              }}
            >
              {errorMsg}
            </div>
          )}

          <Input
            label="Telefone WhatsApp (Formato E.164)"
            placeholder="+55 49 99999-8888"
            required
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />

          <Input
            label="Nome Completo (Opcional)"
            placeholder="Ex: Carlos Eduardo"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <Button size="sm" variant="secondary" type="button" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar Contato"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};

export default ContactsPage;
