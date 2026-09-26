import type { Preferences, Project, Session } from '../types';
import type { PeriodTotals } from './time';

const HOUR = 3_600_000;

export interface GoalProgress {
  /** `null` = totaaldoel; anders het project. */
  project: Project | null;
  doneMs: number;
  goalMs: number;
  /** 0..1 (kan boven 1 uitkomen als het doel gehaald is). */
  ratio: number;
  remainingMs: number;
}

/** Voortgang van de weekdoelen (totaal en per project) op basis van de weektotalen. */
export function weekGoalProgress(totals: PeriodTotals, prefs: Preferences, projects: Project[]): GoalProgress[] {
  const result: GoalProgress[] = [];
  if (prefs.weeklyGoalHours) result.push(progress(null, totals.total, prefs.weeklyGoalHours));
  for (const p of projects) {
    if (p.weeklyGoalHours && (!p.archived || totals.perProject.has(p.id))) {
      result.push(progress(p, totals.perProject.get(p.id) ?? 0, p.weeklyGoalHours));
    }
  }
  return result;
}

function progress(project: Project | null, doneMs: number, goalHours: number): GoalProgress {
  const goalMs = goalHours * HOUR;
  return { project, doneMs, goalMs, ratio: goalMs > 0 ? doneMs / goalMs : 0, remainingMs: Math.max(0, goalMs - doneMs) };
}

/**
 * Loopt de sessie verdacht lang (vergeten uit te klokken)? Kijkt naar de verstreken kloktijd
 * sinds de start, dus ook een lange pauze telt mee.
 */
export function isLongRunning(session: Pick<Session, 'start' | 'end'>, now: number, warnAfterHours: number): boolean {
  return session.end === null && now - session.start > warnAfterHours * HOUR;
}
