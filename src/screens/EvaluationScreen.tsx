import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import { saveEvaluation, type EvaluationInput } from '../db/actions';
import type { ClockController } from '../hooks/useClock';
import {
  projectMap,
  useEvaluations,
  useFirstSessionStart,
  usePreferences,
  useProjects,
  useSessionsInRange,
} from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import {
  combineDateTime,
  decimalHours,
  defaultEvaluationKey,
  evaluationFriday,
  evaluationKey,
  evaluationPeriodLabel,
  evaluationRange,
  formatClock,
  formatDate,
  formatDayShort,
  formatDecimalNl,
  formatDuration,
  parseEvaluationKey,
  shiftFriday,
} from '../lib/dates';
import {
  cleanFocus,
  compareWithPrevious,
  COMPARE_PERIODS,
  goalRatio,
  improvements,
  MAX_FOCUS,
  periodStats,
  previousEvaluation,
  previousPeriods,
  reviewFor,
  strengths,
  TREND_PERIODS,
  trendHistory,
  trends,
  type Point,
} from '../lib/evaluation';
import { isPaused, netMs, totalsInRange } from '../lib/time';
import type { Evaluation, FocusResult, Preferences, Project } from '../types';

const STEPS = ['Cijfers', 'Terugblik', 'Reflectie', 'Conclusie'] as const;

const FOCUS_RESULTS: { value: FocusResult; label: string }[] = [
  { value: 'gelukt', label: 'Gelukt' },
  { value: 'deels', label: 'Deels' },
  { value: 'niet', label: 'Niet gelukt' },
];

/** Vrijdag uit de hash (#/evaluatie/2026-09-25), als die geldig is en niet in de toekomst ligt. */
function keyFromHash(now: number): string | null {
  const match = window.location.hash.match(/evaluatie\/(\d{4}-\d{2}-\d{2})/);
  const t = match ? parseEvaluationKey(match[1]!) : null;
  return t !== null && t <= evaluationFriday(now) ? match![1]! : null;
}

/** Weekevaluatie: cijfers, terugblik, reflectie en conclusie voor één vrijdag. Verandert niets aan het klokken. */
export function EvaluationScreen({ clock }: { clock: ClockController }) {
  const evaluations = useEvaluations();
  const projects = useProjects();
  const prefs = usePreferences();
  const firstStart = useFirstSessionStart();
  const [key, setKey] = useState<string | null>(null);

  // Standaard vrijdag kiezen zodra de evaluaties geladen zijn.
  useEffect(() => {
    if (key === null && evaluations) setKey(keyFromHash(Date.now()) ?? defaultEvaluationKey(Date.now(), evaluations));
  }, [key, evaluations]);

  useEffect(() => {
    if (key) history.replaceState(null, '', `#/evaluatie/${key}`);
  }, [key]);

  if (!evaluations || !projects || !prefs || firstStart === undefined || key === null) return null;

  return (
    <div className="screen">
      <LiveBar clock={clock} />
      <div className="screen-header">
        <h1>Weekevaluatie</h1>
      </div>
      <FridayNav evaluationKey={key} evaluation={evaluations.find((e) => e.id === key)} onChange={setKey} />
      <EvaluationEditor
        key={key}
        evaluationKey={key}
        evaluations={evaluations}
        projects={projects}
        prefs={prefs}
        firstStart={firstStart}
      />
      <EarlierEvaluations evaluations={evaluations} current={key} onOpen={setKey} />
    </div>
  );
}

/** Compacte balk met de lopende sessie, zodat zichtbaar is dat de klok doorloopt. */
function LiveBar({ clock }: { clock: ClockController }) {
  const now = useNow(1000, clock.active !== null);
  if (!clock.active) return null;
  const project = clock.projects.find((p) => p.id === clock.active?.projectId);
  const paused = isPaused(clock.active);
  return (
    <a className="live-bar" href="#/" data-paused={paused ? 'true' : 'false'} style={{ '--swatch': project?.color } as CSSProperties}>
      <span className="status-dot" aria-hidden="true" />
      <span className="live-bar-project">{project?.name ?? 'Onbekend project'}</span>
      <span className="live-bar-timer tabular" role="timer">
        {formatClock(netMs(clock.active, now))}
      </span>
      {paused && <span className="badge">pauze</span>}
    </a>
  );
}

function FridayNav({
  evaluationKey: key,
  evaluation,
  onChange,
}: {
  evaluationKey: string;
  evaluation: Evaluation | undefined;
  onChange: (key: string) => void;
}) {
  const friday = parseEvaluationKey(key)!;
  const latest = evaluationKey(evaluationFriday(Date.now()));
  const next = shiftFriday(key, 1);
  return (
    <div className="period-nav">
      <button type="button" className="btn btn-icon" onClick={() => onChange(shiftFriday(key, -1))} aria-label="Vorige vrijdag">
        <ChevronLeftIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={() => onChange(next)}
        disabled={next > latest}
        aria-label="Volgende vrijdag"
      >
        <ChevronRightIcon />
      </button>
      <span className="period-label">
        Vrijdag {formatDate(friday)} <span className="muted small">· {evaluationPeriodLabel(friday)}</span>
      </span>
      <StatusBadge evaluation={evaluation} />
      {key !== latest && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(latest)}>
          Naar laatste vrijdag
        </button>
      )}
    </div>
  );
}

function StatusBadge({ evaluation }: { evaluation: Evaluation | undefined }) {
  if (!evaluation) return <span className="badge">nieuw</span>;
  return evaluation.status === 'afgerond' ? (
    <span className="badge badge-live">afgerond</span>
  ) : (
    <span className="badge badge-concept">concept</span>
  );
}

type Draft = Omit<EvaluationInput, 'goalHours'>;

function draftFrom(stored: Evaluation | undefined, previousFocus: string[]): Draft {
  const focus = stored?.focus ?? [];
  return {
    rating: stored?.rating ?? null,
    wentWell: stored?.wentWell ?? '',
    wentLess: stored?.wentLess ?? '',
    lesson: stored?.lesson ?? '',
    focus: Array.from({ length: MAX_FOCUS }, (_, i) => focus[i] ?? ''),
    focusReview: reviewFor(previousFocus, stored?.focusReview ?? []),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify({ ...a, focus: cleanFocus(a.focus) }) === JSON.stringify({ ...b, focus: cleanFocus(b.focus) });
}

function EvaluationEditor({
  evaluationKey: key,
  evaluations,
  projects,
  prefs,
  firstStart,
}: {
  evaluationKey: string;
  evaluations: Evaluation[];
  projects: Project[];
  prefs: Preferences;
  firstStart: number | null;
}) {
  const toast = useToast();
  const friday = parseEvaluationKey(key)!;
  const stored = evaluations.find((e) => e.id === key);
  const previous = previousEvaluation(evaluations, key);
  // Het doel van een bestaande evaluatie blijft zoals het toen was.
  const goalHours = stored ? stored.goalHours : prefs.weeklyGoalHours;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(stored, previous?.focus ?? []));
  const saved = useRef<Draft>(draftFrom(stored, previous?.focus ?? []));
  const latest = useRef(draft);
  latest.current = draft;
  const dirty = !sameDraft(draft, saved.current);

  const range = useMemo(() => evaluationRange(friday), [friday]);
  // Sessies van deze periode en de perioden ervoor (vergelijking en trends).
  const loadRange = useMemo(
    () => ({ start: evaluationRange(parseEvaluationKey(shiftFriday(key, -TREND_PERIODS))!).start, end: range.end }),
    [key, range.end],
  );
  const sessions = useSessionsInRange(loadRange);
  const isCurrent = Date.now() < range.end;
  const now = useNow(1000, isCurrent);

  const save = async (complete: boolean, quiet = false) => {
    const current = latest.current;
    await saveEvaluation(key, { ...current, goalHours }, complete);
    saved.current = current;
    if (!quiet) toast(complete ? 'Evaluatie afgerond' : 'Concept opgeslagen');
  };

  // Niets kwijtraken bij wegnavigeren of een andere vrijdag kiezen.
  useEffect(
    () => () => {
      if (!sameDraft(latest.current, saved.current)) void saveEvaluation(key, { ...latest.current, goalHours }, false);
    },
    [key, goalHours],
  );

  const goTo = (next: number) => {
    if (dirty) void save(false, true);
    setStep(next);
    window.scrollTo(0, 0);
  };

  const data = useMemo(() => {
    if (!sessions) return null;
    const stats = periodStats(sessions, range, now, goalHours, prefs.warnAfterHours);
    const prev = previousPeriods(sessions, key, TREND_PERIODS - 1, now, firstStart);
    const comparison = compareWithPrevious(
      stats.totalMs,
      prev.slice(-COMPARE_PERIODS).map((p) => p.totalMs),
    );
    return { stats, prev, comparison };
  }, [sessions, range, now, goalHours, prefs.warnAfterHours, key, firstStart]);

  if (!data) return null;
  const { stats, comparison } = data;
  const context = { stats, comparison, projects, focusReview: draft.focusReview };
  const trend = trends(
    trendHistory(
      data.prev,
      { key, totalMs: stats.totalMs, goalHours, rating: draft.rating, focus: cleanFocus(draft.focus) },
      evaluations,
      prefs.weeklyGoalHours,
    ),
  );
  const byId = projectMap(projects);

  return (
    <>
      <div className="segmented steps" role="group" aria-label="Stappen">
        {STEPS.map((label, i) => (
          <button key={label} type="button" aria-pressed={step === i} onClick={() => goTo(i)}>
            <span className="step-number">{i + 1}</span> {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <section className="card" aria-label="Cijfers van de periode">
          <div className="card-title">
            <h2>Cijfers van de periode</h2>
            {isCurrent && <span className="badge badge-live">loopt nog</span>}
          </div>
          <p className="muted small">Totaal gewerkt</p>
          <div className="stat-total">{formatDuration(stats.totalMs)}</div>
          <p className="muted small tabular">
            {formatDecimalNl(decimalHours(stats.totalMs))} uur
            {stats.goalMs !== null && stats.goalRatio !== null ? (
              <>
                {' '}
                · doel {formatDecimalNl(decimalHours(stats.goalMs))} uur ·{' '}
                <span className={stats.goalRatio >= 1 ? 'goal-reached' : undefined}>
                  {Math.round(stats.goalRatio * 100)}% behaald
                </span>
              </>
            ) : (
              <>
                {' '}
                · geen weekdoel ingesteld (<a href="#/projecten">instellen</a>)
              </>
            )}
          </p>
          {stats.goalRatio !== null && (
            <div className="project-bar-track goal-track">
              <div className="project-bar-fill" style={{ width: `${Math.min(100, stats.goalRatio * 100)}%` }} />
            </div>
          )}

          <h3>Per project</h3>
          {stats.perProject.length === 0 ? (
            <p className="empty">Geen uren in deze periode.</p>
          ) : (
            <div className="project-bars">
              {stats.perProject.map((row) => {
                const project = byId.get(row.projectId);
                return (
                  <div key={row.projectId} className="project-bar-row" style={{ '--swatch': project?.color } as CSSProperties}>
                    <span className="name">
                      <span className="swatch" />
                      <span>{project?.name ?? 'Onbekend project'}</span>
                    </span>
                    <span className="tabular">
                      {formatDuration(row.ms)} <span className="muted small">· {Math.round(row.share * 100)}%</span>
                    </span>
                    <div className="project-bar-track">
                      <div className="project-bar-fill" style={{ width: `${row.share * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <dl className="stat-grid">
            <Stat label="Gewerkte dagen">{stats.workedDays}</Stat>
            <Stat label="Langste dag">{dayStat(stats.longestDay)}</Stat>
            <Stat label="Kortste dag">{dayStat(stats.shortestDay)}</Stat>
            <Stat label="Gem. sessieduur">
              {stats.avgSessionMs === null ? '–' : formatDuration(stats.avgSessionMs)}
            </Stat>
            <Stat label={`T.o.v. gemiddelde vorige ${comparison?.periods ?? COMPARE_PERIODS} perioden`}>
              {comparison ? (
                <>
                  {comparison.diffMs >= 0 ? '+' : '−'}
                  {formatDuration(Math.abs(comparison.diffMs))}{' '}
                  <span className="muted small">(gem. {formatDuration(comparison.averageMs)})</span>
                </>
              ) : (
                <span className="muted">nog geen eerdere perioden</span>
              )}
            </Stat>
            <Stat label="Sessies zonder notitie">
              {stats.withoutNote} <span className="muted small">van {stats.sessionCount}</span>
            </Stat>
            <Stat label="Vergeten uit te klokken">
              {stats.forgottenClockOuts}{' '}
              <span className="muted small">(langer dan {prefs.warnAfterHours} uur)</span>
            </Stat>
          </dl>
        </section>
      )}

      {step === 1 && (
        <section className="card" aria-label="Terugblik op vorige focus">
          <div className="card-title">
            <h2>Terugblik op vorige focus</h2>
          </div>
          {!previous ? (
            <p className="empty">Er is nog geen eerdere evaluatie, dus ook geen focuspunten om op terug te kijken.</p>
          ) : draft.focusReview.length === 0 ? (
            <p className="empty">De evaluatie van vrijdag {formatDate(parseEvaluationKey(previous.id)!)} had geen focuspunten.</p>
          ) : (
            <>
              <p className="muted small">Focuspunten uit de evaluatie van vrijdag {formatDate(parseEvaluationKey(previous.id)!)}.</p>
              <ul className="list focus-review">
                {draft.focusReview.map((item, i) => (
                  <li key={item.text}>
                    <span>{item.text}</span>
                    <div className="segmented" role="group" aria-label={`Resultaat: ${item.text}`}>
                      {FOCUS_RESULTS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          data-result={r.value}
                          aria-pressed={item.result === r.value}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              focusReview: d.focusReview.map((f, j) =>
                                j === i ? { ...f, result: f.result === r.value ? null : r.value } : f,
                              ),
                            }))
                          }
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="card screen" aria-label="Reflectie" style={{ gap: 14 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            <h2>Reflectie</h2>
          </div>
          <div className="field">
            <span id="rating-label">Cijfer voor deze week</span>
            <div className="rating" role="group" aria-labelledby="rating-label">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={draft.rating === n}
                  onClick={() => setDraft((d) => ({ ...d, rating: d.rating === n ? null : n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <TextField label="Wat ging goed?" value={draft.wentWell} onChange={(v) => setDraft((d) => ({ ...d, wentWell: v }))} />
          <TextField
            label="Wat ging minder goed?"
            value={draft.wentLess}
            onChange={(v) => setDraft((d) => ({ ...d, wentLess: v }))}
          />
          <TextField label="Belangrijkste les" value={draft.lesson} onChange={(v) => setDraft((d) => ({ ...d, lesson: v }))} />
          <fieldset className="field focus-fields">
            <legend>Focus voor volgende week (max. {MAX_FOCUS} punten)</legend>
            {draft.focus.map((f, i) => (
              <input
                key={i}
                type="text"
                value={f}
                maxLength={200}
                placeholder={`Focuspunt ${i + 1}`}
                aria-label={`Focuspunt ${i + 1}`}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, focus: d.focus.map((x, j) => (j === i ? e.target.value : x)) }))
                }
              />
            ))}
          </fieldset>
        </section>
      )}

      {step === 3 && (
        <>
          <ConclusionCard title="Wat ging goed" points={strengths(context)} own={draft.wentWell} emptyText="Geen automatische pluspunten deze week." />
          <ConclusionCard title="Werkpunten" points={improvements(context)} own={draft.wentLess} emptyText="Geen automatische werkpunten deze week." />
          <section className="card" aria-label="Komende weken en maanden">
            <div className="card-title">
              <h2>Komende weken en maanden</h2>
              <span className="muted small">laatste {trend.periods} {trend.periods === 1 ? 'periode' : 'perioden'}</span>
            </div>
            <ul className="conclusion-list">
              {trend.points.map((p) => (
                <li key={p.id}>{p.text}</li>
              ))}
            </ul>
            {(draft.lesson.trim() || cleanFocus(draft.focus).length > 0) && (
              <div className="own-answers">
                {draft.lesson.trim() && (
                  <p>
                    <strong>Belangrijkste les:</strong> {draft.lesson.trim()}
                  </p>
                )}
                {cleanFocus(draft.focus).length > 0 && (
                  <>
                    <p>
                      <strong>Focus voor volgende week:</strong>
                    </p>
                    <ol>
                      {cleanFocus(draft.focus).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <div className="evaluation-actions">
        <button type="button" className="btn" onClick={() => goTo(step - 1)} disabled={step === 0}>
          <ChevronLeftIcon /> Vorige
        </button>
        <div className="row">
          <button type="button" className="btn" onClick={() => void save(false)} disabled={!dirty}>
            {stored?.status === 'afgerond' ? 'Wijzigingen opslaan' : 'Concept opslaan'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => goTo(step + 1)}>
              Volgende <ChevronRightIcon />
            </button>
          ) : (
            stored?.status !== 'afgerond' && (
              <button type="button" className="btn btn-primary" onClick={() => void save(true)}>
                Evaluatie afronden
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}

function dayStat(day: { day: string; ms: number } | null): ReactNode {
  if (!day) return '–';
  return (
    <>
      {formatDuration(day.ms)} <span className="muted small">({formatDayShort(combineDateTime(day.day, '00:00'))})</span>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="tabular">{children}</dd>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={4000} />
    </label>
  );
}

function ConclusionCard({ title, points, own, emptyText }: { title: string; points: Point[]; own: string; emptyText: string }) {
  return (
    <section className="card" aria-label={title}>
      <div className="card-title">
        <h2>{title}</h2>
      </div>
      {points.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <ul className="conclusion-list">
          {points.map((p) => (
            <li key={p.id}>{p.text}</li>
          ))}
        </ul>
      )}
      {own.trim() && (
        <div className="own-answers">
          <p>
            <strong>Jouw antwoord:</strong>
          </p>
          <p className="pre-line">{own.trim()}</p>
        </div>
      )}
    </section>
  );
}

function EarlierEvaluations({
  evaluations,
  current,
  onOpen,
}: {
  evaluations: Evaluation[];
  current: string;
  onOpen: (key: string) => void;
}) {
  const oldest = evaluations[evaluations.length - 1];
  const range = useMemo(
    () =>
      oldest
        ? { start: evaluationRange(parseEvaluationKey(oldest.id)!).start, end: evaluationRange(parseEvaluationKey(evaluations[0]!.id)!).end }
        : { start: 0, end: 0 },
    [oldest, evaluations],
  );
  const sessions = useSessionsInRange(range);
  const now = useNow(60_000);

  return (
    <section className="card" aria-label="Eerdere evaluaties">
      <div className="card-title">
        <h2>Eerdere evaluaties</h2>
      </div>
      {evaluations.length === 0 ? (
        <p className="empty">Nog geen evaluaties opgeslagen.</p>
      ) : (
        <ul className="list">
          {evaluations.map((e) => {
            const friday = parseEvaluationKey(e.id);
            if (friday === null) return null;
            const total = sessions ? totalsInRange(sessions, evaluationRange(friday), now).total : null;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className="evaluation-row"
                  aria-current={e.id === current ? 'true' : undefined}
                  onClick={() => {
                    onOpen(e.id);
                    window.scrollTo(0, 0);
                  }}
                >
                  <span className="evaluation-row-date">
                    Vrijdag {formatDate(friday)} <StatusBadge evaluation={e} />
                  </span>
                  <span className="tabular small">
                    <span className="muted">cijfer</span> {e.rating ?? '–'} · {total === null ? '…' : formatDuration(total)}
                    {total !== null && goalRatio(total, e.goalHours) !== null && (
                      <>
                        {' '}
                        · <span className="muted">doel</span> {Math.round(goalRatio(total, e.goalHours)! * 100)}%
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
