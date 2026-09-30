import { describe, expect, it } from 'vitest';
import type { FocusReview, Project, Session } from '../types';
import { evaluationRange } from './dates';
import {
  compareWithPrevious,
  goalRatio,
  goalReached,
  improvements,
  periodStats,
  previousEvaluation,
  previousPeriods,
  projectShares,
  recurring,
  reviewFor,
  strengths,
  trendHistory,
  trends,
  type EvaluationContext,
  type TrendPeriod,
} from './evaluation';

// Tests draaien in Europe/Amsterdam (zie vite.config.ts).
const MIN = 60_000;
const H = 60 * MIN;

function t(s: string): number {
  const [date, time = '00:00'] = s.split(' ');
  const [y, mo, d] = date!.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!).getTime();
}

let seq = 0;
function session(start: string, end: string | null, projectId = 'p1', note = 'werk'): Session {
  return { id: `s${++seq}`, projectId, start: t(start), end: end ? t(end) : null, pauses: [], note, createdAt: 0, updatedAt: 0 };
}

function project(id: string, name: string, hourlyRate: number | null = null): Project {
  return { id, name, color: '#000', archived: false, order: 0, hourlyRate, weeklyGoalHours: null, createdAt: 0, updatedAt: 0 };
}

// Periode za 19-09-2026 t/m vr 25-09-2026.
const RANGE = evaluationRange(t('2026-09-25'));
const AFTER = t('2026-09-26 12:00');

function context(sessions: Session[], goalHours: number | null, extra: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    stats: periodStats(sessions, RANGE, AFTER, goalHours, 10),
    comparison: null,
    projects: [project('p1', 'Klant', 80), project('adm', 'Administratie')],
    focusReview: [],
    ...extra,
  };
}

const ids = (points: { id: string }[]) => points.map((p) => p.id);

describe('cijfers van de periode', () => {
  it('periode zonder uren', () => {
    const stats = periodStats([], RANGE, AFTER, 40, 10);
    expect(stats).toMatchObject({
      totalMs: 0,
      goalRatio: 0,
      workedDays: 0,
      longestDay: null,
      shortestDay: null,
      sessionCount: 0,
      avgSessionMs: null,
      withoutNote: 0,
      forgottenClockOuts: 0,
    });
    const ctx = context([], 40);
    expect(ids(strengths(ctx))).toEqual([]);
    expect(ids(improvements(ctx))).toEqual(['no-hours', 'goal-missed']);
  });

  it('dagen, sessies, notities en projecten', () => {
    const sessions = [
      session('2026-09-21 09:00', '2026-09-21 17:00', 'p1'),
      session('2026-09-22 09:00', '2026-09-22 11:00', 'adm', ''),
      session('2026-09-22 13:00', '2026-09-22 15:00', 'p1'),
      session('2026-09-18 09:00', '2026-09-18 17:00', 'p1'), // vorige periode
    ];
    const stats = periodStats(sessions, RANGE, AFTER, null, 10);
    expect(stats.totalMs).toBe(12 * H);
    expect(stats.goalRatio).toBeNull();
    expect(stats.workedDays).toBe(2);
    expect(stats.longestDay).toEqual({ day: '2026-09-21', ms: 8 * H });
    expect(stats.shortestDay).toEqual({ day: '2026-09-22', ms: 4 * H });
    expect(stats.sessionCount).toBe(3);
    expect(stats.avgSessionMs).toBe(4 * H);
    expect(stats.withoutNote).toBe(1);
    expect(stats.perProject).toEqual([
      { projectId: 'p1', ms: 10 * H, share: 10 / 12 },
      { projectId: 'adm', ms: 2 * H, share: 2 / 12 },
    ]);
  });

  it('een lopende sessie telt mee tot nu', () => {
    const now = t('2026-09-25 15:30');
    const stats = periodStats([session('2026-09-25 09:00', null)], RANGE, now, null, 10);
    expect(stats.totalMs).toBe(6.5 * H);
    expect(stats.avgSessionMs).toBe(6.5 * H);
  });

  it('vergeten uit te klokken: langer dan de waarschuwingsduur', () => {
    const sessions = [session('2026-09-21 09:00', '2026-09-21 20:30'), session('2026-09-22 09:00', '2026-09-22 17:00')];
    expect(periodStats(sessions, RANGE, AFTER, null, 10).forgottenClockOuts).toBe(1);
    expect(ids(improvements(context(sessions, null)))).toContain('forgotten');
  });
});

describe('weekdoel', () => {
  it('precies gehaald telt als gehaald', () => {
    const sessions = [session('2026-09-21 09:00', '2026-09-21 17:00')];
    const ctx = context(sessions, 8);
    expect(ctx.stats.goalRatio).toBe(1);
    expect(goalReached(8 * H, 8)).toBe(true);
    expect(goalReached(8 * H - 1, 8)).toBe(false);
    expect(goalReached(8 * H, null)).toBeNull();
    expect(goalRatio(6 * H, 8)).toBe(0.75);
    expect(goalRatio(6 * H, null)).toBeNull();
    expect(ids(strengths(ctx))).toContain('goal-reached');
    expect(ids(improvements(ctx))).not.toContain('goal-missed');
    expect(strengths(ctx).find((p) => p.id === 'goal-reached')!.text).toBe('Weekdoel gehaald: 8u 00m van 8 uur (100%).');
  });

  it('niet gehaald', () => {
    const ctx = context([session('2026-09-21 09:00', '2026-09-21 15:00')], 8);
    expect(improvements(ctx).find((p) => p.id === 'goal-missed')!.text).toBe(
      'Weekdoel niet gehaald: 6u 00m van 8 uur (75%), 2u 00m te kort.',
    );
  });

  it('zonder doel geen doelpunten', () => {
    const ctx = context([session('2026-09-21 09:00', '2026-09-21 15:00')], null);
    expect(ids([...strengths(ctx), ...improvements(ctx)]).filter((id) => id.startsWith('goal'))).toEqual([]);
  });
});

describe('vergelijking met voorgaande perioden', () => {
  it('gemiddelde en verschil', () => {
    expect(compareWithPrevious(30 * H, [20 * H, 30 * H, 40 * H, 10 * H])).toEqual({
      periods: 4,
      averageMs: 25 * H,
      diffMs: 5 * H,
      diffRatio: 0.2,
    });
    expect(compareWithPrevious(30 * H, [])).toBeNull();
    expect(compareWithPrevious(30 * H, [0, 0])!.diffRatio).toBeNull();
  });

  it('meer of minder dan gemiddeld', () => {
    const sessions = [session('2026-09-21 09:00', '2026-09-21 17:00')];
    const more = context(sessions, null, { comparison: compareWithPrevious(8 * H, [6 * H]) });
    const less = context(sessions, null, { comparison: compareWithPrevious(8 * H, [10 * H]) });
    const same = context(sessions, null, { comparison: compareWithPrevious(8 * H, [8 * H]) });
    expect(ids(strengths(more))).toContain('above-average');
    expect(ids(improvements(less))).toContain('below-average');
    expect(ids([...strengths(same), ...improvements(same)])).not.toContain('above-average');
    expect(ids([...strengths(same), ...improvements(same)])).not.toContain('below-average');
  });

  it('voorgaande perioden vanaf de eerste sessie', () => {
    const sessions = [session('2026-09-10 09:00', '2026-09-10 12:00'), session('2026-09-16 09:00', '2026-09-16 11:00')];
    expect(previousPeriods(sessions, '2026-09-25', 4, AFTER)).toEqual([
      { key: '2026-09-11', totalMs: 3 * H },
      { key: '2026-09-18', totalMs: 2 * H },
    ]);
    expect(previousPeriods([], '2026-09-25', 4, AFTER)).toEqual([]);
    // Eerdere sessies buiten de geladen selectie: lege perioden tellen dan wel mee.
    expect(previousPeriods(sessions, '2026-09-25', 4, AFTER, t('2026-08-01')).map((p) => p.totalMs)).toEqual([
      0,
      0,
      3 * H,
      2 * H,
    ]);
  });
});

describe('automatische punten', () => {
  it('op vijf dagen gewerkt en overal een notitie', () => {
    const sessions = ['21', '22', '23', '24', '25'].map((d) => session(`2026-09-${d} 09:00`, `2026-09-${d} 16:00`));
    const ctx = context(sessions, null);
    expect(ids(strengths(ctx))).toEqual(['worked-days', 'notes-complete']);
    expect(ids(improvements(ctx))).toEqual([]);
  });

  it('veel Administratie en weinig inkomstenprojecten', () => {
    const sessions = [
      session('2026-09-21 09:00', '2026-09-21 13:00', 'adm'),
      session('2026-09-22 09:00', '2026-09-22 12:00', 'p1'),
      session('2026-09-23 09:00', '2026-09-23 13:00', 'overig'),
    ];
    const ctx = context(sessions, null, {
      projects: [project('p1', 'Klant', 80), project('adm', 'Administratie'), project('overig', 'Studie')],
    });
    expect(projectShares(ctx.stats, ctx.projects)).toEqual({ admin: 4 / 11, income: 3 / 11 });
    expect(ids(improvements(ctx))).toContain('admin-heavy');
  });

  it('zonder uurtarieven geen oordeel over inkomstenprojecten', () => {
    const ctx = context([session('2026-09-21 09:00', '2026-09-21 13:00', 'adm')], null, {
      projects: [project('adm', 'Administratie')],
    });
    expect(projectShares(ctx.stats, ctx.projects)).toBeNull();
    expect(ids(improvements(ctx))).not.toContain('admin-heavy');
  });

  it('veel sessies zonder notitie', () => {
    const sessions = [
      session('2026-09-21 09:00', '2026-09-21 10:00', 'p1', ''),
      session('2026-09-21 11:00', '2026-09-21 12:00', 'p1', '  '),
      session('2026-09-21 13:00', '2026-09-21 14:00'),
    ];
    const ctx = context(sessions, null);
    expect(improvements(ctx).find((p) => p.id === 'notes-missing')!.text).toBe('2 van 3 sessies zonder notitie.');
  });

  it('onregelmatige dagen', () => {
    const irregular = [
      session('2026-09-21 08:00', '2026-09-21 19:00'),
      session('2026-09-22 09:00', '2026-09-22 10:00'),
      session('2026-09-23 09:00', '2026-09-23 10:00'),
    ];
    const regular = ['21', '22', '23'].map((d) => session(`2026-09-${d} 09:00`, `2026-09-${d} 17:00`));
    expect(ids(improvements(context(irregular, null)))).toContain('irregular');
    expect(ids(improvements(context(regular, null)))).not.toContain('irregular');
  });

  it('focuspunten gelukt en niet gelukt', () => {
    const focusReview: FocusReview[] = [
      { text: 'Offerte versturen', result: 'gelukt' },
      { text: 'Boekhouding bijwerken', result: 'niet' },
      { text: 'Sporten', result: 'deels' },
    ];
    const ctx = context([], null, { focusReview });
    expect(strengths(ctx).find((p) => p.id === 'focus-achieved')!.text).toBe(
      '1 van 3 focuspunten gelukt: Offerte versturen.',
    );
    expect(improvements(ctx).find((p) => p.id === 'focus-missed')!.text).toBe(
      '1 van 3 focuspunten niet gelukt: Boekhouding bijwerken.',
    );
  });

  it('geen vorige evaluatie: geen focuspunten', () => {
    const ctx = context([session('2026-09-21 09:00', '2026-09-21 17:00')], null, { focusReview: [] });
    const all = ids([...strengths(ctx), ...improvements(ctx)]);
    expect(all.some((id) => id.startsWith('focus'))).toBe(false);
    expect(reviewFor([], [])).toEqual([]);
  });
});

describe('terugblik op focuspunten', () => {
  it('neemt bestaande oordelen over en laat lege punten weg', () => {
    expect(
      reviewFor(['Offerte versturen', ' ', 'Sporten'], [{ text: 'offerte  versturen', result: 'gelukt' }]),
    ).toEqual([
      { text: 'Offerte versturen', result: 'gelukt' },
      { text: 'Sporten', result: null },
    ]);
  });
});

describe('trends', () => {
  function period(i: number, hours: number, extra: Partial<TrendPeriod> = {}): TrendPeriod {
    return { key: `k${i}`, totalMs: hours * H, goalHours: 30, rating: null, focus: [], ...extra };
  }

  it('te weinig perioden voor een urentrend', () => {
    const result = trends([period(1, 20), period(2, 30)]);
    expect(result.hours).toBeNull();
    expect(ids(result.points)).toContain('too-few');
  });

  it('stijgend, dalend en stabiel', () => {
    expect(trends([20, 20, 20, 20, 30, 30, 30, 30].map((h, i) => period(i, h))).hours).toMatchObject({
      direction: 'stijgend',
      span: 4,
    });
    expect(trends([30, 30, 20, 20].map((h, i) => period(i, h))).hours).toMatchObject({ direction: 'dalend', span: 2 });
    expect(trends([30, 31, 30, 29].map((h, i) => period(i, h))).hours!.direction).toBe('stabiel');
  });

  it('doel gehaald, gemiddeld cijfer en maximaal 12 perioden', () => {
    const history = Array.from({ length: 14 }, (_, i) =>
      period(i, i % 2 === 0 ? 30 : 25, { rating: i < 2 ? 1 : 7 }),
    );
    const result = trends(history);
    expect(result.periods).toBe(12);
    expect(result.goal).toEqual({ reached: 6, counted: 12 });
    expect(result.rating).toEqual({ average: 7, count: 12 });
    expect(result.points.find((p) => p.id === 'goal-trend')!.text).toBe('Weekdoel 6 van de laatste 12 weken gehaald.');
    expect(result.points.find((p) => p.id === 'rating-trend')!.text).toBe('Gemiddeld cijfer 7 over 12 evaluaties.');
  });

  it('zonder doel en cijfers geen doel- en cijferpunten', () => {
    const result = trends([period(1, 20, { goalHours: null }), period(2, 20, { goalHours: null })]);
    expect(result.goal).toBeNull();
    expect(result.rating).toBeNull();
  });

  it('terugkerende focuspunten', () => {
    expect(
      recurring([['Offerte versturen', 'Sporten'], ['offerte versturen'], ['Sporten', 'sporten'], ['Offerte versturen ']]),
    ).toEqual([
      { text: 'Offerte versturen', count: 3 },
      { text: 'Sporten', count: 2 },
    ]);
    const result = trends([period(1, 20, { focus: ['Lezen'] }), period(2, 20, { focus: ['lezen'] })]);
    expect(result.recurringFocus).toEqual([{ text: 'lezen', count: 2 }]);
    expect(ids(result.points)).toContain('focus-lezen');
  });
});

describe('trendhistorie en vorige evaluatie', () => {
  const evaluations = [
    { id: '2026-09-11', rating: 6, focus: ['Lezen'], goalHours: 30 },
    { id: '2026-09-18', rating: null, focus: [], goalHours: null },
  ];

  it('combineert perioden met evaluaties; zonder evaluatie het huidige doel', () => {
    const history = trendHistory(
      [
        { key: '2026-09-04', totalMs: 20 * H },
        { key: '2026-09-11', totalMs: 25 * H },
        { key: '2026-09-18', totalMs: 30 * H },
      ],
      { key: '2026-09-25', totalMs: 32 * H, goalHours: 32, rating: 8, focus: ['Lezen'] },
      evaluations,
      32,
    );
    expect(history).toEqual([
      { key: '2026-09-04', totalMs: 20 * H, goalHours: 32, rating: null, focus: [] },
      { key: '2026-09-11', totalMs: 25 * H, goalHours: 30, rating: 6, focus: ['Lezen'] },
      { key: '2026-09-18', totalMs: 30 * H, goalHours: null, rating: null, focus: [] },
      { key: '2026-09-25', totalMs: 32 * H, goalHours: 32, rating: 8, focus: ['Lezen'] },
    ]);
    expect(trends(history).goal).toEqual({ reached: 1, counted: 3 });
  });

  it('vorige evaluatie', () => {
    expect(previousEvaluation(evaluations, '2026-09-25')?.id).toBe('2026-09-18');
    expect(previousEvaluation(evaluations, '2026-09-18')?.id).toBe('2026-09-11');
    expect(previousEvaluation(evaluations, '2026-09-11')).toBeUndefined();
  });
});
