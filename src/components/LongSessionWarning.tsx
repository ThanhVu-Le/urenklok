import { useState, type FormEvent } from 'react';
import { clockOut } from '../db/actions';
import { usePreferences } from '../hooks/useData';
import { combineDateTime, formatDate, formatDuration, formatTime, toDateInput, toTimeInput } from '../lib/dates';
import { isLongRunning } from '../lib/goals';
import type { Session } from '../types';
import { Modal } from './Modal';
import { useToast } from './Toast';

/** Waarschuwing als de lopende sessie verdacht lang duurt, met de optie om met terugwerkende kracht uit te klokken. */
export function LongSessionWarning({ session, now }: { session: Session; now: number }) {
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  if (!prefs || !isLongRunning(session, now, prefs.warnAfterHours)) return null;

  return (
    <div className="card warning-card" role="alert">
      <p>
        Deze sessie loopt al <strong>{formatDuration(now - session.start)}</strong> (sinds {formatDate(session.start)}{' '}
        {formatTime(session.start)}). Vergeten uit te klokken?
      </p>
      <div>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Uitklokken om…
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Uitklokken met terugwerkende kracht">
        {open && <ClockOutAtForm session={session} onDone={() => setOpen(false)} />}
      </Modal>
    </div>
  );
}

function ClockOutAtForm({ session, onDone }: { session: Session; onDone: () => void }) {
  const toast = useToast();
  // Voorstel: 8 uur na de start (maar niet in de toekomst).
  const suggestion = Math.min(session.start + 8 * 3_600_000, Date.now());
  const [date, setDate] = useState(toDateInput(suggestion));
  const [time, setTime] = useState(toTimeInput(suggestion));
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const end = combineDateTime(date, time);
    if (!Number.isFinite(end)) return setError('Vul een geldige datum en tijd in.');
    if (end <= session.start) return setError(`Het eindtijdstip moet na de start liggen (${formatTime(session.start)}).`);
    if (end > Date.now()) return setError('Het eindtijdstip kan niet in de toekomst liggen.');
    await clockOut(end);
    toast(`Uitgeklokt om ${formatTime(end)}`);
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="screen" style={{ gap: 14 }}>
      <p className="muted small">
        Gestart op {formatDate(session.start)} om {formatTime(session.start)}. Pauzes na het gekozen tijdstip vervallen.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Tijd</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Annuleren
        </button>
        <button type="submit" className="btn btn-primary">
          Uitklokken
        </button>
      </div>
    </form>
  );
}
