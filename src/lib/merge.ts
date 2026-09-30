/**
 * Samenvoegen van gegevens van twee apparaten (synchroniseren via een bestand).
 * Regels:
 * - Per project/sessie wint de versie met de nieuwste `updatedAt` (bij gelijke stand: lokaal).
 * - Projecten met een andere id maar dezelfde naam worden als hetzelfde project gezien.
 * - Een verwijdering wint van een sessie die daarna niet meer is aangepast.
 * - Evaluaties (per vrijdag): nieuwste `updatedAt` wint (bij gelijke stand: lokaal).
 * - Blijven er meerdere lopende sessies over, dan worden de oudere gestopt op het moment dat de nieuwste begon.
 */
import type { Deletion, Evaluation, Pause, Preferences, Project, Session } from '../types';

export interface SyncData {
  projects: Project[];
  sessions: Session[];
  deletions: Deletion[];
  evaluations: Evaluation[];
  preferences: Preferences | null;
}

export interface MergeStats {
  sessionsAdded: number;
  sessionsUpdated: number;
  sessionsRemoved: number;
  projectsAdded: number;
  projectsUpdated: number;
  runningClosed: number;
  evaluationsAdded: number;
  evaluationsUpdated: number;
  preferencesUpdated: boolean;
}

export interface MergeResult extends SyncData {
  stats: MergeStats;
}

export function mergeData(local: SyncData, incoming: SyncData, now = Date.now()): MergeResult {
  // 1. Projecten koppelen: zelfde id, anders zelfde naam.
  const localById = new Map(local.projects.map((p) => [p.id, p]));
  const localByName = new Map(local.projects.map((p) => [normalizeName(p.name), p]));
  const idMap = new Map<string, string>();
  for (const p of incoming.projects) {
    if (localById.has(p.id)) continue;
    const sameName = localByName.get(normalizeName(p.name));
    if (sameName) idMap.set(p.id, sameName.id);
  }
  const mapId = (id: string) => idMap.get(id) ?? id;

  // 2. Projecten: nieuwste wint.
  const projects = new Map(local.projects.map((p) => [p.id, p]));
  let projectsAdded = 0;
  let projectsUpdated = 0;
  let nextOrder = local.projects.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  for (const raw of incoming.projects) {
    const p = { ...raw, id: mapId(raw.id) };
    const existing = projects.get(p.id);
    if (!existing) {
      projects.set(p.id, { ...p, order: nextOrder++ });
      projectsAdded++;
    } else if (p.updatedAt > existing.updatedAt) {
      projects.set(p.id, p);
      projectsUpdated++;
    }
  }

  // 3. Verwijdermarkeringen samenvoegen.
  const deletions = new Map(local.deletions.map((d) => [d.id, d]));
  for (const d of incoming.deletions) {
    const existing = deletions.get(d.id);
    if (!existing || d.deletedAt > existing.deletedAt) deletions.set(d.id, d);
  }

  // 4. Sessies: nieuwste wint, daarna verwijderingen toepassen.
  const sessions = new Map(local.sessions.map((s) => [s.id, s]));
  for (const raw of incoming.sessions) {
    const s = { ...raw, projectId: mapId(raw.projectId) };
    const existing = sessions.get(s.id);
    if (!existing || s.updatedAt > existing.updatedAt) sessions.set(s.id, s);
  }
  for (const d of deletions.values()) {
    const s = sessions.get(d.id);
    if (!s) continue;
    if (d.deletedAt >= s.updatedAt) sessions.delete(d.id);
    else deletions.delete(d.id); // Na de verwijdering nog aangepast: de aanpassing wint.
  }

  // 5. Hooguit één lopende sessie.
  const running = [...sessions.values()].filter((s) => s.end === null).sort((a, b) => a.start - b.start);
  const newest = running[running.length - 1];
  let runningClosed = 0;
  for (const s of running.slice(0, -1)) {
    const end = Math.max(s.start, newest!.start);
    sessions.set(s.id, { ...s, end, pauses: closePauses(s.pauses, end), updatedAt: now });
    runningClosed++;
  }

  // 6. Wat is er veranderd ten opzichte van lokaal?
  const result = [...sessions.values()];
  const localSessionById = new Map(local.sessions.map((s) => [s.id, s]));
  let sessionsAdded = 0;
  let sessionsUpdated = 0;
  for (const s of result) {
    const before = localSessionById.get(s.id);
    if (!before) sessionsAdded++;
    else if (before !== s) sessionsUpdated++;
  }
  const sessionsRemoved = local.sessions.filter((s) => !sessions.has(s.id)).length;

  // 7. Evaluaties: nieuwste wint.
  const evaluations = new Map(local.evaluations.map((e) => [e.id, e]));
  let evaluationsAdded = 0;
  let evaluationsUpdated = 0;
  for (const e of incoming.evaluations) {
    const existing = evaluations.get(e.id);
    if (!existing) evaluationsAdded++;
    else if (e.updatedAt > existing.updatedAt) evaluationsUpdated++;
    else continue;
    evaluations.set(e.id, e);
  }

  // 8. Voorkeuren: nieuwste wint.
  let preferences = local.preferences;
  let preferencesUpdated = false;
  if (incoming.preferences && (!preferences || incoming.preferences.updatedAt > preferences.updatedAt)) {
    preferences = incoming.preferences;
    preferencesUpdated = true;
  }

  return {
    projects: [...projects.values()],
    sessions: result,
    deletions: [...deletions.values()],
    evaluations: [...evaluations.values()],
    preferences,
    stats: {
      sessionsAdded,
      sessionsUpdated,
      sessionsRemoved,
      projectsAdded,
      projectsUpdated,
      runningClosed,
      evaluationsAdded,
      evaluationsUpdated,
      preferencesUpdated,
    },
  };
}

export function hasChanges(stats: MergeStats): boolean {
  return (
    stats.sessionsAdded + stats.sessionsUpdated + stats.sessionsRemoved + stats.projectsAdded + stats.projectsUpdated > 0 ||
    stats.runningClosed > 0 ||
    stats.evaluationsAdded + stats.evaluationsUpdated > 0 ||
    stats.preferencesUpdated
  );
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function closePauses(pauses: Pause[], end: number): Pause[] {
  return pauses
    .filter((p) => p.start < end)
    .map((p) => (p.end === null || p.end > end ? { ...p, end } : p));
}
