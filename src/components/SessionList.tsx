import { useState, type CSSProperties } from 'react';
import { deleteSession } from '../db/actions';
import { projectMap } from '../hooks/useData';
import {
  calendarDaysBetween,
  dayKey,
  formatDate,
  formatDayLong,
  formatDuration,
  formatTime,
} from '../lib/dates';
import { netMs, pauseMs } from '../lib/time';
import type { Project, Session } from '../types';
import { PencilIcon, TrashIcon } from './Icons';
import { ConfirmDialog } from './Modal';
import { SessionForm } from './SessionForm';
import { useToast } from './Toast';

interface Props {
  sessions: Session[];
  projects: Project[];
  now: number;
  /** Groepeer per startdag (nieuwste dag bovenaan). */
  grouped?: boolean;
  emptyText?: string;
}

export function SessionList({ sessions, projects, now, grouped, emptyText = 'Nog geen sessies.' }: Props) {
  const toast = useToast();
  const byId = projectMap(projects);
  const [editing, setEditing] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null);

  const sorted = [...sessions].sort((a, b) => a.start - b.start);

  const groups = new Map<string, Session[]>();
  if (grouped) {
    for (const s of sorted) {
      const key = dayKey(s.start);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
  }

  const renderItem = (s: Session) => {
    const project = byId.get(s.projectId);
    const pause = pauseMs(s, now);
    const daysLater = s.end ? calendarDaysBetween(s.start, s.end) : 0;
    return (
      <li key={s.id} className="session-item">
        <span className="swatch" style={{ '--swatch': project?.color } as CSSProperties} />
        <div className="session-main">
          <div className="row" style={{ gap: 6 }}>
            <strong className="tabular">
              {formatTime(s.start)} – {s.end ? formatTime(s.end) : 'nu'}
              {daysLater > 0 && <span className="muted small"> (+{daysLater})</span>}
            </strong>
            {s.end === null && <span className="badge badge-live">loopt</span>}
            {pause > 0 && <span className="badge">pauze {formatDuration(pause)}</span>}
          </div>
          <span className="small">{project?.name ?? 'Onbekend project'}</span>
          {s.note && <span className="note">{s.note}</span>}
        </div>
        <span className="session-duration">{formatDuration(netMs(s, now))}</span>
        <div className="session-actions">
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditing(s)} aria-label="Bewerken" title="Bewerken">
            <PencilIcon />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setDeleting(s)}
            aria-label="Verwijderen"
            title="Verwijderen"
          >
            <TrashIcon />
          </button>
        </div>
      </li>
    );
  };

  return (
    <>
      {sorted.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : grouped ? (
        [...groups.entries()].reverse().map(([key, list]) => (
          <div className="day-group" key={key}>
            <div className="day-group-header">
              <span>{formatDayLong(list[0]!.start)}</span>
              <span className="tabular">{formatDuration(list.reduce((sum, s) => sum + netMs(s, now), 0))}</span>
            </div>
            <ul className="list">{list.map(renderItem)}</ul>
          </div>
        ))
      ) : (
        <ul className="list">{sorted.map(renderItem)}</ul>
      )}

      <SessionForm
        open={editing !== null}
        onClose={() => setEditing(null)}
        projects={projects}
        session={editing ?? undefined}
        onSaved={toast}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Sessie verwijderen?"
        message={
          deleting && (
            <>
              {formatDate(deleting.start)} {formatTime(deleting.start)}–{deleting.end ? formatTime(deleting.end) : 'nu'} ·{' '}
              {byId.get(deleting.projectId)?.name ?? 'Onbekend project'} ({formatDuration(netMs(deleting, now))}).
              <br />
              Dit kan niet ongedaan worden gemaakt.
            </>
          )
        }
        confirmLabel="Verwijderen"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteSession(deleting.id);
          setDeleting(null);
          toast('Sessie verwijderd');
        }}
      />
    </>
  );
}
