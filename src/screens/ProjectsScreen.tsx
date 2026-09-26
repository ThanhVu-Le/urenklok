import { useState, type CSSProperties, type FormEvent } from 'react';
import { ArchiveIcon, ArrowDownIcon, ArrowUpIcon, PlusIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import { addProject, moveProject, updateProject } from '../db/actions';
import { PROJECT_COLORS } from '../db/db';
import { useActiveSession, useProjects } from '../hooks/useData';
import type { Project } from '../types';

export function ProjectsScreen() {
  const projects = useProjects();
  const active = useActiveSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]!);
  const [error, setError] = useState<string | null>(null);

  if (!projects) return null;
  const current = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const nameTaken = (value: string, exceptId?: string) =>
    projects.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === value.trim().toLowerCase());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Geef het project een naam.');
    if (nameTaken(trimmed)) return setError('Er bestaat al een project met deze naam.');
    await addProject(trimmed, color);
    setName('');
    setError(null);
    setColor(PROJECT_COLORS[(projects.length + 1) % PROJECT_COLORS.length]!);
    toast(`Project "${trimmed}" toegevoegd`);
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Projecten</h1>
      </div>

      <section className="card">
        <form onSubmit={submit} className="screen" style={{ gap: 12 }}>
          <h2>Nieuw project</h2>
          <label className="field">
            <span>Naam</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Bijv. Klant X – website"
              maxLength={80}
            />
          </label>
          <div className="field">
            <span>Kleur</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div>
            <button type="submit" className="btn btn-primary">
              <PlusIcon /> Toevoegen
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Actief</h2>
          <span className="muted small">{current.length} projecten</span>
        </div>
        {current.length === 0 ? (
          <p className="empty">Geen actieve projecten. Voeg er hierboven een toe.</p>
        ) : (
          <ul className="list">
            {current.map((p, i) => (
              <ProjectRow
                key={p.id}
                project={p}
                isFirst={i === 0}
                isLast={i === current.length - 1}
                inUse={active?.projectId === p.id}
                nameTaken={(v) => nameTaken(v, p.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="card">
          <div className="card-title">
            <h2>Gearchiveerd</h2>
            <span className="muted small">blijven zichtbaar in overzichten en exports</span>
          </div>
          <ul className="list">
            {archived.map((p) => (
              <ProjectRow key={p.id} project={p} nameTaken={(v) => nameTaken(v, p.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface RowProps {
  project: Project;
  isFirst?: boolean;
  isLast?: boolean;
  inUse?: boolean;
  nameTaken: (value: string) => boolean;
}

function ProjectRow({ project, isFirst, isLast, inUse, nameTaken }: RowProps) {
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [showColors, setShowColors] = useState(false);

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed === project.name) return;
    if (!trimmed || nameTaken(trimmed)) {
      setName(project.name);
      toast(!trimmed ? 'Een project moet een naam hebben.' : 'Er bestaat al een project met deze naam.');
      return;
    }
    await updateProject(project.id, { name: trimmed });
    toast('Naam opgeslagen');
  };

  return (
    <li className={`project-row${project.archived ? ' archived' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Kleur van ${project.name} wijzigen`}
          aria-expanded={showColors}
          onClick={() => setShowColors((v) => !v)}
        >
          <span className="swatch" style={{ '--swatch': project.color, width: 16, height: 16 } as CSSProperties} />
        </button>
        <input
          className="project-name"
          value={name}
          aria-label="Projectnaam"
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setName(project.name);
          }}
        />
        {!project.archived && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={isFirst}
              onClick={() => void moveProject(project.id, -1)}
              aria-label="Omhoog"
              title="Omhoog"
            >
              <ArrowUpIcon />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={isLast}
              onClick={() => void moveProject(project.id, 1)}
              aria-label="Omlaag"
              title="Omlaag"
            >
              <ArrowDownIcon />
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-sm"
          disabled={inUse}
          title={inUse ? 'Dit project loopt nu; klok eerst uit.' : undefined}
          onClick={async () => {
            await updateProject(project.id, { archived: !project.archived });
            toast(project.archived ? `"${project.name}" is weer actief` : `"${project.name}" gearchiveerd`);
          }}
        >
          <ArchiveIcon />
          <span className="hide-narrow">{project.archived ? 'Terughalen' : 'Archiveren'}</span>
        </button>
      </div>
      {showColors && (
        <div style={{ paddingLeft: 44 }}>
          <ColorPicker value={project.color} onChange={(c) => void updateProject(project.id, { color: c })} />
        </div>
      )}
    </li>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const custom = !PROJECT_COLORS.includes(value.toLowerCase());
  return (
    <div className="palette" role="group" aria-label="Kleur">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value.toLowerCase() === c}
          style={{ '--swatch': c } as CSSProperties}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Eigen kleur"
        title="Eigen kleur"
        style={custom ? { outline: '2px solid var(--text)', outlineOffset: 2 } : undefined}
      />
    </div>
  );
}
