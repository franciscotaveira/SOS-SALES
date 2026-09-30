import { type FC, useState, useEffect } from "react";
import { Button } from "@sos-sales/ui";

interface NotesProps {
  initialNotes?: string;
  onSaveNotes?: (notes: string) => void;
  isSaving?: boolean;
}

export const Notes: FC<NotesProps> = ({
  initialNotes = "",
  onSaveNotes,
  isSaving = false,
}) => {
  const [notes, setNotes] = useState(initialNotes);
  const [hasChanged, setHasChanged] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
    setHasChanged(false);
  }, [initialNotes]);

  const handleChange = (val: string) => {
    setNotes(val);
    setHasChanged(val !== initialNotes);
  };

  const handleSave = () => {
    onSaveNotes?.(notes);
    setHasChanged(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Adicione anotações sobre este lead ou negociação..."
        rows={3}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "var(--font-size-sm, 0.875rem)",
          lineHeight: "1.4",
          color: "var(--text-primary)",
          backgroundColor: "var(--bg-canvas)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md, 8px)",
          boxSizing: "border-box",
          resize: "vertical",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      {hasChanged && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleSave}
            disabled={isSaving}
          >
            Salvar Anotação
          </Button>
        </div>
      )}
    </div>
  );
};
