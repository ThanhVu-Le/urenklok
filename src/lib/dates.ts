import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfISOWeek,
  format,
  getDay,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  parse,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
  subDays,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import type { Evaluation, PeriodKind, Range } from '../types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** dd-mm-jjjj */
export function formatDate(t: number | Date): string {
  return format(t, 'dd-MM-yyyy');
}

/** 24-uursnotatie, uu:mm */
export function formatTime(t: number | Date): string {
  return format(t, 'HH:mm');
}

/** Bijv. "vrijdag 26-09-2026" */
export function formatDayLong(t: number | Date): string {
  return format(t, "EEEE dd-MM-yyyy", { locale: nl });
}

/** Bijv. "ma 22-09" */
export function formatDayShort(t: number | Date): string {
  return format(t, 'EEEEEE dd-MM', { locale: nl });
}

/** Sleutel voor een kalenderdag in lokale tijd: jjjj-mm-dd (sorteerbaar). */
export function dayKey(t: number | Date): string {
  return format(t, 'yyyy-MM-dd');
}

/** Timerweergave uu:mm:ss (uren kunnen boven de 24 uitkomen). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Compacte duur, bijv. "7u 05m" of "45m". Afgerond op hele minuten. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / MINUTE);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}u ${pad(m)}m`;
}

/** Uren als decimaal getal, afgerond op 2 decimalen (7,5 uur = 7.5). */
export function decimalHours(ms: number): number {
  return Math.round((ms / HOUR) * 100) / 100;
}

/** Decimaal getal in Nederlandse notatie met 2 decimalen: 7.5 → "7,50". */
export function formatDecimalNl(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Combineert een datum (jjjj-mm-dd, zoals <input type="date">) en tijd (uu:mm) tot epoch-ms. */
export function combineDateTime(date: string, time: string): number {
  return parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date()).getTime();
}

/** Waarde voor <input type="date">. */
export function toDateInput(t: number | Date): string {
  return format(t, 'yyyy-MM-dd');
}

/** Waarde voor <input type="time">. */
export function toTimeInput(t: number | Date): string {
  return format(t, 'HH:mm');
}

export function isToday(t: number | Date, now: number = Date.now()): boolean {
  return isSameDay(t, now);
}

/** Aantal kalenderdagen tussen twee tijdstippen (0 = zelfde dag). */
export function calendarDaysBetween(a: number, b: number): number {
  return differenceInCalendarDays(b, a);
}

// ---------- Periodes ----------

/** Begin en (exclusief) einde van de dag/ISO-week/maand waarin `anchor` valt. */
export function periodRange(kind: PeriodKind, anchor: number | Date): Range {
  switch (kind) {
    case 'day': {
      const s = startOfDay(anchor);
      return { start: s.getTime(), end: addDays(s, 1).getTime() };
    }
    case 'week': {
      const s = startOfISOWeek(anchor);
      return { start: s.getTime(), end: addWeeks(s, 1).getTime() };
    }
    case 'month': {
      const s = startOfMonth(anchor);
      return { start: s.getTime(), end: addMonths(s, 1).getTime() };
    }
  }
}

export function shiftPeriod(kind: PeriodKind, anchor: number, delta: number): number {
  switch (kind) {
    case 'day':
      return addDays(anchor, delta).getTime();
    case 'week':
      return addWeeks(anchor, delta).getTime();
    case 'month':
      return addMonths(anchor, delta).getTime();
  }
}

export function isoWeek(t: number | Date): { week: number; year: number } {
  return { week: getISOWeek(t), year: getISOWeekYear(t) };
}

export function periodLabel(kind: PeriodKind, anchor: number): string {
  switch (kind) {
    case 'day':
      return formatDayLong(anchor);
    case 'week': {
      const { week, year } = isoWeek(anchor);
      return `Week ${week} (${year}) · ${formatDate(startOfISOWeek(anchor))} – ${formatDate(endOfISOWeek(anchor))}`;
    }
    case 'month':
      return format(anchor, 'LLLL yyyy', { locale: nl });
  }
}

/** Alle kalenderdagen (begin van de dag) binnen een bereik. */
export function daysInRange(range: Range): number[] {
  const days: number[] = [];
  for (let d = startOfDay(range.start); d.getTime() < range.end; d = addDays(d, 1)) {
    days.push(d.getTime());
  }
  return days;
}

// ---------- Weekevaluatie (zaterdag 00:00 t/m vrijdag 23:59) ----------

const FRIDAY = 5;
/** Zo ver kijkt de evaluatie standaard terug naar een openstaande vrijdag. */
const OPEN_LOOKBACK_WEEKS = 8;

/** Begin van de vrijdag op of vóór `t`: op vrijdag die dag zelf, op zaterdag de dag ervoor. */
export function evaluationFriday(t: number | Date): number {
  const day = startOfDay(t);
  return subDays(day, (getDay(day) - FRIDAY + 7) % 7).getTime();
}

/** Evaluatieperiode die eindigt op de vrijdag `friday`: zaterdag 00:00 t/m vrijdag 23:59 (einde exclusief). */
export function evaluationRange(friday: number | Date): Range {
  const f = startOfDay(friday);
  return { start: subDays(f, 6).getTime(), end: addDays(f, 1).getTime() };
}

/** Sleutel van een evaluatie: datum van de vrijdag, jjjj-mm-dd. */
export function evaluationKey(friday: number | Date): string {
  return dayKey(friday);
}

/** Tijdstip (begin van de dag) van een evaluatiesleutel, of `null` als het geen geldige vrijdag is. */
export function parseEvaluationKey(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = parse(key, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime()) || dayKey(d) !== key || getDay(d) !== FRIDAY) return null;
  return d.getTime();
}

/** Schuift een evaluatiesleutel `weeks` vrijdagen op. */
export function shiftFriday(key: string, weeks: number): string {
  const t = parseEvaluationKey(key);
  if (t === null) throw new Error(`Geen geldige vrijdag: ${key}`);
  return evaluationKey(addWeeks(t, weeks));
}

type EvaluationStatus = Pick<Evaluation, 'id' | 'status'>;

function isCompleted(key: string, evaluations: EvaluationStatus[]): boolean {
  return evaluations.some((e) => e.id === key && e.status === 'afgerond');
}

/**
 * Openstaande evaluatie voor de melding op het klokscherm: de meest recente vrijdag (vandaag of eerder)
 * als die nog niet is afgerond. Zo blijft de melding van vrijdag t/m de donderdag erna staan.
 */
export function openEvaluation(
  now: number,
  evaluations: EvaluationStatus[],
): { key: string; friday: number; isToday: boolean } | null {
  const friday = evaluationFriday(now);
  const key = evaluationKey(friday);
  if (isCompleted(key, evaluations)) return null;
  return { key, friday, isToday: isSameDay(friday, now) };
}

/**
 * Welke vrijdag het evaluatiescherm standaard opent: op vrijdag vandaag, anders de meest recente
 * vrijdag zonder afgeronde evaluatie (hooguit 8 weken terug), anders de laatste vrijdag.
 */
export function defaultEvaluationKey(now: number, evaluations: EvaluationStatus[]): string {
  const latest = evaluationKey(evaluationFriday(now));
  if (isSameDay(evaluationFriday(now), now)) return latest;
  for (let i = 0; i < OPEN_LOOKBACK_WEEKS; i++) {
    const key = shiftFriday(latest, -i);
    if (!isCompleted(key, evaluations)) return key;
  }
  return latest;
}

/** Bijv. "za 20-09 – vr 26-09-2026". */
export function evaluationPeriodLabel(friday: number): string {
  const { start } = evaluationRange(friday);
  return `${format(start, 'EEEEEE dd-MM', { locale: nl })} – ${format(friday, 'EEEEEE dd-MM-yyyy', { locale: nl })}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Getal met komma en zonder overbodige nullen: 7.5 → "7,5", 8 → "8". */
export function formatNumberNl(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}
