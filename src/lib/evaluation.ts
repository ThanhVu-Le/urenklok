/**
 * Weekevaluatie: cijfers van een evaluatieperiode, automatische punten ("wat ging goed" en "werkpunten")
 * en trends over meerdere perioden. Alles puur en getest; het scherm toont alleen de uitkomst.
 */
import type { FocusReview, Project, Range, Session } from '../types';
import { evaluationRange, formatDuration, formatNumberNl, parseEvaluationKey, shiftFriday } from './dates';
import { grossMs, netMs, totalsInRange } from './time';

// ---------- Drempelwaarden ----------

/** Vanaf zoveel gewerkte dagen is dat een pluspunt. */
export const GOOD_WORKED_DAYS = 5;
/** Zoveel meer (of minder) dan het gemiddelde van de vorige perioden telt als verschil (0,05 = 5%). */
export const AVERAGE_MARGIN = 0.05;
/** Aandeel Administratie in de uren vanaf waar het een werkpunt kan zijn… */
export const ADMIN_SHARE_HIGH = 0.25;
/** …als tegelijk minder dan dit aandeel naar inkomstenprojecten (projecten met een uurtarief) ging. */
export const INCOME_SHARE_LOW = 0.5;
/** Aandeel sessies zonder notitie vanaf waar het een werkpunt is. */
export const NO_NOTE_SHARE_HIGH = 0.3;
/** Onregelmatige dagen: variatiecoëfficiënt (standaardafwijking / gemiddelde) van de dagtotalen vanaf deze waarde… */
export const IRREGULAR_CV = 0.5;
/** …en pas vanaf zoveel gewerkte dagen. */
export const IRREGULAR_MIN_DAYS = 3;
/** Aantal voorgaande perioden voor de vergelijking met het gemiddelde. */
export const COMPARE_PERIODS = 4;
/** Maximaal aantal perioden voor trends. */
export const TREND_PERIODS = 12;
/** Minimaal aantal perioden voordat er een urentrend getoond wordt. */
export const MIN_TREND_PERIODS = 4;
/** Verschil tussen recente en eerdere perioden vanaf waar uren stijgend/dalend heten (0,1 = 10%). */
export const TREND_MARGIN = 0.1;
/** Een focuspunt is terugkerend als het in zoveel evaluaties voorkomt. */
export const RECURRING_FOCUS_MIN = 2;
/** Maximaal aantal focuspunten per week. */
export const MAX_FOCUS = 3;
/** Projectnaam (kleine letters) waaraan het administratieproject herkend wordt. */
export const ADMIN_PROJECT_NAME = 'administratie';

const HOUR = 3_600_000;

// ---------- Cijfers van de periode ----------

export interface PeriodStats {
  totalMs: number;
  /** `null` = geen weekdoel. */
  goalMs: number | null;
  /** Behaald deel van het doel (1 = precies gehaald); `null` = geen doel. */
  goalRatio: number | null;
  /** Per project, meeste uren eerst. `share` is 0..1 van het totaal. */
  perProject: { projectId: string; ms: number; share: number }[];
  workedDays: number;
  longestDay: { day: string; ms: number } | null;
  shortestDay: { day: string; ms: number } | null;
  /** Gewerkte tijd per gewerkte dag (op datum). */
  dayTotals: { day: string; ms: number }[];
  /** Sessies die in de periode begonnen. */
  sessionCount: number;
  avgSessionMs: number | null;
  withoutNote: number;
  /** Sessies die langer liepen dan de waarschuwingsduur (vergeten uit te klokken). */
  forgottenClockOuts: number;
}

/**
 * Cijfers van een periode. Uren worden op lokale middernacht geknipt (zoals `totalsInRange`);
 * sessietellingen gaan over sessies die in de periode begonnen. Een lopende sessie telt mee tot `now`.
 */
export function periodStats(
  sessions: Session[],
  range: Range,
  now: number,
  goalHours: number | null,
  warnAfterHours: number,
): PeriodStats {
  const totals = totalsInRange(sessions, range, now);
  const totalMs = totals.total;

  const perProject = [...totals.perProject.entries()]
    .filter(([, ms]) => ms > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([projectId, ms]) => ({ projectId, ms, share: totalMs > 0 ? ms / totalMs : 0 }));

  const dayTotals = [...totals.perDay.entries()]
    .map(([day, m]) => ({ day, ms: [...m.values()].reduce((a, b) => a + b, 0) }))
    .filter((d) => d.ms > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  const byLength = [...dayTotals].sort((a, b) => b.ms - a.ms || a.day.localeCompare(b.day));

  const started = sessions.filter((s) => s.start >= range.start && s.start < range.end);
  const sessionNet = started.map((s) => netMs(s, now));

  const goalMs = goalHours && goalHours > 0 ? goalHours * HOUR : null;

  return {
    totalMs,
    goalMs,
    goalRatio: goalMs ? totalMs / goalMs : null,
    perProject,
    workedDays: dayTotals.length,
    longestDay: byLength[0] ?? null,
    shortestDay: byLength[byLength.length - 1] ?? null,
    dayTotals,
    sessionCount: started.length,
    avgSessionMs: started.length > 0 ? sessionNet.reduce((a, b) => a + b, 0) / started.length : null,
    withoutNote: started.filter((s) => s.note.trim() === '').length,
    forgottenClockOuts: started.filter((s) => grossMs(s, now) > warnAfterHours * HOUR).length,
  };
}

/** Is het doel gehaald? Precies gehaald telt ook. */
export function goalReached(totalMs: number, goalHours: number | null): boolean | null {
  if (!goalHours || goalHours <= 0) return null;
  return totalMs >= goalHours * HOUR;
}

// ---------- Vergelijking met voorgaande perioden ----------

/**
 * Totalen van de `count` perioden vóór de vrijdag `key`, oudste eerst. Perioden die helemaal vóór
 * de allereerste sessie liggen tellen niet mee (anders drukken lege weken van vóór het app-gebruik het gemiddelde).
 */
export function previousPeriods(
  sessions: Session[],
  key: string,
  count: number,
  now: number,
): { key: string; totalMs: number }[] {
  if (sessions.length === 0) return [];
  const firstStart = Math.min(...sessions.map((s) => s.start));
  const result: { key: string; totalMs: number }[] = [];
  for (let i = count; i >= 1; i--) {
    const k = shiftFriday(key, -i);
    const range = evaluationRange(parseEvaluationKey(k)!);
    if (range.end <= firstStart) continue;
    result.push({ key: k, totalMs: totalsInRange(sessions, range, now).total });
  }
  return result;
}

export interface Comparison {
  periods: number;
  averageMs: number;
  diffMs: number;
  /** Verschil als deel van het gemiddelde; `null` als het gemiddelde 0 is. */
  diffRatio: number | null;
}

/** Vergelijkt het totaal met het gemiddelde van de voorgaande perioden; `null` zonder voorgaande perioden. */
export function compareWithPrevious(totalMs: number, previousTotals: number[]): Comparison | null {
  if (previousTotals.length === 0) return null;
  const averageMs = previousTotals.reduce((a, b) => a + b, 0) / previousTotals.length;
  const diffMs = totalMs - averageMs;
  return { periods: previousTotals.length, averageMs, diffMs, diffRatio: averageMs > 0 ? diffMs / averageMs : null };
}

// ---------- Automatische punten ----------

export interface Point {
  id: string;
  text: string;
}

export interface EvaluationContext {
  stats: PeriodStats;
  comparison: Comparison | null;
  projects: Project[];
  /** Terugblik op de focuspunten van de vorige evaluatie (leeg als die er niet is). */
  focusReview: FocusReview[];
}

/** Automatische punten voor "Wat ging goed". */
export function strengths({ stats, comparison, focusReview }: EvaluationContext): Point[] {
  const points: Point[] = [];
  if (stats.goalMs !== null && stats.goalRatio !== null && stats.goalRatio >= 1) {
    points.push({
      id: 'goal-reached',
      text: `Weekdoel gehaald: ${formatDuration(stats.totalMs)} van ${formatNumberNl(stats.goalMs / HOUR)} uur (${pct(stats.goalRatio)}).`,
    });
  }
  if (comparison && comparison.diffRatio !== null && comparison.diffRatio >= AVERAGE_MARGIN) {
    points.push({
      id: 'above-average',
      text: `${formatDuration(comparison.diffMs)} meer dan gemiddeld (${formatDuration(comparison.averageMs)} over de vorige ${periodsLabel(comparison.periods)}).`,
    });
  }
  if (stats.workedDays >= GOOD_WORKED_DAYS) {
    points.push({ id: 'worked-days', text: `Op ${stats.workedDays} dagen gewerkt.` });
  }
  const achieved = focusReview.filter((f) => f.result === 'gelukt');
  if (achieved.length > 0) {
    points.push({
      id: 'focus-achieved',
      text: `${achieved.length} van ${focusReview.length} focuspunten gelukt: ${achieved.map((f) => f.text).join('; ')}.`,
    });
  }
  if (stats.sessionCount > 0 && stats.withoutNote === 0) {
    points.push({ id: 'notes-complete', text: 'Bij alle sessies een notitie.' });
  }
  return points;
}

/** Automatische punten voor "Werkpunten". */
export function improvements({ stats, comparison, projects, focusReview }: EvaluationContext): Point[] {
  const points: Point[] = [];
  if (stats.totalMs === 0) {
    points.push({ id: 'no-hours', text: 'Geen uren geregistreerd in deze periode.' });
  }
  if (stats.goalMs !== null && stats.goalRatio !== null && stats.goalRatio < 1) {
    points.push({
      id: 'goal-missed',
      text: `Weekdoel niet gehaald: ${formatDuration(stats.totalMs)} van ${formatNumberNl(stats.goalMs / HOUR)} uur (${pct(stats.goalRatio)}), ${formatDuration(stats.goalMs - stats.totalMs)} te kort.`,
    });
  }
  if (comparison && comparison.diffRatio !== null && comparison.diffRatio <= -AVERAGE_MARGIN) {
    points.push({
      id: 'below-average',
      text: `${formatDuration(-comparison.diffMs)} minder dan gemiddeld (${formatDuration(comparison.averageMs)} over de vorige ${periodsLabel(comparison.periods)}).`,
    });
  }
  const shares = projectShares(stats, projects);
  if (shares && shares.admin >= ADMIN_SHARE_HIGH && shares.income < INCOME_SHARE_LOW) {
    points.push({
      id: 'admin-heavy',
      text: `Veel tijd naar Administratie (${pct(shares.admin)}) en weinig naar inkomstenprojecten (${pct(shares.income)}).`,
    });
  }
  if (stats.sessionCount > 0 && stats.withoutNote / stats.sessionCount >= NO_NOTE_SHARE_HIGH) {
    points.push({
      id: 'notes-missing',
      text: `${stats.withoutNote} van ${stats.sessionCount} sessies zonder notitie.`,
    });
  }
  if (stats.workedDays >= IRREGULAR_MIN_DAYS && variation(stats.dayTotals.map((d) => d.ms)) >= IRREGULAR_CV) {
    points.push({
      id: 'irregular',
      text: `Onregelmatige dagen: van ${formatDuration(stats.shortestDay!.ms)} tot ${formatDuration(stats.longestDay!.ms)}.`,
    });
  }
  const missed = focusReview.filter((f) => f.result === 'niet');
  if (missed.length > 0) {
    points.push({
      id: 'focus-missed',
      text: `${missed.length} van ${focusReview.length} focuspunten niet gelukt: ${missed.map((f) => f.text).join('; ')}.`,
    });
  }
  if (stats.forgottenClockOuts > 0) {
    points.push({
      id: 'forgotten',
      text: `${stats.forgottenClockOuts} keer vergeten uit te klokken.`,
    });
  }
  return points;
}

/**
 * Aandeel Administratie en inkomstenprojecten (met uurtarief) in de uren.
 * `null` als er geen uren zijn of geen enkel project een tarief heeft (dan zegt de regel niets).
 */
export function projectShares(stats: PeriodStats, projects: Project[]): { admin: number; income: number } | null {
  if (stats.totalMs === 0 || !projects.some((p) => p.hourlyRate)) return null;
  const byId = new Map(projects.map((p) => [p.id, p]));
  let admin = 0;
  let income = 0;
  for (const row of stats.perProject) {
    const p = byId.get(row.projectId);
    if (!p) continue;
    if (p.name.trim().toLowerCase().includes(ADMIN_PROJECT_NAME)) admin += row.share;
    else if (p.hourlyRate) income += row.share;
  }
  return { admin, income };
}

// ---------- Trends ----------

export interface TrendPeriod {
  key: string;
  totalMs: number;
  goalHours: number | null;
  /** Alleen bij een (afgeronde of concept-)evaluatie. */
  rating: number | null;
  focus: string[];
}

export interface Trends {
  periods: number;
  hours: { direction: 'stijgend' | 'dalend' | 'stabiel'; recentAvgMs: number; earlierAvgMs: number; span: number } | null;
  goal: { reached: number; counted: number } | null;
  rating: { average: number; count: number } | null;
  recurringFocus: { text: string; count: number }[];
  points: Point[];
}

/** Trends over de laatste perioden (oudste eerst, inclusief de huidige; maximaal `TREND_PERIODS`). */
export function trends(history: TrendPeriod[]): Trends {
  const list = history.slice(-TREND_PERIODS);
  const points: Point[] = [];

  let hours: Trends['hours'] = null;
  if (list.length >= MIN_TREND_PERIODS) {
    const span = Math.min(4, Math.floor(list.length / 2));
    const recentAvgMs = average(list.slice(-span).map((p) => p.totalMs));
    const earlierAvgMs = average(list.slice(-2 * span, -span).map((p) => p.totalMs));
    const change = earlierAvgMs > 0 ? (recentAvgMs - earlierAvgMs) / earlierAvgMs : recentAvgMs > 0 ? 1 : 0;
    const direction = change >= TREND_MARGIN ? 'stijgend' : change <= -TREND_MARGIN ? 'dalend' : 'stabiel';
    hours = { direction, recentAvgMs, earlierAvgMs, span };
    points.push({
      id: 'hours-trend',
      text: `Uren ${direction}: gemiddeld ${formatDuration(recentAvgMs)} per week in de laatste ${span} perioden, ${formatDuration(earlierAvgMs)} in de ${span} daarvoor.`,
    });
  } else {
    points.push({
      id: 'too-few',
      text: `Nog te weinig perioden voor een urentrend (${list.length} van minimaal ${MIN_TREND_PERIODS}).`,
    });
  }

  const withGoal = list.filter((p) => p.goalHours && p.goalHours > 0);
  const goal = withGoal.length > 0
    ? { reached: withGoal.filter((p) => goalReached(p.totalMs, p.goalHours)).length, counted: withGoal.length }
    : null;
  if (goal) {
    points.push({ id: 'goal-trend', text: `Weekdoel ${goal.reached} van de laatste ${goal.counted} weken gehaald.` });
  }

  const ratings = list.map((p) => p.rating).filter((r): r is number => r !== null);
  const rating = ratings.length > 0 ? { average: average(ratings), count: ratings.length } : null;
  if (rating) {
    points.push({
      id: 'rating-trend',
      text: `Gemiddeld cijfer ${formatNumberNl(Math.round(rating.average * 10) / 10)} over ${rating.count} ${rating.count === 1 ? 'evaluatie' : 'evaluaties'}.`,
    });
  }

  const recurringFocus = recurring(list.map((p) => p.focus));
  for (const f of recurringFocus) {
    points.push({
      id: `focus-${normalizeFocus(f.text)}`,
      text: `Focuspunt komt ${f.count} weken terug: "${f.text}". Maak het concreter of plan er vaste tijd voor.`,
    });
  }

  return { periods: list.length, hours, goal, rating, recurringFocus, points };
}

/** Focuspunten die in meerdere evaluaties voorkomen (hoofdletters en spaties maken niet uit). Meest voorkomend eerst. */
export function recurring(focusLists: string[][]): { text: string; count: number }[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const list of focusLists) {
    for (const norm of new Set(list.map(normalizeFocus).filter(Boolean))) {
      const text = list.find((f) => normalizeFocus(f) === norm)!.trim();
      const entry = counts.get(norm);
      counts.set(norm, { text, count: (entry?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .filter((e) => e.count >= RECURRING_FOCUS_MIN)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}

/** Maximaal `MAX_FOCUS` ingevulde focuspunten, zonder lege regels. */
export function cleanFocus(focus: string[]): string[] {
  return focus.map((f) => f.trim()).filter(Boolean).slice(0, MAX_FOCUS);
}

/**
 * Terugblik op de vorige focuspunten: neemt bestaande oordelen over als de tekst gelijk is,
 * zodat een aangepaste vorige evaluatie niet alle oordelen wist.
 */
export function reviewFor(previousFocus: string[], existing: FocusReview[]): FocusReview[] {
  return cleanFocus(previousFocus).map((text) => ({
    text,
    result: existing.find((r) => normalizeFocus(r.text) === normalizeFocus(text))?.result ?? null,
  }));
}

function normalizeFocus(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Variatiecoëfficiënt (standaardafwijking / gemiddelde); 0 bij minder dan twee waarden. */
export function variation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2))) / mean;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function periodsLabel(n: number): string {
  return n === 1 ? 'periode' : `${n} perioden`;
}
