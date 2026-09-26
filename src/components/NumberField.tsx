import { useState } from 'react';
import { useToast } from './Toast';

/** Getalveld dat opslaat bij verlaten; leeg = geen waarde. Accepteert een komma als decimaalteken. */
export function NumberField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null;
  onSave: (value: number | null) => Promise<void>;
}) {
  const toast = useToast();
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));

  const save = async () => {
    const trimmed = text.trim();
    const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setText(value === null ? '' : String(value).replace('.', ','));
      toast('Vul een geldig getal in.');
      return;
    }
    const next = parsed === 0 ? null : parsed;
    if (next === value) return;
    await onSave(next);
    toast('Opgeslagen');
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder="—"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}
