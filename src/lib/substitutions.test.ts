import type { Substitution, TimetableSummary } from '@/api/types';
import {
  groupState,
  isLost,
  isoWeekdayOf,
  schoolDatesBetween,
  stepText,
  versionIdAt,
} from './substitutions';

describe('schoolDatesBetween', () => {
  it('пропускає вихідні; субота — лише якщо навчальна', () => {
    // пт 13.11 – пн 16.11
    expect(schoolDatesBetween('2026-11-13', '2026-11-16')).toEqual(['2026-11-13', '2026-11-16']);
    expect(schoolDatesBetween('2026-11-13', '2026-11-16', true)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-16',
    ]);
  });

  it('пропускає канікули й обрізає довгий період', () => {
    const holidays = { holiday_from: '2026-11-17', holiday_to: '2026-11-18' };
    expect(schoolDatesBetween('2026-11-16', '2026-11-19', false, holidays)).toEqual([
      '2026-11-16',
      '2026-11-19',
    ]);
    expect(schoolDatesBetween('2026-11-16', '2027-02-01', false, null, 31)).toHaveLength(31);
    expect(schoolDatesBetween('2026-11-19', '2026-11-16')).toEqual([]);
  });

  it('isoWeekdayOf: пн = 1, нд = 7', () => {
    expect(isoWeekdayOf('2026-11-16')).toBe(1);
    expect(isoWeekdayOf('2026-11-15')).toBe(7);
  });
});

const v = (
  id: string,
  effective_from: string | null,
  state: TimetableSummary['state'] = 'published',
) => ({ timetable_id: id, state, effective_from }) as TimetableSummary;
const versions = [v('old', '2026-09-01'), v('next', '2026-11-23'), v('draft', null, 'validated')];

describe('versionIdAt', () => {
  it('остання опублікована з effective_from ≤ дата', () => {
    expect(versionIdAt('2026-11-20', versions, undefined)).toEqual({ id: 'old', alert: false });
    expect(versionIdAt('2026-11-23', versions, undefined)).toEqual({ id: 'next', alert: false });
    expect(versionIdAt('2026-08-31', versions, undefined)).toBeNull();
  });

  it('під час активації тривог — шаблон тривог (дата повернення вже не входить)', () => {
    const alertPlan = {
      timetable_id: 'alert',
      activations: [{ activation_id: 'a', from: '2026-11-18', to: '2026-11-20' }],
    };
    expect(versionIdAt('2026-11-18', versions, alertPlan)).toEqual({ id: 'alert', alert: true });
    expect(versionIdAt('2026-11-20', versions, alertPlan)).toEqual({ id: 'old', alert: false });
  });
});

describe('isLost', () => {
  const row = (state: Substitution['state'], date: string, timetable_id = 'old') => ({
    state,
    date,
    timetable_id,
  });
  it('погоджена заміна втрачає силу, коли на дату діє інша версія', () => {
    expect(isLost(row('approved', '2026-11-20'), versions, undefined)).toBe(false);
    expect(isLost(row('approved', '2026-11-24'), versions, undefined)).toBe(true);
    expect(isLost(row('proposed', '2026-11-24'), versions, undefined)).toBe(false);
  });
});

describe('stepText і groupState', () => {
  const base = { date: '2026-11-16', moved_to: null };
  it('крок — за самим рядком, не за step задачі', () => {
    expect(stepText({ ...base, kind: 'teacher' })).toMatch(/^Крок 1/);
    expect(
      stepText({
        kind: 'moved',
        date: '2026-11-16',
        moved_to: { date: '2026-11-16', lesson_no: 6 },
      }),
    ).toMatch(/^Крок 2/);
    expect(
      stepText({
        kind: 'moved',
        date: '2026-11-16',
        moved_to: { date: '2026-11-17', lesson_no: 1 },
      }),
    ).toMatch(/^Крок 3/);
    expect(stepText({ ...base, kind: 'self_study' })).toMatch(/самостійна робота/);
  });

  it('стан групи', () => {
    expect(groupState([])).toBe('empty');
    expect(groupState([{ state: 'approved' }, { state: 'proposed' }])).toBe('proposed');
    expect(groupState([{ state: 'rejected' }, { state: 'rejected' }])).toBe('rejected');
    expect(groupState([{ state: 'approved' }, { state: 'approved' }])).toBe('approved');
  });
});
