import { describe, expect, it } from 'vitest';
import type { Evaluation, Session } from '../types';
import {
  dayKey,
  defaultEvaluationKey,
  evaluationFriday,
  evaluationKey,
  evaluationPeriodLabel,
  evaluationRange,
  openEvaluation,
  parseEvaluationKey,
  shiftFriday,
} from './dates';
import { totalsInRange } from './time';

// Tests draaien in Europe/Amsterdam (zie vite.config.ts).
const H = 3_600_000;

/** Lokale tijd, bijv. t('2026-09-26 09:00'). */
function t(s: string): number {
  const [date, time = '00:00'] = s.split(' ');
  const [y, mo, d] = date!.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!).getTime();
}

function ev(id: string, status: Evaluation['status']): Pick<Evaluation, 'id' | 'status'> {
  return { id, status };
}

describe('evaluatievrijdag', () => {
  it('op vrijdag is het die vrijdag zelf', () => {
    expect(dayKey(evaluationFriday(t('2026-09-25 00:00')))).toBe('2026-09-25');
    expect(dayKey(evaluationFriday(t('2026-09-25 23:59')))).toBe('2026-09-25');
  });

  it('op zaterdag erna is het nog de vrijdag ervoor', () => {
    expect(dayKey(evaluationFriday(t('2026-09-26 00:00')))).toBe('2026-09-25');
  });

  it('op donderdag is het de vrijdag van vorige week', () => {
    expect(dayKey(evaluationFriday(t('2026-10-01 18:00')))).toBe('2026-09-25');
  });
});

describe('evaluatieperiode', () => {
  it('loopt van zaterdag 00:00 t/m vrijdag 23:59', () => {
    const range = evaluationRange(t('2026-09-25'));
    expect(range).toEqual({ start: t('2026-09-19 00:00'), end: t('2026-09-26 00:00') });
  });

  it('over de jaarwisseling', () => {
    const friday = parseEvaluationKey('2027-01-01')!;
    expect(evaluationRange(friday)).toEqual({ start: t('2026-12-26'), end: t('2027-01-02') });
    expect(evaluationKey(evaluationFriday(t('2027-01-02 10:00')))).toBe('2027-01-01');
    expect(shiftFriday('2027-01-01', -1)).toBe('2026-12-25');
  });

  it('met de overgang naar zomertijd duurt de periode 167 uur', () => {
    const range = evaluationRange(t('2026-04-03'));
    expect(range.start).toBe(t('2026-03-28'));
    expect((range.end - range.start) / H).toBe(167);
  });

  it('met de overgang naar wintertijd duurt de periode 169 uur', () => {
    const range = evaluationRange(t('2026-10-30'));
    expect(range.start).toBe(t('2026-10-24'));
    expect((range.end - range.start) / H).toBe(169);
  });

  it('een sessie over middernacht van vrijdag op zaterdag wordt over twee perioden verdeeld', () => {
    const s: Session = {
      id: 's',
      projectId: 'p',
      start: t('2026-09-25 22:00'),
      end: t('2026-09-26 02:00'),
      pauses: [],
      note: '',
      createdAt: 0,
      updatedAt: 0,
    };
    const thisWeek = totalsInRange([s], evaluationRange(t('2026-09-25')), 0);
    const nextWeek = totalsInRange([s], evaluationRange(t('2026-10-02')), 0);
    expect(thisWeek.total).toBe(2 * H);
    expect(nextWeek.total).toBe(2 * H);
    expect([...nextWeek.perDay.keys()]).toEqual(['2026-09-26']);
  });

  it('label', () => {
    expect(evaluationPeriodLabel(t('2026-09-25'))).toBe('za 19-09 – vr 25-09-2026');
  });
});

describe('evaluatiesleutels', () => {
  it('alleen geldige vrijdagen', () => {
    expect(parseEvaluationKey('2026-09-25')).toBe(t('2026-09-25'));
    expect(parseEvaluationKey('2026-09-26')).toBeNull(); // zaterdag
    expect(parseEvaluationKey('2026-02-30')).toBeNull();
    expect(parseEvaluationKey('onzin')).toBeNull();
  });

  it('vrijdagen verschuiven', () => {
    expect(shiftFriday('2026-09-25', 1)).toBe('2026-10-02');
    expect(shiftFriday('2026-10-30', -1)).toBe('2026-10-23'); // over de wintertijd heen
  });
});

describe('openstaande evaluatie', () => {
  it('op vrijdag: tijd voor de evaluatie', () => {
    expect(openEvaluation(t('2026-09-25 16:00'), [])).toEqual({
      key: '2026-09-25',
      friday: t('2026-09-25'),
      isToday: true,
    });
  });

  it('blijft t/m donderdag erna open', () => {
    expect(openEvaluation(t('2026-10-01 23:59'), [])).toMatchObject({ key: '2026-09-25', isToday: false });
    // Vrijdag erna gaat het over de nieuwe week.
    expect(openEvaluation(t('2026-10-02 08:00'), [])).toMatchObject({ key: '2026-10-02', isToday: true });
  });

  it('een concept telt als open, afgerond niet', () => {
    const now = t('2026-09-28 10:00');
    expect(openEvaluation(now, [ev('2026-09-25', 'concept')])).toMatchObject({ key: '2026-09-25' });
    expect(openEvaluation(now, [ev('2026-09-25', 'afgerond')])).toBeNull();
  });
});

describe('standaard gekozen vrijdag', () => {
  it('op vrijdag altijd vandaag', () => {
    expect(defaultEvaluationKey(t('2026-09-25 09:00'), [ev('2026-09-25', 'afgerond')])).toBe('2026-09-25');
  });

  it('op een andere dag de meest recente vrijdag zonder evaluatie', () => {
    const now = t('2026-09-30 12:00');
    expect(defaultEvaluationKey(now, [])).toBe('2026-09-25');
    expect(defaultEvaluationKey(now, [ev('2026-09-25', 'afgerond')])).toBe('2026-09-18');
    expect(defaultEvaluationKey(now, [ev('2026-09-25', 'afgerond'), ev('2026-09-18', 'concept')])).toBe('2026-09-18');
  });

  it('alles afgerond: de laatste vrijdag', () => {
    const now = t('2026-09-30 12:00');
    const all = Array.from({ length: 8 }, (_, i) => ev(shiftFriday('2026-09-25', -i), 'afgerond'));
    expect(defaultEvaluationKey(now, all)).toBe('2026-09-25');
  });
});
