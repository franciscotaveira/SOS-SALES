import { useEffect, useState, useRef, type FC, type FormEvent, type ChangeEvent } from "react";
import { Button, Input, Dialog, SegmentedControl, useBreakpoint } from "@sos-sales/ui";
import { Upload } from "lucide-react";
import { apiClient, type ProductRecord } from "../../services/api-client";

interface CreateProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  onCreated: () => void;
  product?: ProductRecord | null;
}

export const CreateProductDialog: FC<CreateProductDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onCreated,
  product,
}) => {
  const { isMobile } = useBreakpoint();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [retailerId, setRetailerId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceReal, setPriceReal] = useState("0,00");
  const [category, setCategory] = useState("Geral");
  const [imageUrl, setImageUrl] = useState("https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "OUT_OF_STOCK">("ACTIVE");
  const isEditing = Boolean(product);

  useEffect(() => {
    if (!isOpen) return;
    if (product) {
      setRetailerId(product.retailerId);
      setTitle(product.title);
      setDescription(product.description);
      setPriceReal((product.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setCategory(product.category);
      setImageUrl(product.imageUrl);
      setStatus(product.status);
      setFormErrors({});
      setServerError(null);
    } else {
      resetForm();
    }
  }, [isOpen, product]);

  const parsePriceToCents = (val: string): number => {
    const clean = val.replace(/\D/g, "");
    return Number(clean) || 0;
  };

  const handlePriceChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const cents = Number(digits) || 0;
    const formatted = (cents / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setPriceReal(formatted);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    setServerError(null);
    try {
      const res = await apiClient.uploadMedia(workspaceId, file, { token, isPublic: true });
      setImageUrl(res.mediaUrl);
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : "Falha ao enviar imagem do computador.");
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setRetailerId("");
    setTitle("");
    setDescription("");
    setPriceReal("0,00");
    setCategory("Geral");
    setImageUrl("https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80");
    setStatus("ACTIVE");
    setFormErrors({});
    setServerError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setServerError(null);

    const errors: Record<string, string> = {};
    const cleanSku = retailerId.trim().toUpperCase();
    if (!cleanSku) {
      errors.retailerId = "SKU é obrigatório";
    } else if (!/^[A-Za-z0-9_-]+$/.test(cleanSku)) {
      errors.retailerId = "SKU deve ser alfanumérico com hífens ou underscores (ex: PLANO-PRO-01)";
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errors.title = "Título é obrigatório";
    } else if (cleanTitle.length > 120) {
      errors.title = "Título deve ter no máximo 120 caracteres";
    }

    const cleanDesc = description.trim();
    if (!cleanDesc) {
      errors.description = "Descrição é obrigatória";
    } else if (cleanDesc.length > 1024) {
      errors.description = "Descrição deve ter no máximo 1024 caracteres";
    }

    const priceCents = parsePriceToCents(priceReal);
    if (priceCents < 0) {
      errors.priceCents = "Preço deve ser maior ou igual a zero";
    }

    const cleanImage = imageUrl.trim();
    if (!cleanImage) {
      errors.imageUrl = "URL de imagem é obrigatória";
    } else {
      try {
        new URL(cleanImage);
      } catch {
        errors.imageUrl = "URL de imagem inválida";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createProduct(
        workspaceId,
        {
          retailerId: cleanSku,
          title: cleanTitle,
          description: cleanDesc,
          priceCents,
          category: category.trim() || "Geral",
          imageUrl: cleanImage,
          status,
        },
        { token }
      );

      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      setServerError((err as Error).message || "Falha ao registrar produto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Editar Produto" : "Cadastrar Novo Produto"}
      description={isEditing ? "Atualize preço, categoria, imagem e disponibilidade do item." : "Cadastre itens para geração de propostas comerciais e links Pix no Cockpit."}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {serverError && (
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
            {serverError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
          <Input
            label="Código SKU (Identificador Único)"
            placeholder="ex: MENSAL-VIP"
            value={retailerId}
            onChange={(e) => setRetailerId(e.target.value.toUpperCase())}
            disabled={isEditing}
            error={formErrors.retailerId}
            helperText={isEditing ? "O SKU não pode ser alterado após o cadastro" : "Alfanumérico com hífen"}
          />

          <Input
            label="Categoria"
            placeholder="ex: Assinaturas, Cursos"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={formErrors.category}
          />
        </div>

        <Input
          label="Título do Produto"
          placeholder="ex: Acesso Anual Plataforma SOS"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={formErrors.title}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
            Descrição
          </label>
          <textarea
            rows={3}
            placeholder="Descreva o escopo e benefícios do produto..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: formErrors.description ? "1px solid var(--color-danger)" : "1px solid var(--border-default)",
              fontSize: "var(--font-size-sm)",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          {formErrors.description && (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
              {formErrors.description}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
          <Input
            label="Preço em Reais (BRL)"
            placeholder="0,00"
            value={`R$ ${priceReal}`}
            onChange={(e) => handlePriceChange(e.target.value)}
            error={formErrors.priceCents}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
              Status
            </label>
            <SegmentedControl
              value={status}
              onChange={(val) => setStatus(val as "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK")}
              options={[
                { value: "ACTIVE", label: "Ativo" },
                { value: "INACTIVE", label: "Inativo" },
              ]}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
            Imagem do Produto
          </label>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Preview"
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "var(--radius-md, 8px)",
                  objectFit: "cover",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--bg-canvas)",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.3";
                }}
              />
            )}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    placeholder="https://... ou faça upload do computador"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    error={formErrors.imageUrl}
                  />
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  prefixIcon={<Upload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={isUploadingImage}
                  disabled={isUploadingImage}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {isUploadingImage ? "Enviando..." : "Upload do PC"}
                </Button>
              </div>
            </div>
          </div>
          {formErrors.imageUrl && (
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
              {formErrors.imageUrl}
            </span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
          <Button size="sm" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={isSubmitting}>
            {isEditing ? "Salvar Alterações" : "Salvar Produto"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
