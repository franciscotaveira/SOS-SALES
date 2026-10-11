import { useEffect, useState, type FC, type ReactNode } from "react";
import { Drawer, Button, Badge, Avatar, Input, LoadingState } from "@sos-sales/ui";
import { Building2, Mail, Phone, MessageCircle, CalendarClock, Tag, StickyNote, Edit3 } from "lucide-react";
import { apiClient, type CommercialActionSummary, type CommercialThreadSummary, type ContactSummary } from "../../../services/api-client";
import { formatPhone } from "../utils/formatPhone";

interface Props { isOpen: boolean; onClose: () => void; thread: CommercialThreadSummary | null; workspaceId?: string; token?: string; }
type ContactForm = { name: string; email: string; company: string; tags: string; notes: string };
const emptyForm: ContactForm = { name: "", email: "", company: "", tags: "", notes: "" };
const statusLabel: Record<CommercialThreadSummary["status"], string> = {
  active: "Em atendimento", waiting_client: "Aguardando cliente", waiting_human: "Precisa de atenção", closed: "Encerrada",
};

export const DossierDrawer: FC<Props> = ({ isOpen, onClose, thread, workspaceId, token }) => {
  const [contact, setContact] = useState<ContactSummary | null>(null);
  const [action, setAction] = useState<CommercialActionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);

  useEffect(() => {
    if (!isOpen || !thread || !workspaceId || !token) return;
    setLoading(true);
    setEditing(false);
    setError(null);
    Promise.all([
      apiClient.getContacts(workspaceId, { search: thread.contactPhone, status: "all", limit: 10 }, { token }),
      apiClient.getThreadActions(workspaceId, thread.id, { token }),
    ]).then(([contacts, actions]) => {
      const loadedContact = contacts.contacts.find((item) => item.id === thread.contactId) || null;
      setContact(loadedContact);
      setForm({
        name: loadedContact?.name || "",
        email: loadedContact?.metadata?.email || "",
        company: loadedContact?.metadata?.company || "",
        tags: (loadedContact?.metadata?.tags || []).join(", "),
        notes: loadedContact?.metadata?.notes || "",
      });
      setAction(actions.openAction);
    }).catch(() => { setContact(null); setAction(null); }).finally(() => setLoading(false));
  }, [isOpen, thread?.id, workspaceId, token]);

  const startEditing = () => {
    if (!contact) return;
    setForm({
      name: contact.name || "",
      email: contact.metadata?.email || "",
      company: contact.metadata?.company || "",
      tags: (contact.metadata?.tags || []).join(", "),
      notes: contact.metadata?.notes || "",
    });
    setError(null);
    setEditing(true);
  };

  const saveContact = async () => {
    if (!contact || !workspaceId || !token) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.updateContact(workspaceId, contact.id, {
        name: form.name.trim() || null,
        metadata: {
          email: form.email.trim(),
          company: form.company.trim(),
          notes: form.notes.trim(),
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        },
      }, { token });
      setContact(result.contact);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a ficha do cliente.");
    } finally {
      setSaving(false);
    }
  };

  const meta = contact?.metadata || {};
  return <Drawer isOpen={isOpen} onClose={onClose} title="Ficha do Cliente"
    description="Informações úteis para compreender e conduzir este atendimento."
    footer={editing ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setError(null); }} disabled={saving}>Cancelar</Button>
      <Button size="sm" variant="primary" onClick={saveContact} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
    </div> : <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>
      <Button size="sm" variant="primary" prefixIcon={<Edit3 size={14}/>} onClick={startEditing} disabled={!contact}>Editar ficha</Button>
    </div>}>
    {!thread ? <div style={{ padding: 24, color: "var(--text-secondary)" }}>Selecione uma conversa para consultar o cliente.</div>
    : loading ? <div style={{ padding: 20 }}><LoadingState variant="skeleton" lines={5} text="Carregando ficha..."/></div>
    : <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
      {error && <div role="alert" style={{ padding: 10, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar id={thread.contactId} name={contact?.name || thread.contactName || undefined} size="lg"/>
        <div><div style={{ fontWeight: 700, fontSize: 18 }}>{contact?.name || thread.contactName || "Contato sem nome"}</div>
          <div style={{ color: "var(--text-secondary)", margin: "3px 0 7px" }}>{formatPhone(thread.contactPhone)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge variant={thread.status === "waiting_human" ? "warning" : thread.status === "closed" ? "neutral" : "operational"}>{statusLabel[thread.status]}</Badge>
            {contact?.optOut && <Badge variant="neutral">Sem automações</Badge>}
          </div>
        </div>
      </div>
      {editing ? <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Nome do cliente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/>
        <Input label="Empresa" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })}/>
        <Input label="E-mail" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/>
        <Input label="Etiquetas (separadas por vírgula)" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })}/>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>Observações
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={6}
            style={{ resize: "vertical", padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, font: "inherit", fontWeight: 400, background: "var(--bg-surface)", color: "var(--text-primary)" }}/>
        </label>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>O número do WhatsApp é protegido nesta ficha para preservar o vínculo com a conversa.</div>
      </section> : <>
      <section style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
        <Info icon={<Building2 size={16}/>} label="Empresa" value={meta.company}/>
        <Info icon={<Mail size={16}/>} label="E-mail" value={meta.email}/>
        <Info icon={<Phone size={16}/>} label="WhatsApp" value={formatPhone(thread.contactPhone)}/>
        <Info icon={<MessageCircle size={16}/>} label="Canal" value={thread.channelName || thread.channelProvider}/>
        <Info icon={<Tag size={16}/>} label="Etiquetas" value={(meta.tags || []).join(", ")}/>
      </section>
      <section style={{ padding: 14, background: "var(--bg-surface-elevated)", borderRadius: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, marginBottom: 8 }}><StickyNote size={16}/> Observações do cliente</div>
        <div style={{ color: meta.notes ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "pre-wrap", fontSize: 13 }}>{meta.notes || "Nenhuma observação cadastrada."}</div>
      </section>
      <section style={{ padding: 14, border: "1px solid var(--border-default)", borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>Última interação</div>
        <div style={{ fontSize: 13, marginBottom: 5 }}>{thread.lastMessage?.body || "Nenhuma mensagem disponível"}</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{thread.lastMessage ? `${thread.lastMessage.direction === "inbound" ? "Recebida" : "Enviada"} em ${new Date(thread.lastMessage.createdAt).toLocaleString("pt-BR")}` : ""}</div>
      </section>
      <section style={{ padding: 14, border: `1px solid ${action ? "var(--color-warning)" : "var(--border-default)"}`, borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 7 }}><CalendarClock size={16}/> Próxima ação</div>
        {action ? <><div style={{ fontSize: 14 }}>{action.title}</div><div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Prazo: {new Date(action.dueAt).toLocaleString("pt-BR")}</div></>
          : <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nenhuma próxima ação definida para este cliente.</div>}
      </section>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Conversa iniciada em {new Date(thread.createdAt).toLocaleString("pt-BR")}</div>
      </>}
    </div>}
  </Drawer>;
};

const Info: FC<{ icon: ReactNode; label: string; value?: string }> = ({ icon, label, value }) => <div style={{ display: "grid", gridTemplateColumns: "22px 95px 1fr", gap: 8, padding: "11px 12px", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", fontSize: 13 }}>
  <span style={{ color: "var(--text-secondary)" }}>{icon}</span><span style={{ color: "var(--text-secondary)" }}>{label}</span><span style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{value || "Não informado"}</span>
</div>;
