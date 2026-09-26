/** Alle schrijfacties op de database. Schermen roepen alleen deze functies aan. */
import { createBackup, type Backup } from '../lib/backup';
import type { Pause, Project, Session } from '../types';
import { db, newId, PROJECT_COLORS } from './db';

export const SETTING_LAST_PROJECT = 'lastProjectId';

export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.filter((s) => s.end === null).first();
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------- Klokken ----------

/** Start een sessie. Doet niets als er al een sessie loopt. */
export async function clockIn(projectId: string, now = Date.now()): Promise<Session> {
  return db.transaction('rw', db.sessions, db.settings, async () => {
    const active = await getActiveSession();
    if (active) return active;
    const session: Session = {
      id: newId(),
      projectId,
      start: now,
      end: null,
      pauses: [],
      note: '',
      createdAt: now,
      updatedAt: now,
    };
    await db.sessions.add(session);
    await setSetting(SETTING_LAST_PROJECT, projectId);
    return session;
  });
}

/** Stopt de lopende sessie (en een eventueel lopende pauze). */
export async function clockOut(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession();
    if (!active) return;
    await db.sessions.update(active.id, {
      end: Math.max(now, active.start),
      pauses: closePauses(active.pauses, now),
      updatedAt: now,
    });
  });
}

/** Pauzeert of hervat de lopende sessie. */
export async function togglePause(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession();
    if (!active) return;
    const running = active.pauses.some((p) => p.end === null);
    const pauses: Pause[] = running
      ? closePauses(active.pauses, now)
      : [...active.pauses, { start: now, end: null }];
    await db.sessions.update(active.id, { pauses, updatedAt: now });
  });
}

function closePauses(pauses: Pause[], now: number): Pause[] {
  return pauses.map((p) => (p.end === null ? { ...p, end: Math.max(now, p.start) } : p));
}

// ---------- Sessies ----------

export async function updateSession(
  id: string,
  patch: Partial<Pick<Session, 'projectId' | 'start' | 'end' | 'pauses' | 'note'>>,
): Promise<void> {
  await db.sessions.update(id, { ...patch, updatedAt: Date.now() });
  if (patch.projectId) {
    const s = await db.sessions.get(id);
    if (s?.end === null) await setSetting(SETTING_LAST_PROJECT, patch.projectId);
  }
}

export async function addSession(
  input: Pick<Session, 'projectId' | 'start' | 'end' | 'pauses' | 'note'>,
): Promise<string> {
  const now = Date.now();
  const id = newId();
  await db.sessions.add({ ...input, id, createdAt: now, updatedAt: now });
  return id;
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

// ---------- Projecten ----------

export async function addProject(name: string, color?: string): Promise<string> {
  const all = await db.projects.toArray();
  const id = newId();
  await db.projects.add({
    id,
    name: name.trim(),
    color: color ?? PROJECT_COLORS[all.length % PROJECT_COLORS.length]!,
    archived: false,
    order: all.reduce((max, p) => Math.max(max, p.order), -1) + 1,
    createdAt: Date.now(),
  });
  return id;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'color' | 'archived'>>,
): Promise<void> {
  await db.projects.update(id, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
}

/** Verplaatst een project één plek omhoog (-1) of omlaag (+1) in de lijst. */
export async function moveProject(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const list = await db.projects.orderBy('order').toArray();
    const index = list.findIndex((p) => p.id === id);
    const other = list[index + direction];
    const current = list[index];
    if (!current || !other) return;
    await db.projects.update(current.id, { order: other.order });
    await db.projects.update(other.id, { order: current.order });
  });
}

// ---------- Back-up ----------

export const SETTING_LAST_BACKUP = 'lastBackupAt';

export async function exportAll(): Promise<Backup> {
  return db.transaction('r', db.projects, db.sessions, db.settings, async () =>
    createBackup({
      projects: await db.projects.toArray(),
      sessions: await db.sessions.toArray(),
      settings: await db.settings.toArray(),
    }),
  );
}

/** Vervangt alle gegevens door de inhoud van de back-up (in één transactie: alles of niets). */
export async function replaceAll(backup: Backup): Promise<void> {
  await db.transaction('rw', db.projects, db.sessions, db.settings, async () => {
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.settings.clear()]);
    await db.projects.bulkAdd(backup.projects);
    await db.sessions.bulkAdd(backup.sessions);
    await db.settings.bulkAdd(backup.settings);
  });
}
