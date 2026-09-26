/** Alle schrijfacties op de database. Schermen roepen alleen deze functies aan. */
import { createBackup, type Backup } from '../lib/backup';
import { mergeData, type MergeStats, type SyncData } from '../lib/merge';
import { normalizePreferences, PREFERENCES_KEY } from '../lib/preferences';
import type { Pause, Preferences, Project, Session } from '../types';
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

/**
 * Stopt de lopende sessie (en een eventueel lopende pauze). Met een eerder eindtijdstip
 * (vergeten uit te klokken) worden latere pauzes weggelaten of ingekort.
 */
export async function clockOut(end = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession();
    if (!active) return;
    const at = Math.max(end, active.start);
    await db.sessions.update(active.id, {
      end: at,
      pauses: closePauses(active.pauses.filter((p) => p.start < at), at),
      updatedAt: Date.now(),
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

function closePauses(pauses: Pause[], at: number): Pause[] {
  return pauses.map((p) => (p.end === null || p.end > at ? { ...p, end: Math.max(at, p.start) } : p));
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

/** Verwijdert een sessie en onthoudt dat, zodat de verwijdering ook via synchroniseren doorwerkt. */
export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.deletions, async () => {
    await db.sessions.delete(id);
    await db.deletions.put({ id, deletedAt: Date.now() });
  });
}

// ---------- Projecten ----------

export async function addProject(name: string, color?: string): Promise<string> {
  const all = await db.projects.toArray();
  const id = newId();
  const now = Date.now();
  await db.projects.add({
    id,
    name: name.trim(),
    color: color ?? PROJECT_COLORS[all.length % PROJECT_COLORS.length]!,
    archived: false,
    order: all.reduce((max, p) => Math.max(max, p.order), -1) + 1,
    hourlyRate: null,
    weeklyGoalHours: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'color' | 'archived' | 'hourlyRate' | 'weeklyGoalHours'>>,
): Promise<void> {
  const clean = patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch;
  await db.projects.update(id, { ...clean, updatedAt: Date.now() });
}

/** Verplaatst een project één plek omhoog (-1) of omlaag (+1) in de lijst. */
export async function moveProject(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const list = await db.projects.orderBy('order').toArray();
    const index = list.findIndex((p) => p.id === id);
    const other = list[index + direction];
    const current = list[index];
    if (!current || !other) return;
    const now = Date.now();
    await db.projects.update(current.id, { order: other.order, updatedAt: now });
    await db.projects.update(other.id, { order: current.order, updatedAt: now });
  });
}

// ---------- Voorkeuren ----------

export async function getPreferences(): Promise<Preferences> {
  return normalizePreferences((await db.settings.get(PREFERENCES_KEY))?.value);
}

export async function savePreferences(patch: Partial<Omit<Preferences, 'updatedAt'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getPreferences();
    await setSetting(PREFERENCES_KEY, { ...current, ...patch, updatedAt: Date.now() });
  });
}

// ---------- Back-up ----------

export const SETTING_LAST_BACKUP = 'lastBackupAt';

export async function exportAll(): Promise<Backup> {
  return db.transaction('r', db.projects, db.sessions, db.settings, db.deletions, async () =>
    createBackup({
      projects: await db.projects.toArray(),
      sessions: await db.sessions.toArray(),
      settings: await db.settings.toArray(),
      deletions: await db.deletions.toArray(),
    }),
  );
}

/** Vervangt alle gegevens door de inhoud van de back-up (in één transactie: alles of niets). */
export async function replaceAll(backup: Backup): Promise<void> {
  await db.transaction('rw', db.projects, db.sessions, db.settings, db.deletions, async () => {
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.settings.clear(), db.deletions.clear()]);
    await db.projects.bulkAdd(backup.projects);
    await db.sessions.bulkAdd(backup.sessions);
    await db.settings.bulkAdd(backup.settings);
    await db.deletions.bulkAdd(backup.deletions);
  });
}

// ---------- Synchroniseren (samenvoegen) ----------

export const SETTING_LAST_SYNC = 'lastSyncAt';

function syncDataFromBackup(backup: Backup): SyncData {
  const prefs = backup.settings.find((s) => s.key === PREFERENCES_KEY);
  return {
    projects: backup.projects,
    sessions: backup.sessions,
    deletions: backup.deletions,
    preferences: prefs ? normalizePreferences(prefs.value) : null,
  };
}

async function localSyncData(): Promise<SyncData> {
  const prefs = await db.settings.get(PREFERENCES_KEY);
  return {
    projects: await db.projects.toArray(),
    sessions: await db.sessions.toArray(),
    deletions: await db.deletions.toArray(),
    preferences: prefs ? normalizePreferences(prefs.value) : null,
  };
}

/** Wat zou samenvoegen met dit bestand veranderen? Schrijft niets. */
export async function previewMerge(backup: Backup): Promise<MergeStats> {
  return mergeData(await localSyncData(), syncDataFromBackup(backup)).stats;
}

/** Voegt een sync-/back-upbestand samen met de lokale gegevens (alles of niets). */
export async function mergeFromBackup(backup: Backup): Promise<MergeStats> {
  return db.transaction('rw', db.projects, db.sessions, db.settings, db.deletions, async () => {
    const result = mergeData(await localSyncData(), syncDataFromBackup(backup));
    await Promise.all([db.projects.clear(), db.sessions.clear(), db.deletions.clear()]);
    await db.projects.bulkAdd(result.projects);
    await db.sessions.bulkAdd(result.sessions);
    await db.deletions.bulkAdd(result.deletions);
    if (result.preferences) await setSetting(PREFERENCES_KEY, result.preferences);
    await setSetting(SETTING_LAST_SYNC, Date.now());
    return result.stats;
  });
}
