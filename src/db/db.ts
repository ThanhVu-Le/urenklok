import Dexie, { type Table } from 'dexie';
import type { Project, Session, Setting } from '../types';

/** Rustig palet dat in licht én donker thema goed leesbaar is. */
export const PROJECT_COLORS = [
  '#2f6f5e', // groen
  '#3b6fb6', // blauw
  '#8a5cc2', // paars
  '#c2703a', // oranje
  '#b8465b', // rood
  '#2e8fa3', // petrol
  '#9a8a2c', // olijf
  '#6b7280', // grijs
];

export const DEFAULT_PROJECTS = [
  'Le Thanh & Co – algemeen',
  'Beleggingsagent-app',
  'Documentenmap-app',
  'Administratie',
  'Studie/bijscholing',
];

export class UrenklokDB extends Dexie {
  projects!: Table<Project, string>;
  sessions!: Table<Session, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'urenklok') {
    super(name);
    this.version(1).stores({
      projects: 'id, order',
      sessions: 'id, start, projectId',
      settings: 'key',
    });
    this.on('populate', (tx) => {
      const now = Date.now();
      tx.table('projects').bulkAdd(
        DEFAULT_PROJECTS.map(
          (name, i): Project => ({
            id: newId(),
            name,
            color: PROJECT_COLORS[i % PROJECT_COLORS.length]!,
            archived: false,
            order: i,
            createdAt: now,
          }),
        ),
      );
    });
  }
}

export const db = new UrenklokDB();

export function newId(): string {
  return crypto.randomUUID();
}
