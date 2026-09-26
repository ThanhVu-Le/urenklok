import { describe, expect, it } from 'vitest';
import type { Project, Session } from '../types';
import { amountFor, buildInvoice, formatEuro } from './invoice';

const H = 3_600_000;
const MIN = 60_000;

function project(id: string, rate: number | null, order = 0): Project {
  return { id, name: id.toUpperCase(), color: '#000', archived: false, order, hourlyRate: rate, weeklyGoalHours: null, createdAt: 0, updatedAt: 0 };
}

function session(id: string, projectId: string, start: number, durationMs: number, note = '', pauseMs = 0): Session {
  return {
    id,
    projectId,
    start,
    end: start + durationMs,
    pauses: pauseMs ? [{ start: start + 60 * MIN, end: start + 60 * MIN + pauseMs }] : [],
    note,
    createdAt: 0,
    updatedAt: 0,
  };
}

const projects = new Map([
  ['a', project('a', 85, 0)],
  ['b', project('b', null, 1)],
]);
const day = new Date(2026, 8, 21, 9).getTime();

describe('bedragen', () => {
  it('uren × tarief, over afgeronde decimale uren', () => {
    expect(amountFor(7.5 * H, 85)).toBe(637.5);
    expect(amountFor(20 * MIN, 90)).toBe(29.7); // 0,33 u × 90
    expect(amountFor(H, null)).toBe(0);
  });

  it('formatEuro gebruikt Nederlandse notatie', () => {
    expect(formatEuro(1234.5).replace(/\s/g, ' ')).toBe('€ 1.234,50');
  });
});

describe('factuur', () => {
  const sessions = [
    session('s1', 'a', day, 8 * H, 'Offerte', 30 * MIN), // 7,5 u
    session('s2', 'a', day + 24 * H, 2 * H),
    session('s3', 'b', day + 48 * H, H, 'Studie'),
    { ...session('s4', 'a', day + 72 * H, H), end: null }, // loopt nog: telt niet mee
  ];

  it('per sessie, met notitie in de omschrijving', () => {
    const inv = buildInvoice(sessions, projects, { groupByProject: false, vatPercent: 21 });
    expect(inv.lines).toHaveLength(3);
    expect(inv.lines[0]).toMatchObject({ description: 'A – Offerte', hours: 7.5, rate: 85, amount: 637.5 });
    expect(inv.hours).toBe(10.5);
    expect(inv.subtotal).toBe(807.5);
    expect(inv.vat).toBe(169.58);
    expect(inv.total).toBe(977.08);
  });

  it('samengevat per project', () => {
    const inv = buildInvoice(sessions, projects, { groupByProject: true, vatPercent: 0 });
    expect(inv.lines.map((l) => [l.description, l.hours, l.amount])).toEqual([
      ['A', 9.5, 807.5],
      ['B', 1, 0],
    ]);
    expect(inv.vat).toBe(0);
    expect(inv.total).toBe(807.5);
  });

  it('meldt projecten zonder tarief', () => {
    const inv = buildInvoice(sessions, projects, { groupByProject: false, vatPercent: 21 });
    expect(inv.missingRate.map((p) => p.id)).toEqual(['b']);
  });
});
