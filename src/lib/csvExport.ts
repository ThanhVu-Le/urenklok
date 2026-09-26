import { db } from '../db/db';
import type { Range, Session } from '../types';
import { sessionsToCsv } from './csv';
import { toDateInput } from './dates';
import { downloadFile } from './download';

/** Sessies waarvan de start in het bereik valt (CSV-regels horen bij hun startdatum). */
export function sessionsStartingIn(range: Range): Promise<Session[]> {
  return db.sessions.where('start').between(range.start, range.end, true, false).toArray();
}

/** Downloadt de CSV voor een bereik en geeft het aantal geëxporteerde sessies terug. */
export async function exportCsv(range: Range): Promise<number> {
  const [sessions, projects] = await Promise.all([sessionsStartingIn(range), db.projects.toArray()]);
  const finished = sessions.filter((s) => s.end !== null);
  if (finished.length === 0) return 0;
  const csv = sessionsToCsv(finished, new Map(projects.map((p) => [p.id, p])));
  const name = `urenklok_${toDateInput(range.start)}_${toDateInput(range.end - 1)}.csv`;
  downloadFile(name, csv, 'text/csv;charset=utf-8');
  return finished.length;
}
