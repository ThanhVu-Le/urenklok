import { useMemo, type CSSProperties } from 'react';
import { usePreferences, useProjects, useSessionsInRange } from '../hooks/useData';
import { dayKey, formatDuration, isoWeek, periodRange } from '../lib/dates';
import { weekGoalProgress } from '../lib/goals';
import { totalsInRange } from '../lib/time';

/** Voortgang van de weekdoelen; toont niets als er geen doelen zijn ingesteld. */
export function WeekGoals({ now }: { now: number }) {
  const prefs = usePreferences();
  const projects = useProjects();
  const today = dayKey(now);
  const range = useMemo(() => periodRange('week', now), [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessions = useSessionsInRange(range);

  if (!prefs || !projects || !sessions) return null;
  const goals = weekGoalProgress(totalsInRange(sessions, range, now), prefs, projects);
  if (goals.length === 0) return null;

  return (
    <section className="card" aria-label="Weekdoelen">
      <div className="card-title">
        <h2>Week {isoWeek(now).week}</h2>
        <a className="muted small" href="#/projecten">
          Doelen aanpassen
        </a>
      </div>
      <div className="project-bars">
        {goals.map((g) => {
          const reached = g.ratio >= 1;
          const style = { '--swatch': g.project?.color ?? 'var(--accent)' } as CSSProperties;
          return (
            <div key={g.project?.id ?? 'totaal'} className="project-bar-row" style={style}>
              <span className="name">
                {g.project && <span className="swatch" />}
                <span style={g.project ? undefined : { fontWeight: 600 }}>{g.project?.name ?? 'Totaal'}</span>
              </span>
              <span className="tabular small">
                {formatDuration(g.doneMs)} / {formatDuration(g.goalMs)}{' '}
                <span className={reached ? 'goal-reached' : 'muted'}>
                  · {reached ? 'gehaald' : `nog ${formatDuration(g.remainingMs)}`}
                </span>
              </span>
              <div className="project-bar-track">
                <div className="project-bar-fill" style={{ width: `${Math.min(100, g.ratio * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
