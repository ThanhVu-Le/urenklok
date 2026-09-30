import { describe, expect, it } from 'vitest';
import type { Evaluation, Preferences, Project, Session } from '../types';
import { parseBackup } from './backup';
import { hasChanges, mergeData, type SyncData } from './merge';
import { DEFAULT_PREFERENCES } from './preferences';

function project(id: string, name: string, updatedAt = 0, extra: Partial<Project> = {}): Project {
  return { id, name, color: '#000', archived: false, order: 0, hourlyRate: null, weeklyGoalHours: null, createdAt: 0, updatedAt, ...extra };
}

function session(id: string, projectId: string, start: number, end: number | null, updatedAt = start, note = ''): Session {
  return { id, projectId, start, end, pauses: [], note, createdAt: start, updatedAt };
}

function data(partial: Partial<SyncData>): SyncData {
  return { projects: [], sessions: [], deletions: [], evaluations: [], preferences: null, ...partial };
}

describe('samenvoegen', () => {
  it('voegt sessies van beide apparaten samen', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, 200)] });
    const incoming = data({ projects: [p], sessions: [session('b', 'p', 300, 400)] });
    const result = mergeData(local, incoming);
    expect(result.sessions.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(result.stats.sessionsAdded).toBe(1);
  });

  it('de nieuwste wijziging van een sessie wint', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 500, 'oud')] });
    const incoming = data({ projects: [p], sessions: [session('a', 'p', 100, 250, 600, 'nieuw')] });
    expect(mergeData(local, incoming).sessions[0]!.note).toBe('nieuw');
    expect(mergeData(incoming, local).sessions[0]!.note).toBe('nieuw');
  });

  it('bij gelijke stand blijft de lokale versie', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 500, 'lokaal')] });
    const incoming = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 500, 'ander')] });
    const result = mergeData(local, incoming);
    expect(result.sessions[0]!.note).toBe('lokaal');
    expect(result.stats.sessionsUpdated).toBe(0);
  });

  it('verwijderingen gaan mee', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 200)] });
    const incoming = data({ projects: [p], deletions: [{ id: 'a', deletedAt: 300 }] });
    const result = mergeData(local, incoming);
    expect(result.sessions).toHaveLength(0);
    expect(result.stats.sessionsRemoved).toBe(1);
    expect(result.deletions).toEqual([{ id: 'a', deletedAt: 300 }]);
  });

  it('een verwijderde sessie komt niet terug via het andere apparaat', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], deletions: [{ id: 'a', deletedAt: 300 }] });
    const incoming = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 200)] });
    expect(mergeData(local, incoming).sessions).toHaveLength(0);
  });

  it('een aanpassing na de verwijdering wint van de verwijdering', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], deletions: [{ id: 'a', deletedAt: 300 }] });
    const incoming = data({ projects: [p], sessions: [session('a', 'p', 100, 200, 400)] });
    const result = mergeData(local, incoming);
    expect(result.sessions).toHaveLength(1);
    expect(result.deletions).toHaveLength(0);
  });

  it('koppelt projecten met dezelfde naam maar een andere id', () => {
    const local = data({ projects: [project('L1', 'Administratie')] });
    const incoming = data({
      projects: [project('R1', 'administratie ')],
      sessions: [session('b', 'R1', 100, 200)],
    });
    const result = mergeData(local, incoming);
    expect(result.projects).toHaveLength(1);
    expect(result.sessions[0]!.projectId).toBe('L1');
  });

  it('nieuwe projecten komen achteraan in de volgorde', () => {
    const local = data({ projects: [project('a', 'A', 0, { order: 0 }), project('b', 'B', 0, { order: 1 })] });
    const incoming = data({ projects: [project('c', 'C', 0, { order: 0 })] });
    const result = mergeData(local, incoming);
    expect(result.projects.find((p) => p.id === 'c')!.order).toBe(2);
    expect(result.stats.projectsAdded).toBe(1);
  });

  it('nieuwste projectwijziging (bijv. tarief) wint', () => {
    const local = data({ projects: [project('p', 'A', 10, { hourlyRate: 80 })] });
    const incoming = data({ projects: [project('p', 'A', 20, { hourlyRate: 95 })] });
    expect(mergeData(local, incoming).projects[0]!.hourlyRate).toBe(95);
  });

  it('twee lopende sessies: de oudste wordt gestopt bij de start van de nieuwste', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, null)] });
    const older = { ...session('b', 'p', 50, null), pauses: [{ start: 60, end: null }] };
    const incoming = data({ projects: [p], sessions: [older] });
    const result = mergeData(local, incoming, 999);
    const b = result.sessions.find((s) => s.id === 'b')!;
    expect(b.end).toBe(100);
    expect(b.pauses).toEqual([{ start: 60, end: 100 }]);
    expect(result.sessions.find((s) => s.id === 'a')!.end).toBeNull();
    expect(result.stats.runningClosed).toBe(1);
  });

  it('voorkeuren: nieuwste wint', () => {
    const a: Preferences = { ...DEFAULT_PREFERENCES, weeklyGoalHours: 30, updatedAt: 10 };
    const b: Preferences = { ...DEFAULT_PREFERENCES, weeklyGoalHours: 36, updatedAt: 20 };
    expect(mergeData(data({ preferences: a }), data({ preferences: b })).preferences?.weeklyGoalHours).toBe(36);
    expect(mergeData(data({ preferences: b }), data({ preferences: a })).preferences?.weeklyGoalHours).toBe(36);
  });

  it('evaluaties: nieuwste wint, bij gelijke stand lokaal', () => {
    const ev = (id: string, updatedAt: number, lesson: string): Evaluation => ({
      id,
      status: 'concept',
      goalHours: null,
      rating: null,
      wentWell: '',
      wentLess: '',
      lesson,
      focus: [],
      focusReview: [],
      createdAt: 0,
      updatedAt,
      completedAt: null,
    });
    const local = data({ evaluations: [ev('2026-09-18', 10, 'lokaal'), ev('2026-09-25', 10, 'lokaal')] });
    const incoming = data({ evaluations: [ev('2026-09-18', 20, 'ander'), ev('2026-09-25', 10, 'ander'), ev('2026-10-02', 5, 'ander')] });
    const result = mergeData(local, incoming);
    const lessons = Object.fromEntries(result.evaluations.map((e) => [e.id, e.lesson]));
    expect(lessons).toEqual({ '2026-09-18': 'ander', '2026-09-25': 'lokaal', '2026-10-02': 'ander' });
    expect(result.stats).toMatchObject({ evaluationsAdded: 1, evaluationsUpdated: 1 });
    expect(hasChanges(mergeData(result, incoming).stats)).toBe(false);
  });

  it('samenvoegen is idempotent', () => {
    const p = project('p', 'Algemeen');
    const local = data({ projects: [p], sessions: [session('a', 'p', 100, 200)] });
    const incoming = data({ projects: [p], sessions: [session('b', 'p', 300, 400)] });
    const once = mergeData(local, incoming);
    const twice = mergeData(once, incoming);
    expect(twice.sessions).toHaveLength(2);
    expect(twice.stats.sessionsAdded + twice.stats.sessionsUpdated).toBe(0);
  });
});

describe('oudere back-ups (v1)', () => {
  it('worden aangevuld met tarief, weekdoel en updatedAt', () => {
    const v1 = {
      app: 'urenklok',
      schemaVersion: 1,
      exportedAt: '2026-09-26T10:00:00.000Z',
      projects: [{ id: 'p', name: 'A', color: '#000', archived: false, order: 0, createdAt: 42 }],
      sessions: [],
      settings: [],
    };
    const result = parseBackup(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.projects[0]).toMatchObject({ hourlyRate: null, weeklyGoalHours: null, updatedAt: 42 });
      expect(result.backup.deletions).toEqual([]);
    }
  });
});
