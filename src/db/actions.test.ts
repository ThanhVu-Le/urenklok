import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { netMs } from '../lib/time';
import {
  clockIn,
  clockOut,
  exportAll,
  getActiveSession,
  getSetting,
  replaceAll,
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
