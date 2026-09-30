import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { netMs } from '../lib/time';
import {
  clockIn,
  clockOut,
  deleteSession,
  getPreferences,
  mergeFromBackup,
  previewMerge,
  savePreferences,
  exportAll,
  getActiveSession,
  getSetting,
  replaceAll,
  saveEvaluation,
  SETTING_LAST_PROJECT,
  togglePause,
} from './actions';
import { db, DEFAULT_PROJECTS } from './db';

const MIN = 60_000;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('database', () => {
  it('maakt bij de eerste start de standaardprojecten aan', async () => {
    const projects = await db.projects.orderBy('order').toArray();
    expect(projects.map((p) => p.name)).toEqual(DEFAULT_PROJECTS);
  });

  it('in- en uitklokken met pauze', async () => {
    const [project] = await db.projects.toArray();
    const t0 = new Date(2026, 8, 21, 9, 0).getTime();
    await clockIn(project!.id, t0);
    await togglePause(t0 + 60 * MIN);
    await togglePause(t0 + 90 * MIN);
    await clockOut(t0 + 180 * MIN);

    expect(await getActiveSession()).toBeUndefined();
    const [s] = await db.sessions.toArray();
    expect(s!.end).toBe(t0 + 180 * MIN);
    expect(netMs(s!, 0)).toBe(150 * MIN);
    expect(await getSetting(SETTING_LAST_PROJECT)).toBe(project!.id);
  });

  it('uitklokken tijdens een pauze sluit de pauze af', async () => {
    const [project] = await db.projects.toArray();
    await clockIn(project!.id, 0);
    await togglePause(10 * MIN);
    await clockOut(30 * MIN);
    const [s] = await db.sessions.toArray();
    expect(s!.pauses).toEqual([{ start: 10 * MIN, end: 30 * MIN }]);
    expect(netMs(s!, 0)).toBe(10 * MIN);
  });

  it('uitklokken op een eerder tijdstip kort latere pauzes in', async () => {
    const [project] = await db.projects.toArray();
    await clockIn(project!.id, 0);
    await togglePause(60 * MIN);
    await togglePause(90 * MIN);
    await togglePause(600 * MIN); // pauze die nog loopt
    await clockOut(80 * MIN); // "eigenlijk om 80 min gestopt"
    const [s] = await db.sessions.toArray();
    expect(s!.end).toBe(80 * MIN);
    expect(s!.pauses).toEqual([{ start: 60 * MIN, end: 80 * MIN }]);
    expect(netMs(s!, 0)).toBe(60 * MIN);
  });

  it('dubbel inklokken maakt geen tweede sessie', async () => {
    const [project] = await db.projects.toArray();
    await clockIn(project!.id, 0);
    await clockIn(project!.id, 1000);
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('back-up', () => {
  it('export en import leveren exact dezelfde gegevens op', async () => {
    const [project] = await db.projects.toArray();
    await clockIn(project!.id, 1000);
    await clockOut(5000);
    const backup = await exportAll();
    await db.sessions.clear();
    await db.projects.clear();
    await replaceAll(backup);
    expect(await db.projects.count()).toBe(DEFAULT_PROJECTS.length);
    expect(await db.sessions.toArray()).toEqual(backup.sessions);
  });
});

describe('synchroniseren', () => {
  it('voegt een bestand van een ander apparaat samen, inclusief verwijderingen', async () => {
    const [project] = await db.projects.toArray();
    await clockIn(project!.id, 1000);
    await clockOut(5000);
    const [mine] = await db.sessions.toArray();

    // "Ander apparaat": zelfde standaardprojecten, één eigen sessie, en de sessie van hier verwijderd.
    const other = await exportAll();
    other.sessions = [{ ...mine!, id: 'telefoon-1', start: 10_000, end: 20_000 }];
    other.deletions = [{ id: mine!.id, deletedAt: Date.now() + 1000 }];

    expect(await previewMerge(other)).toMatchObject({ sessionsAdded: 1, sessionsRemoved: 1 });
    await mergeFromBackup(other);
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual(['telefoon-1']);
    expect(await db.projects.count()).toBe(DEFAULT_PROJECTS.length);
  });

  it('verwijderen legt een markering vast', async () => {
    const [project] = await db.projects.toArray();
    const s = await clockIn(project!.id, 0);
    await deleteSession(s.id);
    expect(await db.deletions.get(s.id)).toBeDefined();
  });

  it('voorkeuren opslaan en lezen', async () => {
    expect((await getPreferences()).businessName).toBe('Le Thanh & Co');
    await savePreferences({ weeklyGoalHours: 32 });
    const prefs = await getPreferences();
    expect(prefs.weeklyGoalHours).toBe(32);
    expect(prefs.updatedAt).toBeGreaterThan(0);
  });
});

describe('weekevaluaties', () => {
  const input = {
    goalHours: 32,
    rating: 7,
    wentWell: 'Offerte af',
    wentLess: '',
    lesson: '',
    focus: [' Sporten ', '', 'Boekhouding', 'Lezen', 'Te veel'],
    focusReview: [],
  };

  it('concept opslaan, later afronden en daarna bewerken', async () => {
    const concept = await saveEvaluation('2026-09-25', input, false, 1000);
    expect(concept).toMatchObject({ status: 'concept', createdAt: 1000, completedAt: null });
    expect(concept.focus).toEqual(['Sporten', 'Boekhouding', 'Lezen']);

    const done = await saveEvaluation('2026-09-25', { ...input, rating: 8 }, true, 2000);
    expect(done).toMatchObject({ status: 'afgerond', rating: 8, createdAt: 1000, updatedAt: 2000, completedAt: 2000 });

    // Later nog iets aanpassen: blijft afgerond.
    const edited = await saveEvaluation('2026-09-25', { ...input, lesson: 'Eerder beginnen' }, false, 3000);
    expect(edited).toMatchObject({ status: 'afgerond', completedAt: 2000, updatedAt: 3000, lesson: 'Eerder beginnen' });
    expect(await db.evaluations.count()).toBe(1);
  });

  it('gaan mee in back-up en samenvoegen', async () => {
    await saveEvaluation('2026-09-25', input, true, 1000);
    const backup = await exportAll();
    expect(backup.evaluations).toHaveLength(1);

    await db.evaluations.clear();
    expect(await previewMerge(backup)).toMatchObject({ evaluationsAdded: 1 });
    await mergeFromBackup(backup);
    expect((await db.evaluations.get('2026-09-25'))?.rating).toBe(7);

    await db.evaluations.clear();
    await replaceAll(backup);
    expect(await db.evaluations.toArray()).toEqual(backup.evaluations);
  });
});
