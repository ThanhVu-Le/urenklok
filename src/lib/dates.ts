import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  parse,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
} from 'date-fns';
import { nl } from 'date-fns/locale';
import type { PeriodKind, Range } from '../types';

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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
