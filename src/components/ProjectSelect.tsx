import type { Project } from '../types';

interface Props {
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  id?: string;
  className?: string;
  /** Toon ook gearchiveerde projecten (bij bewerken van oude sessies). */
  includeArchivedId?: string;
}

/** Keuzelijst met actieve projecten; een gearchiveerd project blijft zichtbaar als het al gekozen is. */
export function ProjectSelect({ projects, value, onChange, id, className, includeArchivedId }: Props) {
  const visible = projects.filter((p) => !p.archived || p.id === value || p.id === includeArchivedId);
  const current = projects.find((p) => p.id === value);
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ borderLeft: `4px solid ${current?.color ?? 'var(--border)'}` }}
    >
      {!current && <option value="">Kies een project…</option>}
      {visible.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.archived ? ' (gearchiveerd)' : ''}
        </option>
      ))}
    </select>
  );
}
