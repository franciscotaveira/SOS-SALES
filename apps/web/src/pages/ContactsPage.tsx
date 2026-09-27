/**
 * SOS Sales V3 — ContactsPage (MCT OS v2.0)
 * Real destination for the "Contatos & Leads" navigation item.
 * Conforms to Truth in Data: live contacts under strict tenant RLS.
 */

import { useState, useEffect, type FC } from "react";
import { Input, Badge, EmptyState, Button, LoadingState, Alert } from "@sos-sales/ui";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient, type ContactSummary } from "../services/api-client";
import { Search, Users, PhoneCall, Plus, UserCheck } from "lucide-react";

export const ContactsPage: FC<{
  session: UseSessionReturn;
}> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  // New Contact Form State
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("+55");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadContacts = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getContacts(
        activeWorkspace.id,
        { search: search.trim() || undefined },
        { token }
      );
      setContacts(res.contacts);
    } catch {
      // ignore
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
    setSuccessMsg(null);

    try {
      const res = await apiClient.createContact(
        activeWorkspace.id,
        {
          phoneE164: phoneInput.trim(),
          name: nameInput.trim() || undefined,
        },
        { token }
      );

      setSuccessMsg(`Contato "${res.contact.name || res.contact.phoneE164}" salvo com sucesso!`);
      setNameInput("");
      setPhoneInput("+55");
      setIsAddingContact(false);
      loadContacts();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Falha ao registrar novo contato."
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
          <Users size={16} color="var(--color-operational, #2563EB)" />
          <span style={{ fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
            Contatos & Leads do Tenant
          </span>
          <Badge variant="neutral">
            {contacts.length} {contacts.length === 1 ? "Cadastrado" : "Cadastrados"}
          </Badge>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsAddingContact(!isAddingContact)}
          >
            <Plus size={14} />
            {isAddingContact ? "Fechar" : "Novo Contato"}
          </Button>
          <Badge variant="operational">
            Workspace: {session.activeWorkspace?.name || "Nenhum"}
          </Badge>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: "24px", maxWidth: "1000px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        {successMsg && (
          <Alert variant="info" title="Sucesso">
            {successMsg}
          </Alert>
        )}

        {errorMsg && (
          <Alert variant="danger" title="Erro no Cadastro">
            {errorMsg}
          </Alert>
        )}

        {/* Modal/Card de Cadastro */}
        {isAddingContact && (
          <form
            onSubmit={handleCreateContact}
            style={{
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              padding: "20px",
              borderRadius: "var(--radius-lg, 12px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>
              Cadastrar Novo Contato / Lead
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  Telefone E.164 (Obrigatório)
                </label>
                <input
                  type="text"
                  required
                  placeholder="+5511999998888"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
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
                  Nome Completo (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Eduardo"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setIsAddingContact(false)}
              >
                Cancelar
              </Button>
              <Button size="sm" variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar Contato"}
              </Button>
            </div>
          </form>
        )}

        {/* Filters and Search */}
        <div
          style={{
            backgroundColor: "var(--bg-surface, #FFFFFF)",
            padding: "16px 20px",
            borderRadius: "var(--radius-lg, 12px)",
            border: "1px solid var(--border-default, #E2E8F0)",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Input
            placeholder="Buscar por telefone ou nome..."
            prefixIcon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "360px", fontSize: "0.85rem" }}
          />

          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748B)" }}>
            Filtragem dinâmica sob RLS
          </span>
        </div>

        {/* Lista de Contatos */}
        {isLoading && contacts.length === 0 ? (
          <LoadingState variant="skeleton" lines={4} text="Carregando contatos..." />
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<PhoneCall size={32} />}
            title="Nenhum Contato Encontrado"
            description="Cadastre um novo contato acima ou envie uma mensagem via WhatsApp para captura automática no banco de dados."
          />
        ) : (
          <div
            style={{
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              borderRadius: "var(--radius-lg, 12px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-canvas, #F8FAFC)", borderBottom: "1px solid var(--border-default, #E2E8F0)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Contato</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Telefone E.164</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>ID do Contato</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary, #475569)" }}>Data de Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: "1px solid var(--border-subtle, #F1F5F9)",
                      transition: "background-color 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-primary, #0F172A)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            backgroundColor: "var(--color-operational-subtle, #EFF6FF)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--color-operational, #2563EB)",
                          }}
                        >
                          <UserCheck size={16} />
                        </div>
                        {c.name || "Sem Nome"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {c.phoneE164}
                    </td>
                    <td style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-muted, #94A3B8)" }}>
                      {c.id.substring(0, 8)}...
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-secondary, #64748B)" }}>
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
