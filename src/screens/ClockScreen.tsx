import { useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, PlusIcon, StopIcon } from '../components/Icons';
import { EvaluationNotice } from '../components/EvaluationNotice';
import { LongSessionWarning } from '../components/LongSessionWarning';
import { WeekGoals } from '../components/WeekGoals';
import { SessionForm } from '../components/SessionForm';
import { SessionList } from '../components/SessionList';
import { useToast } from '../components/Toast';
import { ProjectSelect } from '../components/ProjectSelect';
import { updateSession } from '../db/actions';
import type { ClockController } from '../hooks/useClock';
import { useSessionsInRange } from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import { dayKey, formatClock, formatDayLong, formatDuration, formatTime, periodRange } from '../lib/dates';
import { activePause, netMs, pauseMs, totalsInRange } from '../lib/time';
import type { Session } from '../types';

export function ClockScreen({ clock }: { clock: ClockController }) {
  const { active, paused, projects, projectId } = clock;
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  // Vandaag-bereik alleen herberekenen als de datum verandert.
  const today = dayKey(now);
  const todayRange = useMemo(() => periodRange('day', now), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const todaySessions = useSessionsInRange(todayRange);
  const todayTotal = todaySessions ? totalsInRange(todaySessions, todayRange, now).total : 0;

  const state = active ? (paused ? 'paused' : 'running') : 'idle';
  const net = active ? netMs(active, now) : 0;
  const currentPause = active ? activePause(active) : undefined;

  const onToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clock.toggleClock();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      {active && <LongSessionWarning session={active} now={now} />}
      <section className="card clock" data-state={state} aria-label="Klok">
        <div className="clock-status">
          <span className="status-dot" aria-hidden="true" />
          {state === 'idle' ? 'Niet ingeklokt' : state === 'paused' ? 'Gepauzeerd' : 'Aan het werk'}
        </div>

        <div className="timer" role="timer" aria-live="off">
          {formatClock(net)}
        </div>

        <div className="clock-project">
          <label className="field">
            <span>{active ? 'Project van deze sessie' : 'Project'}</span>
            <ProjectSelect projects={projects} value={projectId} onChange={(id) => void clock.selectProject(id)} />
          </label>
        </div>

        <button
          type="button"
          className="clock-button"
          data-running={active ? 'true' : 'false'}
          onClick={onToggle}
          disabled={clock.loading || busy || (!active && !projectId)}
        >
          {active ? <StopIcon /> : <PlayIcon />}
          {active ? 'Uitklokken' : 'Inklokken'}
          <span className="hint">spatiebalk</span>
        </button>

        {active && (
          <button
            type="button"
            className="btn btn-pause"
            aria-pressed={paused}
            onClick={() => void clock.togglePause()}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? 'Hervatten' : 'Pauze'}
          </button>
        )}

        {active && (
          <div className="clock-meta muted">
            <span>
              Gestart om {formatTime(active.start)}
              {pauseMs(active, now) > 0 && <> · pauze {formatDuration(pauseMs(active, now))}</>}
            </span>
            {currentPause && <span>Pauze loopt sinds {formatTime(currentPause.start)}</span>}
          </div>
        )}
      </section>

      {active && <NoteEditor key={active.id} session={active} />}

      <EvaluationNotice now={now} />

      <WeekGoals now={now} />

      <section className="card" aria-label="Vandaag">
        <div className="card-title">
          <div>
            <h2>
              Vandaag · <span className="tabular">{formatDuration(todayTotal)}</span>
            </h2>
            <p className="muted small">{formatDayLong(now)}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Sessie toevoegen
          </button>
        </div>
        <SessionList
          sessions={todaySessions ?? []}
          projects={projects}
          now={now}
          emptyText="Vandaag nog niet gewerkt."
        />
      </section>

      <SessionForm
        open={adding}
        onClose={() => setAdding(false)}
        projects={projects}
        defaultProjectId={projectId}
        onSaved={toast}
      />
    </div>
  );
}

/** Notitie bij de lopende sessie; slaat automatisch op tijdens het typen. */
function NoteEditor({ session }: { session: Session }) {
  const [note, setNote] = useState(session.note);
  const saved = useRef(session.note);
  const latest = useRef(note);
  latest.current = note;

  useEffect(() => {
    if (note === saved.current) return;
    const id = window.setTimeout(() => {
      saved.current = note;
      void updateSession(session.id, { note });
    }, 500);
    return () => window.clearTimeout(id);
  }, [note, session.id]);

  // Niets kwijtraken bij uitklokken of wegnavigeren.
  useEffect(
    () => () => {
      if (latest.current !== saved.current) void updateSession(session.id, { note: latest.current });
    },
    [session.id],
  );

  return (
    <section className="card">
      <label className="field">
        <span>Wat doe je nu?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Korte notitie bij deze sessie…"
          rows={2}
          maxLength={2000}
        />
      </label>
    </section>
  );
}
