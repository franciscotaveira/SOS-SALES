import { useState, useEffect, type FC } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { Check } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient } from "../../services/api-client";

export const PixSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, activeWorkspaceDetails, token, refreshWorkspace } = session;

  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cnpj");
  const [merchantName, setMerchantName] = useState("");
  const [merchantCity, setMerchantCity] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (activeWorkspaceDetails?.workspace) {
      const w = activeWorkspaceDetails.workspace;
      setPixKey(w.defaultPixKey || "");
      setPixKeyType((w.defaultPixKeyType as any) || "cnpj");
      setMerchantName(w.defaultPixMerchantName || "");
      setMerchantCity(w.defaultPixMerchantCity || "");
    }
  }, [activeWorkspaceDetails]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token) return;

    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await apiClient.updateWorkspace(
        activeWorkspace.id,
        {
          defaultPixKey: pixKey.trim() || null,
          defaultPixKeyType: pixKeyType,
          defaultPixMerchantName: merchantName.trim() ? merchantName.trim().slice(0, 25) : null,
          defaultPixMerchantCity: merchantCity.trim() ? merchantCity.trim().slice(0, 15) : null,
        },
        { token }
      );

      setSuccessMsg("Configurações de Cobrança Pix salvas com sucesso!");
      if (refreshWorkspace) refreshWorkspace();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao salvar configurações de Pix.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div>
        <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
          Cobrança Pix Oficial
        </h2>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
          Configure a chave Pix padrão para geração de QR Codes e chaves Copia e Cola no Cockpit (Padrão Banco Central / EMV).
        </p>
      </div>

      {successMsg && (
        <Alert variant="info" title="Sucesso">
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Erro">
          {errorMsg}
        </Alert>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", alignItems: "end" }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "var(--font-size-xs)",
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: "4px",
            }}
          >
            Tipo de Chave
          </label>
          <select
            value={pixKeyType}
            onChange={(e) => setPixKeyType(e.target.value as any)}
            style={{
              width: "100%",
              height: "36px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              fontSize: "var(--font-size-sm)",
              outline: "none",
            }}
          >
            <option value="cnpj">CNPJ</option>
            <option value="cpf">CPF</option>
            <option value="phone">Telefone</option>
            <option value="email">E-mail</option>
            <option value="random">Chave Aleatória</option>
          </select>
        </div>

        <Input
          label="Chave Pix"
          placeholder="Digite sua chave Pix..."
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <Input
          label="Nome do Beneficiário"
          placeholder="Ex: Minha Empresa LTDA"
          value={merchantName}
          maxLength={25}
          helperText={`${merchantName.length}/25 caracteres (máx. 25 — padrão Bacen)`}
          onChange={(e) => setMerchantName(e.target.value)}
        />
        <Input
          label="Cidade do Beneficiário"
          placeholder="Ex: São Paulo"
          value={merchantCity}
          maxLength={15}
          helperText={`${merchantCity.length}/15 caracteres (máx. 15 — padrão Bacen)`}
          onChange={(e) => setMerchantCity(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          disabled={isSaving}
          prefixIcon={<Check size={14} />}
        >
          {isSaving ? "Salvando..." : "Salvar Configurações Pix"}
        </Button>
      </div>
    </form>
  );
};
