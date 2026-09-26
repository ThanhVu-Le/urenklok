import { describe, expect, it } from 'vitest';
import type { Project, Session } from '../types';
import { createBackup, parseBackup } from './backup';
import { csvField, sessionsToCsv } from './csv';

const project: Project = { id: 'p1', name: 'Le Thanh & Co – algemeen', color: '#2f6f5e', archived: false, order: 0, createdAt: 0 };
const projects = new Map([[project.id, project]]);

function at(d: number, h: number, m = 0) {
  return new Date(2026, 8, d, h, m).getTime();
}

const sessions: Session[] = [
  {
    id: 's2',
    projectId: 'p1',
    start: at(22, 22),
    end: at(23, 1, 30),
    pauses: [],
    note: 'Nachtwerk; "spoed"',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 's1',
    projectId: 'p1',
    start: at(21, 9),
    end: at(21, 17),
    pauses: [{ start: at(21, 12), end: at(21, 12, 30) }],
    note: 'Offerte',
    createdAt: 0,
    updatedAt: 0,
  },
  { id: 's3', projectId: 'p1', start: at(24, 9), end: null, pauses: [], note: '', createdAt: 0, updatedAt: 0 },
];

describe('CSV-export', () => {
  const csv = sessionsToCsv(sessions, projects);
  const lines = csv.replace('﻿', '').trimEnd().split('\r\n');

  it('begint met een BOM en de kopregel met ; als scheidingsteken', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Datum;Start;Eind;Pauze (min);Netto uren;Project;Notitie');
  });

  it('schrijft sessies gesorteerd, met decimale komma en dd-mm-jjjj', () => {
    expect(lines[1]).toBe('21-09-2026;09:00;17:00;30;7,50;Le Thanh & Co – algemeen;Offerte');
  });

  it('markeert sessies over middernacht en quote speciale tekens', () => {
    expect(lines[2]).toBe('22-09-2026;22:00;01:30 (+1);0;3,50;Le Thanh & Co – algemeen;"Nachtwerk; ""spoed"""');
  });

  it('laat lopende sessies weg', () => {
    expect(lines).toHaveLength(3);
  });

  it('quote velden met enters', () => {
    expect(csvField('regel 1\nregel 2')).toBe('"regel 1\nregel 2"');
    expect(csvField('gewoon')).toBe('gewoon');
  });
});

describe('JSON-back-up', () => {
  const backup = createBackup({ projects: [project], sessions, settings: [{ key: 'lastProjectId', value: 'p1' }] });

  it('leest een eigen back-up volledig terug', () => {
    const result = parseBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.projects).toEqual([project]);
      expect(result.backup.sessions).toEqual(sessions);
      expect(result.backup.settings).toHaveLength(1);
    }
  });

  it('weigert ongeldige bestanden met een duidelijke melding', () => {
    expect(parseBackup('geen json')).toEqual({ ok: false, error: 'Dit is geen geldig JSON-bestand.' });
    expect(parseBackup('{"app":"iets anders"}')).toMatchObject({ ok: false });
    const broken = { ...backup, sessions: [{ ...sessions[0], projectId: 'onbekend' }] };
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, error: expect.stringMatching(/onbekend project/) });
    const newer = { ...backup, schemaVersion: 99 };
    expect(parseBackup(JSON.stringify(newer))).toMatchObject({ ok: false, error: expect.stringMatching(/nieuwere/) });
  });
});
