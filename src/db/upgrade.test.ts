import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { Deletion, Project, Session, Setting } from '../types';
import { UrenklokDB } from './db';

const NAME = 'urenklok-upgrade-test';

const projects: Project[] = [
  { id: 'default-1', name: 'Le Thanh & Co – algemeen', color: '#2f6f5e', archived: false, order: 0, hourlyRate: 85, weeklyGoalHours: 20, createdAt: 1, updatedAt: 50 },
  { id: 'default-4', name: 'Administratie', color: '#c2703a', archived: false, order: 1, hourlyRate: null, weeklyGoalHours: null, createdAt: 1, updatedAt: 0 },
  { id: 'eigen', name: 'Oud project', color: '#6b7280', archived: true, order: 2, hourlyRate: null, weeklyGoalHours: null, createdAt: 5, updatedAt: 9 },
];

const sessions: Session[] = [
  { id: 's1', projectId: 'default-1', start: 1000, end: 9000, pauses: [{ start: 3000, end: 4000 }], note: 'Offerte', createdAt: 1000, updatedAt: 9000 },
  { id: 's2', projectId: 'default-4', start: 10_000, end: 20_000, pauses: [], note: '', createdAt: 10_000, updatedAt: 20_000 },
  { id: 's3', projectId: 'eigen', start: 30_000, end: null, pauses: [{ start: 31_000, end: null }], note: 'loopt nog', createdAt: 30_000, updatedAt: 31_000 },
];

const settings: Setting[] = [
  { key: 'lastProjectId', value: 'default-1' },
  { key: 'preferences', value: { weeklyGoalHours: 32, warnAfterHours: 10, vatPercent: 21, businessName: 'Le Thanh & Co', updatedAt: 7 } },
  { key: 'lastBackupAt', value: 123 },
];

const deletions: Deletion[] = [{ id: 'weg', deletedAt: 99 }];

/** Database zoals versie 2 van de app hem aanmaakt (zelfde schema als in db.ts). */
function openV2(): Dexie {
  const v2 = new Dexie(NAME);
  v2.version(1).stores({ projects: 'id, order', sessions: 'id, start, projectId', settings: 'key' });
  v2.version(2).stores({ deletions: 'id' });
  return v2;
}

const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));

describe('database-upgrade naar versie 3 (evaluaties)', () => {
  it('laat projecten, sessies, instellingen en verwijdermarkeringen ongemoeid', async () => {
    await Dexie.delete(NAME);
    const v2 = openV2();
    await v2.open();
    expect(v2.verno).toBe(2);
    await v2.table('projects').bulkAdd(projects);
    await v2.table('sessions').bulkAdd(sessions);
    await v2.table('settings').bulkAdd(settings);
    await v2.table('deletions').bulkAdd(deletions);
    v2.close();

    const db = new UrenklokDB(NAME);
    await db.open();
    expect(db.verno).toBe(3);
    expect(byId(await db.projects.toArray())).toEqual(byId(projects));
    expect(byId(await db.sessions.toArray())).toEqual(byId(sessions));
    expect(await db.settings.orderBy('key').toArray()).toEqual([...settings].sort((a, b) => a.key.localeCompare(b.key)));
    expect(await db.deletions.toArray()).toEqual(deletions);
    expect(await db.evaluations.count()).toBe(0);
    // Indexen werken nog na de upgrade.
    expect((await db.sessions.where('projectId').equals('default-4').toArray()).map((s) => s.id)).toEqual(['s2']);
    db.close();
    await Dexie.delete(NAME);
  });
});
