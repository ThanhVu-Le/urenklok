import type { Project, Session } from '../types';
import { calendarDaysBetween, decimalHours, formatDate, formatDecimalNl, formatTime } from './dates';
import { netMs, pauseMs } from './time';

export const CSV_HEADER = ['Datum', 'Start', 'Eind', 'Pauze (min)', 'Netto uren', 'Project', 'Notitie'];

/**
 * CSV voor Nederlandse Excel: `;` als scheidingsteken, decimale komma, UTF-8 met BOM en CRLF.
 * Eén regel per afgeronde sessie, gesorteerd op starttijd; de datum is de startdatum.
 * Eindigt een sessie op een latere dag, dan krijgt de eindtijd "(+1)".
 */
export function sessionsToCsv(sessions: Session[], projects: Map<string, Project>): string {
  const rows = sessions
    .filter((s) => s.end !== null)
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const end = s.end!;
      const days = calendarDaysBetween(s.start, end);
      return [
        formatDate(s.start),
        formatTime(s.start),
        formatTime(end) + (days > 0 ? ` (+${days})` : ''),
        String(Math.round(pauseMs(s, end) / 60_000)),
        formatDecimalNl(decimalHours(netMs(s, end))),
        projects.get(s.projectId)?.name ?? 'Onbekend project',
        s.note,
      ];
    });
  return '﻿' + [CSV_HEADER, ...rows].map((r) => r.map(csvField).join(';')).join('\r\n') + '\r\n';
}

export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
