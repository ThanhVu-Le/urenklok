import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { isLongRunning, weekGoalProgress } from './goals';
import { DEFAULT_PREFERENCES } from './preferences';
import type { PeriodTotals } from './time';

const H = 3_600_000;

function project(id: string, goal: number | null, archived = false): Project {
  return { id, name: id, color: '#000', archived, order: 0, hourlyRate: null, weeklyGoalHours: goal, createdAt: 0, updatedAt: 0 };
}

const totals: PeriodTotals = {
  total: 30 * H,
  perProject: new Map([
    ['a', 20 * H],
    ['b', 10 * H],
  ]),
  perDay: new Map(),
};

describe('weekdoelen', () => {
  it('totaaldoel en projectdoelen', () => {
    const prefs = { ...DEFAULT_PREFERENCES, weeklyGoalHours: 40 };
    const result = weekGoalProgress(totals, prefs, [project('a', 16), project('b', null), project('c', 4)]);
    expect(result.map((g) => [g.project?.id ?? 'totaal', g.ratio, g.remainingMs / H])).toEqual([
      ['totaal', 0.75, 10],
      ['a', 1.25, 0],
      ['c', 0, 4],
    ]);
  });

  it('zonder doelen geen voortgang', () => {
    expect(weekGoalProgress(totals, DEFAULT_PREFERENCES, [project('a', null)])).toEqual([]);
  });

  it('gearchiveerde projecten alleen als er uren zijn', () => {
    const result = weekGoalProgress(totals, DEFAULT_PREFERENCES, [project('b', 8, true), project('x', 8, true)]);
    expect(result.map((g) => g.project?.id)).toEqual(['b']);
  });
});

describe('vergeten uit te klokken', () => {
  it('waarschuwt pas na de ingestelde duur', () => {
    const s = { start: 0, end: null };
    expect(isLongRunning(s, 9 * H, 10)).toBe(false);
    expect(isLongRunning(s, 11 * H, 10)).toBe(true);
    expect(isLongRunning({ start: 0, end: 12 * H }, 20 * H, 10)).toBe(false);
  });
});
