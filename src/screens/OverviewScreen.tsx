import { useMemo, useState, type CSSProperties } from 'react';
import { BarChart } from '../components/BarChart';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../components/Icons';
import { SessionForm } from '../components/SessionForm';
import { SessionList } from '../components/SessionList';
import { useToast } from '../components/Toast';
import { projectMap, useProjects, useSessionsInRange } from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import {
  daysInRange,
  decimalHours,
  formatDecimalNl,
  formatDuration,
  periodLabel,
  periodRange,
  shiftPeriod,
} from '../lib/dates';
import { totalsInRange } from '../lib/time';
import type { PeriodKind } from '../types';

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: 'day', label: 'Dag' },
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Maand' },
];

export function OverviewScreen() {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const toast = useToast();
  const now = useNow(1000);

  const projects = useProjects();
  const byId = useMemo(() => projectMap(projects), [projects]);

  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const sessions = useSessionsInRange(range);
  const totals = useMemo(() => totalsInRange(sessions ?? [], range, now), [sessions, range, now]);
  const days = useMemo(() => daysInRange(range), [range]);
  const isCurrent = now >= range.start && now < range.end;

  const workedDays = [...totals.perDay.values()].filter((m) => [...m.values()].some((v) => v > 0)).length;
  const projectRows = [...totals.perProject.entries()]
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Overzicht</h1>
        <div className="segmented" role="group" aria-label="Periode">
          {KINDS.map(({ kind: k, label }) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="period-nav">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))}
          aria-label="Vorige periode"
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))}
          aria-label="Volgende periode"
        >
          <ChevronRightIcon />
        </button>
        <span className="period-label" style={{ textTransform: kind === 'week' ? undefined : 'capitalize' }}>
          {periodLabel(kind, anchor)}
        </span>
        {!isCurrent && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAnchor(Date.now())}>
            Naar vandaag
          </button>
        )}
      </div>

      <section className="card">
        <div className="card-title" style={{ alignItems: 'flex-end' }}>
          <div>
            <p className="muted small">Totaal gewerkt</p>
            <div className="stat-total">{formatDuration(totals.total)}</div>
            <p className="muted small tabular">
              {formatDecimalNl(decimalHours(totals.total))} uur
              {kind !== 'day' && workedDays > 0 && (
                <>
                  {' '}
                  · {workedDays} {workedDays === 1 ? 'dag' : 'dagen'} · gem.{' '}
                  {formatDuration(totals.total / workedDays)} per gewerkte dag
                </>
              )}
            </p>
          </div>
        </div>

        {projectRows.length === 0 ? (
          <p className="empty">Geen uren in deze periode.</p>
        ) : (
          <div className="project-bars">
            {projectRows.map(([pid, ms]) => {
              const project = byId.get(pid);
              const pct = totals.total > 0 ? (ms / totals.total) * 100 : 0;
              const style = { '--swatch': project?.color } as CSSProperties;
              return (
                <div key={pid} className="project-bar-row" style={style}>
                  <span className="name">
                    <span className="swatch" />
                    <span>{project?.name ?? 'Onbekend project'}</span>
                  </span>
                  <span className="tabular">
                    {formatDuration(ms)} <span className="muted small">· {Math.round(pct)}%</span>
                  </span>
                  <div className="project-bar-track">
                    <div className="project-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {kind !== 'day' && (
        <section className="card">
          <div className="card-title">
            <h2>Uren per dag</h2>
          </div>
          <BarChart days={days} perDay={totals.perDay} projects={byId} now={now} compact={kind === 'month'} />
        </section>
      )}

      <section className="card">
        <div className="card-title">
          <h2>Sessies</h2>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
              <PlusIcon /> Sessie toevoegen
            </button>
          </div>
        </div>
        {kind === 'month' && !showAll && (sessions?.length ?? 0) > 0 ? (
          // Een maand heeft veel sessies; standaard ingeklapt om het overzicht rustig te houden.
          <button type="button" className="btn btn-sm" onClick={() => setShowAll(true)}>
            Toon alle {sessions?.length} sessies van deze maand
          </button>
        ) : (
          <SessionList
            sessions={sessions ?? []}
            projects={projects ?? []}
            now={now}
            grouped={kind !== 'day'}
            emptyText="Geen sessies in deze periode."
          />
        )}
      </section>

      <SessionForm
        open={adding}
        onClose={() => setAdding(false)}
        projects={projects ?? []}
        defaultDate={isCurrent ? now : range.start}
        onSaved={toast}
      />
    </div>
  );
}
