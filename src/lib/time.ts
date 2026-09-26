/**
 * Pure tijdberekeningen. Alle rekenlogica voor gewerkte tijd staat hier (en is getest),
 * zodat schermen en exports altijd dezelfde uitkomst tonen.
 */
import { addDays, startOfDay } from 'date-fns';
import type { Pause, Range, Session } from '../types';
import { dayKey } from './dates';

export interface Interval {
  start: number;
  end: number;
}

/** Einde van de sessie, of `now` als hij nog loopt. */
export function sessionEnd(session: Pick<Session, 'end'>, now: number): number {
  return session.end ?? now;
}

export function isRunning(session: Pick<Session, 'end'>): boolean {
  return session.end === null;
}

export function activePause(session: Pick<Session, 'pauses' | 'end'>): Pause | undefined {
  if (session.end !== null) return undefined;
  return session.pauses.find((p) => p.end === null);
}

export function isPaused(session: Pick<Session, 'pauses' | 'end'>): boolean {
  return activePause(session) !== undefined;
}

/** Pauzes als gesloten intervallen, afgekapt op de sessie en samengevoegd waar ze overlappen. */
export function pauseIntervals(session: Pick<Session, 'start' | 'end' | 'pauses'>, now: number): Interval[] {
  const end = sessionEnd(session, now);
  const clipped = session.pauses
    .map((p) => ({ start: Math.max(p.start, session.start), end: Math.min(p.end ?? now, end) }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);
  return mergeIntervals(clipped);
}

/** Gewerkte intervallen: de sessie min de pauzes. */
export function workIntervals(session: Pick<Session, 'start' | 'end' | 'pauses'>, now: number): Interval[] {
  const end = sessionEnd(session, now);
  if (end <= session.start) return [];
  const result: Interval[] = [];
  let cursor = session.start;
  for (const p of pauseIntervals(session, now)) {
    if (p.start > cursor) result.push({ start: cursor, end: p.start });
    cursor = Math.max(cursor, p.end);
  }
  if (end > cursor) result.push({ start: cursor, end });
  return result;
}

export function grossMs(session: Pick<Session, 'start' | 'end'>, now: number): number {
  return Math.max(0, sessionEnd(session, now) - session.start);
}

export function pauseMs(session: Pick<Session, 'start' | 'end' | 'pauses'>, now: number): number {
  return sumIntervals(pauseIntervals(session, now));
}

/** Netto gewerkte tijd: bruto min pauzes, nooit negatief. */
export function netMs(session: Pick<Session, 'start' | 'end' | 'pauses'>, now: number): number {
  return sumIntervals(workIntervals(session, now));
}

/** Knipt een interval op lokale middernacht. Houdt rekening met zomer-/wintertijd. */
export function splitIntervalByDay(interval: Interval): { day: string; ms: number }[] {
  const parts: { day: string; ms: number }[] = [];
  let cursor = interval.start;
  while (cursor < interval.end) {
    const nextMidnight = addDays(startOfDay(cursor), 1).getTime();
    const partEnd = Math.min(nextMidnight, interval.end);
    parts.push({ day: dayKey(cursor), ms: partEnd - cursor });
    cursor = partEnd;
  }
  return parts;
}

/** Gewerkte tijd per kalenderdag voor één sessie. Een sessie over middernacht telt op beide dagen. */
export function splitByDay(session: Pick<Session, 'start' | 'end' | 'pauses'>, now: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of workIntervals(session, now)) {
    for (const part of splitIntervalByDay(w)) {
      map.set(part.day, (map.get(part.day) ?? 0) + part.ms);
    }
  }
  return map;
}

export interface PeriodTotals {
  total: number;
  /** projectId → ms */
  perProject: Map<string, number>;
  /** dagKey → (projectId → ms) */
  perDay: Map<string, Map<string, number>>;
}

/**
 * Totalen binnen een bereik. Alleen het deel van een sessie dat binnen het bereik valt telt mee,
 * dus een sessie over de week- of maandgrens wordt eerlijk verdeeld.
 */
export function totalsInRange(sessions: Session[], range: Range, now: number): PeriodTotals {
  const perProject = new Map<string, number>();
  const perDay = new Map<string, Map<string, number>>();
  let total = 0;

  for (const s of sessions) {
    for (const w of workIntervals(s, now)) {
      const clipped = clipInterval(w, range);
      if (!clipped) continue;
      for (const part of splitIntervalByDay(clipped)) {
        total += part.ms;
        perProject.set(s.projectId, (perProject.get(s.projectId) ?? 0) + part.ms);
        let day = perDay.get(part.day);
        if (!day) perDay.set(part.day, (day = new Map()));
        day.set(s.projectId, (day.get(s.projectId) ?? 0) + part.ms);
      }
    }
  }
  return { total, perProject, perDay };
}

/** Sessies die (deels) in het bereik vallen. */
export function sessionsInRange(sessions: Session[], range: Range, now: number): Session[] {
  return sessions.filter((s) => s.start < range.end && sessionEnd(s, now) > range.start);
}

/**
 * Bij handmatig aanpassen van de pauzeduur: één pauze-interval midden in de sessie.
 * Een pauze langer dan de sessie wordt begrensd op de sessieduur.
 */
export function centeredPause(start: number, end: number, pauseDurationMs: number): Pause[] {
  const duration = Math.min(Math.max(0, pauseDurationMs), Math.max(0, end - start));
  if (duration <= 0) return [];
  const pStart = Math.round(start + (end - start - duration) / 2);
  return [{ start: pStart, end: pStart + duration }];
}

/** Controleert een afgeronde sessie; geeft een Nederlandse foutmelding of `null`. */
export function validateSession(start: number, end: number, pauseDurationMs: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Vul een geldige datum en tijd in.';
  if (end <= start) return 'De eindtijd moet na de starttijd liggen.';
  if (end - start > 7 * 24 * 60 * 60_000) return 'Een sessie kan niet langer dan 7 dagen duren.';
  if (pauseDurationMs < 0) return 'De pauze kan niet negatief zijn.';
  if (pauseDurationMs >= end - start) return 'De pauze moet korter zijn dan de sessie.';
  return null;
}

/** Eerste andere sessie die overlapt met het gegeven interval (voor een waarschuwing). */
export function findOverlap(
  sessions: Session[],
  candidate: { id?: string; start: number; end: number },
  now: number,
): Session | undefined {
  return sessions.find(
    (s) => s.id !== candidate.id && s.start < candidate.end && sessionEnd(s, now) > candidate.start,
  );
}

function clipInterval(i: Interval, range: Range): Interval | null {
  const start = Math.max(i.start, range.start);
  const end = Math.min(i.end, range.end);
  return end > start ? { start, end } : null;
}

function mergeIntervals(sorted: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged;
}

function sumIntervals(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}
