import { addDays } from 'date-fns';
import { useMemo, useState, type FormEvent } from 'react';
import { addSession, updateSession } from '../db/actions';
import { db } from '../db/db';
import {
  combineDateTime,
  formatDate,
  formatDuration,
  formatTime,
  toDateInput,
  toTimeInput,
} from '../lib/dates';
import { centeredPause, findOverlap, netMs, pauseMs, validateSession } from '../lib/time';
import type { Project, Session } from '../types';
import { Modal } from './Modal';
import { ProjectSelect } from './ProjectSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  /** Te bewerken sessie; leeg = nieuwe sessie. */
  session?: Session;
  /** Standaarddatum voor een nieuwe sessie. */
  defaultDate?: number;
  defaultProjectId?: string;
  onSaved?: (message: string) => void;
}

const MIN = 60_000;

/** Toevoegen/bewerken van een sessie, bijvoorbeeld als je vergeten bent te klokken. */
export function SessionForm(props: Props) {
  // Remount bij elke opening zodat het formulier met verse waarden begint.
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.session ? 'Sessie bewerken' : 'Sessie toevoegen'}>
      {props.open && <SessionFormBody {...props} />}
    </Modal>
  );
}

function SessionFormBody({ onClose, projects, session, defaultDate, defaultProjectId, onSaved }: Props) {
  const running = session?.end === null;
  const initialPauseMin = session ? Math.round(pauseMs(session, Date.now()) / MIN) : 0;
  const base = defaultDate ?? Date.now();

  const [projectId, setProjectId] = useState(
    session?.projectId ?? defaultProjectId ?? projects.find((p) => !p.archived)?.id ?? '',
  );
  const [date, setDate] = useState(toDateInput(session?.start ?? base));
  const [startTime, setStartTime] = useState(session ? toTimeInput(session.start) : '09:00');
  const [endTime, setEndTime] = useState(session?.end ? toTimeInput(session.end) : '17:00');
  const [pauseMin, setPauseMin] = useState(String(initialPauseMin));
  const [note, setNote] = useState(session?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const computed = useMemo(() => {
    const start = combineDateTime(date, startTime);
    let end = combineDateTime(date, endTime);
    // Eindtijd vóór (of gelijk aan) de starttijd = de volgende dag (sessie over middernacht).
    const nextDay = end <= start;
    if (nextDay) end = combineDateTime(toDateInput(addDays(new Date(start), 1)), endTime);
    const pause = Number(pauseMin.replace(',', '.')) * MIN;
    return { start, end, nextDay, pause };
  }, [date, startTime, endTime, pauseMin]);

  const preview = useMemo(() => {
    if (running || !Number.isFinite(computed.start) || !Number.isFinite(computed.end)) return null;
    if (!Number.isFinite(computed.pause) || computed.pause < 0) return null;
    return Math.max(0, computed.end - computed.start - computed.pause);
  }, [computed, running]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!projectId) return setError('Kies een project.');

    if (running && session) {
      const start = computed.start;
      if (!Number.isFinite(start)) return setError('Vul een geldige starttijd in.');
      if (start > Date.now()) return setError('De starttijd kan niet in de toekomst liggen.');
      if (session.pauses.some((p) => p.start < start)) {
        return setError('Er is al gepauzeerd vóór deze starttijd. Kies een eerdere starttijd.');
      }
      await updateSession(session.id, { projectId, start, note: note.trim() });
      onSaved?.('Sessie bijgewerkt');
      return onClose();
    }

    const { start, end, pause } = computed;
    if (!Number.isFinite(pause)) return setError('Vul de pauze in als aantal minuten.');
    const invalid = validateSession(start, end, pause);
    if (invalid) return setError(invalid);

    if (!overlapWarning) {
      const nearby = await db.sessions
        .where('start')
        .between(start - 8 * 24 * 60 * MIN, end)
        .toArray();
      const other = findOverlap(nearby, { id: session?.id, start, end }, Date.now());
      if (other) {
        const project = projects.find((p) => p.id === other.projectId)?.name ?? 'onbekend project';
        return setOverlapWarning(
          `Let op: deze sessie overlapt met ${formatDate(other.start)} ${formatTime(other.start)}–${
            other.end ? formatTime(other.end) : 'nu'
          } (${project}).`,
        );
      }
    }

    // Pauze-intervallen behouden als de pauzeduur niet is aangepast en ze nog binnen de sessie vallen.
    const pauseUnchanged = session && Number(pauseMin) === initialPauseMin;
    const pausesFit = session?.pauses.every((p) => p.end !== null && p.start >= start && p.end <= end);
    const pauses = pauseUnchanged && pausesFit ? session.pauses : centeredPause(start, end, pause);

    const data = { projectId, start, end, pauses, note: note.trim() };
    if (session) await updateSession(session.id, data);
    else await addSession(data);
    onSaved?.(`Sessie ${session ? 'bijgewerkt' : 'toegevoegd'} · ${formatDuration(netMs({ start, end, pauses }, 0))}`);
    onClose();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field full">
          <span>Project</span>
          <ProjectSelect projects={projects} value={projectId} onChange={setProjectId} />
        </label>
        <label className="field full">
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Start</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setOverlapWarning(null);
            }}
            required
          />
        </label>
        <label className="field">
          <span>Eind</span>
          {running ? (
            <input type="text" value="loopt nog" disabled />
          ) : (
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                setOverlapWarning(null);
              }}
              required
            />
          )}
        </label>
        <label className="field">
          <span>Pauze (minuten)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={5}
            value={pauseMin}
            onChange={(e) => setPauseMin(e.target.value)}
            disabled={running}
          />
        </label>
        <div className="field" aria-live="polite">
          <span>Netto</span>
          <strong className="tabular" style={{ color: 'var(--text)', fontSize: '1.1rem', paddingTop: 8 }}>
            {preview === null ? '–' : formatDuration(preview)}
          </strong>
        </div>
        {!running && computed.nextDay && Number.isFinite(computed.end) && (
          <p className="full muted small">Eindigt de volgende dag ({formatDate(computed.end)}).</p>
        )}
        <label className="field full">
          <span>Notitie</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
        </label>
      </div>

      {error && (
        <p className="error-text" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      {overlapWarning && (
        <p className="warn-text" role="alert" style={{ marginTop: 12 }}>
          {overlapWarning}
        </p>
      )}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={onClose}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary">
          {overlapWarning ? 'Toch opslaan' : 'Opslaan'}
        </button>
      </div>
    </form>
  );
}
