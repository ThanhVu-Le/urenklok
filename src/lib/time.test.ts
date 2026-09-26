import { describe, expect, it } from 'vitest';
import type { Pause, Session } from '../types';
import { dayKey, decimalHours, isoWeek, periodRange } from './dates';
import {
  centeredPause,
  findOverlap,
  isPaused,
  netMs,
  pauseMs,
  sessionsInRange,
  splitByDay,
  totalsInRange,
  validateSession,
  workIntervals,
} from './time';

// Tests draaien in Europe/Amsterdam (zie vite.config.ts).
const MIN = 60_000;
const H = 60 * MIN;

/** Lokale tijd, bijv. t('2026-09-26 09:00'). */
function t(s: string): number {
  const [date, time = '00:00'] = s.split(' ');
  const [y, mo, d] = date!.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!).getTime();
}

let seq = 0;
function session(start: string, end: string | null, pauses: [string, string | null][] = [], projectId = 'p1'): Session {
  return {
    id: `s${++seq}`,
    projectId,
    start: t(start),
    end: end === null ? null : t(end),
    pauses: pauses.map(([ps, pe]): Pause => ({ start: t(ps), end: pe === null ? null : t(pe) })),
    note: '',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('netto tijd en pauzes', () => {
  it('zonder pauze is netto gelijk aan bruto', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 17:00');
    expect(netMs(s, 0)).toBe(8 * H);
  });

  it('trekt één pauze af', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 17:00', [['2026-09-21 12:00', '2026-09-21 12:30']]);
    expect(netMs(s, 0)).toBe(7.5 * H);
    expect(pauseMs(s, 0)).toBe(30 * MIN);
  });

  it('trekt meerdere pauzes af', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 17:00', [
      ['2026-09-21 10:30', '2026-09-21 10:45'],
      ['2026-09-21 12:00', '2026-09-21 12:45'],
    ]);
    expect(netMs(s, 0)).toBe(7 * H);
    expect(workIntervals(s, 0)).toHaveLength(3);
  });

  it('telt overlappende pauzes maar één keer', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 17:00', [
      ['2026-09-21 12:00', '2026-09-21 13:00'],
      ['2026-09-21 12:30', '2026-09-21 13:30'],
    ]);
    expect(pauseMs(s, 0)).toBe(1.5 * H);
    expect(netMs(s, 0)).toBe(6.5 * H);
  });

  it('kapt pauzes buiten de sessie af', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 10:00', [['2026-09-21 08:00', '2026-09-21 09:15']]);
    expect(netMs(s, 0)).toBe(45 * MIN);
  });

  it('wordt nooit negatief', () => {
    const s = session('2026-09-21 09:00', '2026-09-21 10:00', [['2026-09-21 08:00', '2026-09-21 11:00']]);
    expect(netMs(s, 0)).toBe(0);
  });

  it('rekent een lopende sessie tot nu', () => {
    const s = session('2026-09-21 09:00', null);
    expect(netMs(s, t('2026-09-21 11:15'))).toBe(2.25 * H);
  });

  it('telt een lopende pauze niet mee: de timer staat stil', () => {
    const s = session('2026-09-21 09:00', null, [['2026-09-21 10:00', null]]);
    expect(isPaused(s)).toBe(true);
    expect(netMs(s, t('2026-09-21 10:30'))).toBe(1 * H);
    expect(netMs(s, t('2026-09-21 11:45'))).toBe(1 * H);
  });

  it('blijft kloppen na lange onderbreking (app dicht, laptop in slaap)', () => {
    // Timer is alleen afgeleid van opgeslagen tijdstempels.
    const s = session('2026-09-21 09:00', null);
    expect(netMs(s, t('2026-09-21 21:00'))).toBe(12 * H);
  });
});

describe('sessies over middernacht', () => {
  it('verdeelt de tijd over beide dagen', () => {
    const s = session('2026-09-21 22:00', '2026-09-22 02:00');
    const days = splitByDay(s, 0);
    expect(days.get('2026-09-21')).toBe(2 * H);
    expect(days.get('2026-09-22')).toBe(2 * H);
    expect(netMs(s, 0)).toBe(4 * H);
  });

  it('trekt een pauze over middernacht van beide dagen af', () => {
    const s = session('2026-09-21 22:00', '2026-09-22 02:00', [['2026-09-21 23:30', '2026-09-22 00:30']]);
    const days = splitByDay(s, 0);
    expect(days.get('2026-09-21')).toBe(1.5 * H);
    expect(days.get('2026-09-22')).toBe(1.5 * H);
  });

  it('verdeelt een lopende sessie over middernacht', () => {
    const s = session('2026-09-21 23:00', null);
    const days = splitByDay(s, t('2026-09-22 01:30'));
    expect(days.get('2026-09-21')).toBe(1 * H);
    expect(days.get('2026-09-22')).toBe(1.5 * H);
  });

  it('kan meer dan twee dagen beslaan', () => {
    const s = session('2026-09-21 20:00', '2026-09-23 04:00');
    const days = splitByDay(s, 0);
    expect([...days.values()]).toEqual([4 * H, 24 * H, 4 * H]);
  });

  it('dagtotaal telt alleen het deel binnen die dag', () => {
    const s = session('2026-09-21 22:00', '2026-09-22 02:00');
    const day2 = totalsInRange([s], periodRange('day', t('2026-09-22 12:00')), 0);
    expect(day2.total).toBe(2 * H);
  });
});

describe('zomer- en wintertijd', () => {
  it('nacht van de wintertijd (25 oktober 2026) duurt een uur langer', () => {
    const s = session('2026-10-25 00:00', '2026-10-25 06:00');
    expect(netMs(s, 0)).toBe(7 * H);
    expect(splitByDay(s, 0).get('2026-10-25')).toBe(7 * H);
  });

  it('nacht van de zomertijd (29 maart 2026) duurt een uur korter', () => {
    const s = session('2026-03-28 23:00', '2026-03-29 04:00');
    const days = splitByDay(s, 0);
    expect(days.get('2026-03-28')).toBe(1 * H);
    expect(days.get('2026-03-29')).toBe(3 * H);
  });

  it('dag- en weekgrenzen blijven op lokale middernacht', () => {
    const range = periodRange('day', t('2026-10-25 12:00'));
    expect(range.end - range.start).toBe(25 * H);
  });
});

describe('ISO-weken', () => {
  it('week begint op maandag', () => {
    const range = periodRange('week', t('2026-09-26 12:00')); // zaterdag
    expect(dayKey(range.start)).toBe('2026-09-21');
    expect(dayKey(range.end)).toBe('2026-09-28');
    expect(isoWeek(t('2026-09-26 12:00'))).toEqual({ week: 39, year: 2026 });
  });

  it('zondag hoort bij de week ervoor', () => {
    expect(isoWeek(t('2026-09-27 12:00')).week).toBe(39);
    expect(isoWeek(t('2026-09-28 00:00')).week).toBe(40);
  });

  it('jaarwisseling: 2026 heeft 53 weken', () => {
    expect(isoWeek(t('2026-12-31 12:00'))).toEqual({ week: 53, year: 2026 });
    expect(isoWeek(t('2027-01-01 12:00'))).toEqual({ week: 53, year: 2026 });
    expect(isoWeek(t('2027-01-04 12:00'))).toEqual({ week: 1, year: 2027 });
  });

  it('30 december 2024 valt in week 1 van 2025', () => {
    expect(isoWeek(t('2024-12-30 12:00'))).toEqual({ week: 1, year: 2025 });
  });
});

describe('week- en maandtotalen', () => {
  const sessions = [
    session('2026-09-21 09:00', '2026-09-21 17:00', [['2026-09-21 12:00', '2026-09-21 12:30']], 'a'), // 7,5
    session('2026-09-22 09:00', '2026-09-22 12:00', [], 'b'), // 3
    session('2026-09-27 22:00', '2026-09-28 02:00', [], 'a'), // zo→ma: 2 in wk 39, 2 in wk 40
    session('2026-09-30 20:00', '2026-10-01 01:00', [], 'b'), // 4 in sept, 1 in okt
    session('2026-09-14 09:00', '2026-09-14 10:00', [], 'a'), // week 38
  ];

  it('weektotaal per project, met sessie over de weekgrens gesplitst', () => {
    const totals = totalsInRange(sessions, periodRange('week', t('2026-09-23 12:00')), 0);
    expect(totals.total).toBe(12.5 * H);
    expect(totals.perProject.get('a')).toBe(9.5 * H);
    expect(totals.perProject.get('b')).toBe(3 * H);
    expect(totals.perDay.get('2026-09-27')?.get('a')).toBe(2 * H);
    expect(totals.perDay.has('2026-09-28')).toBe(false);
  });

  it('volgende week krijgt het deel na middernacht', () => {
    const totals = totalsInRange(sessions, periodRange('week', t('2026-09-29 12:00')), 0);
    expect(totals.perDay.get('2026-09-28')?.get('a')).toBe(2 * H);
    expect(totals.perProject.get('b')).toBe(5 * H);
  });

  it('maandtotaal, met sessie over de maandgrens gesplitst', () => {
    const sept = totalsInRange(sessions, periodRange('month', t('2026-09-10 12:00')), 0);
    expect(sept.total).toBe((7.5 + 3 + 4 + 4 + 1) * H);
    expect(sept.perProject.get('b')).toBe(7 * H);
    const okt = totalsInRange(sessions, periodRange('month', t('2026-10-10 12:00')), 0);
    expect(okt.total).toBe(1 * H);
  });

  it('sessionsInRange vindt ook sessies die deels in het bereik vallen', () => {
    const okt = sessionsInRange(sessions, periodRange('month', t('2026-10-10 12:00')), 0);
    expect(okt).toHaveLength(1);
  });

  it('decimale uren worden op 2 decimalen afgerond', () => {
    expect(decimalHours(7.5 * H)).toBe(7.5);
    expect(decimalHours(20 * MIN)).toBe(0.33);
    expect(decimalHours(50 * MIN)).toBe(0.83);
  });
});

describe('handmatige sessies', () => {
  it('centeredPause plaatst de pauze midden in de sessie', () => {
    const [p] = centeredPause(t('2026-09-21 09:00'), t('2026-09-21 17:00'), 60 * MIN);
    expect(p).toEqual({ start: t('2026-09-21 12:30'), end: t('2026-09-21 13:30') });
  });

  it('centeredPause zonder pauze geeft geen intervallen', () => {
    expect(centeredPause(0, H, 0)).toEqual([]);
  });

  it('validateSession', () => {
    expect(validateSession(t('2026-09-21 09:00'), t('2026-09-21 17:00'), 30 * MIN)).toBeNull();
    expect(validateSession(t('2026-09-21 17:00'), t('2026-09-21 09:00'), 0)).toMatch(/eindtijd/);
    expect(validateSession(t('2026-09-21 09:00'), t('2026-09-21 10:00'), H)).toMatch(/pauze/);
    expect(validateSession(NaN, 0, 0)).toMatch(/geldige/);
  });

  it('findOverlap signaleert overlap met een andere sessie', () => {
    const a = session('2026-09-21 09:00', '2026-09-21 12:00');
    expect(findOverlap([a], { start: t('2026-09-21 11:00'), end: t('2026-09-21 13:00') }, 0)).toBe(a);
    expect(findOverlap([a], { start: t('2026-09-21 12:00'), end: t('2026-09-21 13:00') }, 0)).toBeUndefined();
    expect(findOverlap([a], { id: a.id, start: a.start, end: a.end! }, 0)).toBeUndefined();
  });
});
