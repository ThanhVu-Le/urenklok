import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { SETTING_LAST_PROJECT } from '../db/actions';
import type { Project, Range, Session } from '../types';

const MAX_SESSION_MS = 8 * 24 * 60 * 60_000;

/** Alle projecten op volgorde (ook gearchiveerde). `undefined` tijdens laden. */
export function useProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.orderBy('order').toArray());
}

/** De lopende sessie; `null` als er geen is, `undefined` tijdens laden. */
export function useActiveSession(): Session | null | undefined {
  return useLiveQuery(async () => (await db.sessions.filter((s) => s.end === null).first()) ?? null);
}

/** Sessies die (deels) in het bereik vallen, oplopend op starttijd. */
export function useSessionsInRange(range: Range): Session[] | undefined {
  return useLiveQuery(async () => {
    const list = await db.sessions
      .where('start')
      .between(range.start - MAX_SESSION_MS, range.end, true, false)
      .toArray();
    return list.filter((s) => s.end === null || s.end > range.start);
  }, [range.start, range.end]);
}

export function useLastProjectId(): string | undefined | null {
  return useLiveQuery(async () => ((await db.settings.get(SETTING_LAST_PROJECT))?.value as string) ?? null);
}

export function projectMap(projects: Project[] | undefined): Map<string, Project> {
  return new Map((projects ?? []).map((p) => [p.id, p]));
}
