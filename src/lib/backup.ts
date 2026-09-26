import type { Project, Session, Setting } from '../types';

export const BACKUP_APP = 'urenklok';
export const BACKUP_SCHEMA_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  sessions: Session[];
  settings: Setting[];
}

export function createBackup(data: { projects: Project[]; sessions: Session[]; settings: Setting[] }, now = new Date()): Backup {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    ...data,
  };
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/** Leest en controleert een back-upbestand. Geeft een Nederlandse foutmelding bij ongeldige inhoud. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Dit is geen geldig JSON-bestand.');
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) return fail('Dit is geen Urenklok-back-up.');
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return fail('Deze back-up komt uit een nieuwere versie van Urenklok.');
  }
  if (!Array.isArray(raw.projects) || !Array.isArray(raw.sessions)) return fail('De back-up mist projecten of sessies.');

  const projects: Project[] = [];
  for (const [i, p] of raw.projects.entries()) {
    if (!isProject(p)) return fail(`Project ${i + 1} in de back-up is ongeldig.`);
    projects.push(p);
  }
  const projectIds = new Set(projects.map((p) => p.id));
  if (projectIds.size !== projects.length) return fail('De back-up bevat dubbele projecten.');

  const sessions: Session[] = [];
  for (const [i, s] of raw.sessions.entries()) {
    if (!isSession(s)) return fail(`Sessie ${i + 1} in de back-up is ongeldig.`);
    if (!projectIds.has(s.projectId)) return fail(`Sessie ${i + 1} verwijst naar een onbekend project.`);
    sessions.push(s);
  }
  if (new Set(sessions.map((s) => s.id)).size !== sessions.length) return fail('De back-up bevat dubbele sessies.');
  if (sessions.filter((s) => s.end === null).length > 1) return fail('De back-up bevat meer dan één lopende sessie.');

  const settings: Setting[] = Array.isArray(raw.settings)
    ? raw.settings.filter((s): s is Setting => isObject(s) && typeof s.key === 'string')
    : [];

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      schemaVersion: raw.schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      projects,
      sessions,
      settings,
    },
  };
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isProject(v: unknown): v is Project {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.color === 'string' &&
    typeof v.archived === 'boolean' &&
    typeof v.order === 'number' &&
    isTime(v.createdAt)
  );
}

function isSession(v: unknown): v is Session {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || typeof v.projectId !== 'string' || typeof v.note !== 'string') return false;
  if (!isTime(v.start) || !(v.end === null || isTime(v.end))) return false;
  if (v.end !== null && (v.end as number) < v.start) return false;
  if (!isTime(v.createdAt) || !isTime(v.updatedAt)) return false;
  return (
    Array.isArray(v.pauses) &&
    v.pauses.every((p) => isObject(p) && isTime(p.start) && (p.end === null || isTime(p.end)))
  );
}
