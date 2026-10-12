import { useState, useEffect, type FC } from "react";
import {
  PageHeader, Input, Button, LoadingState, EmptyState, Dialog, ListItem,
  Avatar, Badge, Drawer, SegmentedControl, useBreakpoint,
} from "@sos-sales/ui";
import { Search, Plus, PhoneCall, Edit3, UserX, UserCheck, Building2, Mail, Tag } from "lucide-react";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient, type ContactSummary } from "../services/api-client";
import { formatPhone } from "./cockpit/utils/formatPhone";

type ContactStatus = "active" | "inactive" | "all";
type ContactForm = {
  name: string; phoneE164: string; email: string; company: string; notes: string; tags: string;
};

const emptyForm: ContactForm = { name: "", phoneE164: "+55", email: "", company: "", notes: "", tags: "" };

export const ContactsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContactStatus>("active");
  const [selected, setSelected] = useState<ContactSummary | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadContacts = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    try {
      const res = await apiClient.getContacts(
        activeWorkspace.id,
        { search: search.trim() || undefined, status },
        { token }
      );
      setContacts(res.contacts || []);
      if (selected) {
        const refreshed = res.contacts.find((c) => c.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao carregar contatos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(loadContacts, 300);
    return () => clearTimeout(handler);
  }, [activeWorkspace?.id, token, search, status]);

  const openContact = (contact: ContactSummary) => {
    setSelected(contact);
    setMode("view");
    setErrorMsg(null);
  };

  const startEdit = () => {
    if (!selected) return;
    setForm({
      name: selected.name || "",
      phoneE164: selected.phoneE164,
      email: selected.metadata?.email || "",
      company: selected.metadata?.company || "",
      notes: selected.metadata?.notes || "",
      tags: (selected.metadata?.tags || []).join(", "),
    });
    setMode("edit");
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token || !form.phoneE164.trim()) return;
    setIsSubmitting(true); setErrorMsg(null);
    try {
      const result = await apiClient.createContact(activeWorkspace.id, {
        phoneE164: form.phoneE164.replace(/\s/g, ""),
        name: form.name.trim() || undefined,
      }, { token });
      setIsCreateOpen(false);
      setForm(emptyForm);
      setSelected(result.contact);
      await loadContacts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao registrar contato.");
    } finally { setIsSubmitting(false); }
  };

  const handleSave = async () => {
    if (!activeWorkspace || !token || !selected) return;
    setIsSubmitting(true); setErrorMsg(null);
    try {
      const result = await apiClient.updateContact(activeWorkspace.id, selected.id, {
        name: form.name.trim() || null,
        phoneE164: form.phoneE164.replace(/\s/g, ""),
        metadata: {
          email: form.email.trim(),
          company: form.company.trim(),
          notes: form.notes.trim(),
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      }, { token });
      setSelected(result.contact);
      setMode("view");
      await loadContacts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao atualizar contato.");
    } finally { setIsSubmitting(false); }
  };

  const toggleActive = async () => {
    if (!activeWorkspace || !token || !selected) return;
    setIsSubmitting(true); setErrorMsg(null);
    try {
      const result = await apiClient.updateContact(activeWorkspace.id, selected.id, {
        optOut: !selected.optOut,
      }, { token });
      setSelected(result.contact);
      await loadContacts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao alterar o status.");
    } finally { setIsSubmitting(false); }
  };

  const contactRow = (c: ContactSummary, mobile = false) => mobile ? (
    <ListItem key={c.id} height="md" leading={<Avatar id={c.id} name={c.name || undefined} size="md" />}
      title={<span style={{ fontWeight: 500 }}>{c.name || "Contato sem nome"}</span>}
      subtitle={<span>{formatPhone(c.phoneE164)} · {c.metadata?.company || "Sem empresa"}</span>}
      meta={c.optOut ? "Inativo" : "Ativo"} onClick={() => openContact(c)} />
  ) : (
    <tr key={c.id} onClick={() => openContact(c)} tabIndex={0} role="button"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openContact(c); }}
      style={{ height: 56, borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
      <td style={{ padding: "0 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar id={c.id} name={c.name || undefined} size="sm" />
        <div><div style={{ fontWeight: 600 }}>{c.name || "Sem nome"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{c.metadata?.company || "Sem empresa informada"}</div></div>
      </div></td>
      <td style={{ padding: "0 16px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" }}>{formatPhone(c.phoneE164)}</td>
      <td style={{ padding: "0 16px" }}><Badge variant={c.optOut ? "neutral" : "operational"}>{c.optOut ? "Inativo" : "Ativo"}</Badge></td>
      <td style={{ padding: "0 16px", color: "var(--text-secondary)", fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString("pt-BR")}</td>
    </tr>
  );

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-canvas)", overflowY: "auto", padding: "var(--space-6)", boxSizing: "border-box" }}>
    <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="Contatos & Leads" description="Cadastros, histórico e preferências dos clientes do WhatsApp."
        actions={<Button size="sm" variant="primary" prefixIcon={<Plus size={14}/>} onClick={() => { setForm(emptyForm); setErrorMsg(null); setIsCreateOpen(true); }}>Novo Contato</Button>} />
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 400, flex: "1 1 280px" }}><Input placeholder="Buscar por telefone ou nome..." prefixIcon={<Search size={16}/>} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <SegmentedControl value={status} onChange={(v) => setStatus(v as ContactStatus)}
          options={[{ value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }, { value: "all", label: "Todos" }]} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{contacts.length} contato{contacts.length === 1 ? "" : "s"}</span>
      </div>

      {errorMsg && !selected && <div role="alert" style={{ padding: 12, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{errorMsg}</div>}
      {isLoading && contacts.length === 0 ? <LoadingState variant="skeleton" lines={5} text="Carregando contatos..." />
      : contacts.length === 0 ? <EmptyState icon={<PhoneCall size={48}/>} title="Nenhum contato encontrado" description="Altere o filtro ou cadastre um novo contato." />
      : isMobile ? <div style={{ background: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border-default)", overflow: "hidden" }}>{contacts.map((c) => contactRow(c, true))}</div>
      : <div style={{ background: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}><thead><tr style={{ background: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-default)" }}>
          {["Contato", "Telefone", "Status", "Atualizado em"].map((h) => <th key={h} style={{ padding: "0 16px", height: 48, fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{h}</th>)}
        </tr></thead><tbody>{contacts.map((c) => contactRow(c))}</tbody></table>
      </div>}
    </div>

    <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Cadastrar Novo Contato" description="Crie o cadastro básico; os demais dados podem ser preenchidos na ficha.">
      <form onSubmit={handleCreateContact} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {errorMsg && <div role="alert" style={{ color: "var(--color-danger)" }}>{errorMsg}</div>}
        <Input label="Telefone WhatsApp (E.164)" required value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}/>
        <Input label="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button size="sm" variant="secondary" type="button" onClick={() => setIsCreateOpen(false)}>Cancelar</Button><Button size="sm" variant="primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar"}</Button></div>
      </form>
    </Dialog>

    <Drawer isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name || "Contato sem nome"}
      description={selected ? formatPhone(selected.phoneE164) : ""} width="480px"
      footer={selected && <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Button size="sm" variant="secondary" prefixIcon={selected.optOut ? <UserCheck size={15}/> : <UserX size={15}/>} onClick={toggleActive} disabled={isSubmitting}>
          {selected.optOut ? "Reativar contato" : "Desativar automações"}
        </Button>
        {mode === "view" ? <Button size="sm" variant="primary" prefixIcon={<Edit3 size={15}/>} onClick={startEdit}>Editar dados</Button>
          : <div style={{ display: "flex", gap: 8 }}><Button size="sm" variant="secondary" onClick={() => setMode("view")}>Cancelar</Button><Button size="sm" variant="primary" onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar"}</Button></div>}
      </div>}>
      {selected && <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        {errorMsg && <div role="alert" style={{ padding: 10, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{errorMsg}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Avatar id={selected.id} name={selected.name || undefined} size="lg"/><div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.name || "Contato sem nome"}</div>
          <Badge variant={selected.optOut ? "neutral" : "operational"}>{selected.optOut ? "Inativo para automações" : "Ativo"}</Badge>
        </div></div>
        {mode === "edit" ? <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
          <Input label="Telefone WhatsApp" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}/>
          <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/>
          <Input label="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}/>
          <Input label="Etiquetas (separadas por vírgula)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}/>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>Observações
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={6}
              style={{ resize: "vertical", padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, font: "inherit", fontWeight: 400 }}/>
          </label>
        </div> : <div style={{ display: "grid", gap: 12 }}>
          <Info icon={<Building2 size={17}/>} label="Empresa" value={selected.metadata?.company}/>
          <Info icon={<Mail size={17}/>} label="E-mail" value={selected.metadata?.email}/>
          <Info icon={<Tag size={17}/>} label="Etiquetas" value={(selected.metadata?.tags || []).join(", ")}/>
          <div style={{ padding: 14, background: "var(--bg-surface-elevated)", borderRadius: 10 }}><div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Observações</div><div style={{ whiteSpace: "pre-wrap" }}>{selected.metadata?.notes || "Nenhuma observação cadastrada"}</div></div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Criado em {new Date(selected.createdAt).toLocaleString("pt-BR")} · atualizado em {new Date(selected.updatedAt).toLocaleString("pt-BR")}</div>
        </div>}
      </div>}
    </Drawer>
  </div>;
};

const Info: FC<{ icon: React.ReactNode; label: string; value?: string }> = ({ icon, label, value }) => <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderBottom: "1px solid var(--border-subtle)" }}>
  <span style={{ color: "var(--text-secondary)" }}>{icon}</span><div><div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div><div>{value || "Não informado"}</div></div>
</div>;

export default ContactsPage;
