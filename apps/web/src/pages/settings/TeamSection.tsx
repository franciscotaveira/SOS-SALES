import { useState, useEffect, type FC, type FormEvent } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { UserPlus, Shield, UserX, KeyRound, Copy, Check, Users } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type WorkspaceMember } from "../../services/api-client";

export const TeamSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token, user } = session;

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "operator">("operator");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit / Reset Password Modal State
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "manager" | "operator">("operator");
  const [editPassword, setEditPassword] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const loadMembers = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.getWorkspaceMembers(activeWorkspace.id, { token });
      setMembers(res.members || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao carregar equipe.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [activeWorkspace?.id, token]);

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token) return;

    if (!newName.trim() || !newEmail.trim()) {
      setErrorMsg("Preencha nome e e-mail.");
      return;
    }

    setIsSubmittingAdd(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.addWorkspaceMember(
        activeWorkspace.id,
        {
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole,
          password: newPassword.trim() || undefined,
        },
        { token }
      );

      const assignedPassword = res.initialPassword || newPassword.trim() || "(já possuía senha cadastrada)";
      setCreatedCredentials({
        email: res.member.email,
        pass: assignedPassword,
      });

      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("operator");
      await loadMembers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao adicionar membro.");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleUpdateMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token || !editingMember) return;

    setIsSubmittingEdit(true);
    setErrorMsg(null);

    try {
      await apiClient.updateWorkspaceMember(
        activeWorkspace.id,
        editingMember.userId,
        {
          role: editRole,
          password: editPassword.trim() || undefined,
        },
        { token }
      );

      setSuccessMsg(`Membro ${editingMember.name} atualizado com sucesso.`);
      setEditingMember(null);
      setEditPassword("");
      await loadMembers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao atualizar membro.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!activeWorkspace || !token) return;

    const confirmed = window.confirm(
      `Deseja realmente remover o acesso de ${member.name} (${member.email}) da empresa "${activeWorkspace.name}"?`
    );
    if (!confirmed) return;

    setErrorMsg(null);
    try {
      await apiClient.removeWorkspaceMember(activeWorkspace.id, member.userId, { token });
      setSuccessMsg(`Membro ${member.name} removido da empresa.`);
      await loadMembers();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao remover membro.");
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `Credenciais de acesso ao SOS Sales:\nEmpresa: ${activeWorkspace?.name}\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.pass}\nLink: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner":
        return { label: "Proprietário", bg: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "rgba(245, 158, 11, 0.3)" };
      case "admin":
        return { label: "Administrador", bg: "rgba(139, 92, 246, 0.12)", color: "#7c3aed", border: "rgba(139, 92, 246, 0.3)" };
      case "manager":
        return { label: "Gerente", bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "rgba(59, 130, 246, 0.3)" };
      case "operator":
        return { label: "Operador", bg: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "rgba(16, 185, 129, 0.3)" };
      default:
        return { label: role, bg: "rgba(107, 114, 128, 0.12)", color: "#4b5563", border: "rgba(107, 114, 128, 0.3)" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Card */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "20px 24px",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--font-size-lg, 1.125rem)",
              fontWeight: 600,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Users size={20} color="var(--color-action)" />
            Equipe & Usuários da Empresa
          </h2>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-secondary)",
            }}
          >
            Gerencie os operadores e administradores com acesso ao atendimento e disparos de{" "}
            <strong>{activeWorkspace?.name}</strong>.
          </p>
        </div>

        <Button
          size="md"
          variant="primary"
          onClick={() => {
            setCreatedCredentials(null);
            setIsAddModalOpen(true);
          }}
          prefixIcon={<UserPlus size={16} />}
        >
          Adicionar Membro
        </Button>
      </div>

      {errorMsg && (
        <Alert variant="danger" title="Erro">
          {errorMsg}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" title="Sucesso">
          {successMsg}
        </Alert>
      )}

      {/* Members List Table / Cards */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
            Carregando membros da empresa...
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
            Nenhum membro cadastrado nesta empresa.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m, index) => {
              const roleMeta = getRoleLabel(m.role);
              const isSelf = m.userId === user?.id || m.email === user?.email;
              const isOwner = m.role === "owner";

              return (
                <div
                  key={m.id || m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 24px",
                    borderBottom: index < members.length - 1 ? "1px solid var(--border-default)" : "none",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  {/* Member Profile */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-action)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {m.name.slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                          {m.name}
                        </span>
                        {isSelf && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "var(--bg-canvas)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                            }}
                          >
                            Você
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        {m.email}
                      </div>
                    </div>
                  </div>

                  {/* Role Badge & Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: roleMeta.bg,
                        color: roleMeta.color,
                        border: `1px solid ${roleMeta.border}`,
                      }}
                    >
                      {roleMeta.label}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingMember(m);
                          setEditRole((m.role as any) === "owner" ? "admin" : (m.role as any));
                          setEditPassword("");
                        }}
                        prefixIcon={<KeyRound size={14} />}
                      >
                        Editar / Senha
                      </Button>

                      {!isOwner && !isSelf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveMember(m)}
                          prefixIcon={<UserX size={14} color="var(--color-danger)" />}
                          style={{ color: "var(--color-danger)" }}
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Adicionar Membro */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-xl, 16px)",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Novo Membro da Equipe
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            {createdCredentials ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Alert variant="success" title="Membro Cadastrado com Sucesso!">
                  O operador foi adicionado à empresa. Copie as credenciais abaixo e envie para ele.
                </Alert>

                <div
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    fontSize: "0.875rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div>
                    <strong>E-mail:</strong> {createdCredentials.email}
                  </div>
                  <div>
                    <strong>Senha de Acesso:</strong>{" "}
                    <code style={{ backgroundColor: "rgba(0,0,0,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                      {createdCredentials.pass}
                    </code>
                  </div>
                  <div>
                    <strong>Empresa:</strong> {activeWorkspace?.name}
                  </div>
                </div>

                <Button
                  size="md"
                  variant="primary"
                  onClick={handleCopyCredentials}
                  prefixIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                >
                  {copied ? "Credenciais Copiadas!" : "Copiar Dados de Acesso"}
                </Button>

                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Fechar
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAddMember} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Input
                  label="Nome Completo"
                  placeholder="Ex: João da Silva"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />

                <Input
                  label="E-mail de Login"
                  type="email"
                  placeholder="joao@suaempresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    Função / Cargo na Empresa
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md, 8px)",
                      border: "1px solid var(--border-default)",
                      backgroundColor: "var(--bg-canvas)",
                      color: "var(--text-primary)",
                      fontSize: "var(--font-size-sm, 0.875rem)",
                    }}
                  >
                    <option value="operator">Operador (Atendimento e Inbox de Chat)</option>
                    <option value="manager">Gerente (Atendimento, Disparos e Convidar Membros)</option>
                    <option value="admin">Administrador (Acesso Total ao Workspace)</option>
                  </select>
                </div>

                <Input
                  label="Senha Inicial (Opcional)"
                  type="password"
                  placeholder="Deixe em branco para gerar automaticamente"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <Button
                    size="md"
                    variant="secondary"
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="md"
                    variant="primary"
                    type="submit"
                    disabled={isSubmittingAdd}
                    prefixIcon={<Shield size={16} />}
                  >
                    {isSubmittingAdd ? "Salvando..." : "Criar Acesso"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Editar / Redefinir Senha */}
      {editingMember && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-xl, 16px)",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Editar: {editingMember.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMember} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "6px",
                  }}
                >
                  Cargo / Nível de Acesso
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  disabled={editingMember.role === "owner"}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-canvas)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                  }}
                >
                  <option value="operator">Operador (Atendimento e Inbox de Chat)</option>
                  <option value="manager">Gerente (Atendimento, Disparos e Convidar Membros)</option>
                  <option value="admin">Administrador (Acesso Total ao Workspace)</option>
                </select>
                {editingMember.role === "owner" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    O papel de Proprietário é protegido e não pode ser alterado.
                  </p>
                )}
              </div>

              <Input
                label="Definir Nova Senha de Acesso"
                type="password"
                placeholder="Deixe em branco para manter a senha atual"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <Button
                  size="md"
                  variant="secondary"
                  type="button"
                  onClick={() => setEditingMember(null)}
                >
                  Cancelar
                </Button>
                <Button
                  size="md"
                  variant="primary"
                  type="submit"
                  disabled={isSubmittingEdit}
                >
                  {isSubmittingEdit ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default TeamSection;
