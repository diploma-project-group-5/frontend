import type { AlertActivation, TimetableSummary } from '@/api/types';
import { activeActivation, mainPhases } from './phases';

const v = (id: string, state: TimetableSummary['state'], effective_from: string | null) =>
  ({ timetable_id: id, state, effective_from }) as TimetableSummary;

describe('mainPhases', () => {
  const list = [
    v('old', 'published', '2026-09-01'),
    v('cur', 'published', '2026-10-19'),
    v('next', 'published', '2026-11-16'),
    v('draft', 'validated', null),
  ];

  it('чинна — найпізніша з тих, що вже діють; запланована — майбутня', () => {
    const p = mainPhases(list, '2026-11-11');
    expect(p.current?.timetable_id).toBe('cur');
    expect(p.scheduled?.timetable_id).toBe('next');
  });

  it('у день набуття чинності запланована стає чинною', () => {
    const p = mainPhases(list, '2026-11-16');
    expect(p.current?.timetable_id).toBe('next');
    expect(p.scheduled).toBeUndefined();
  });

  it('чернетки не враховуються; до першої публікації чинної немає', () => {
    const p = mainPhases([v('draft', 'validated', null)], '2026-11-11');
    expect(p).toEqual({ current: undefined, scheduled: undefined });
  });
});

describe('activeActivation', () => {
  const a = (id: string, from: string, to: string | null): AlertActivation => ({
    activation_id: id,
    from,
    to,
  });

  it('from ≤ дата < to: дата повернення вже не входить', () => {
    const list = [a('a1', '2026-11-02', '2026-11-09')];
    expect(activeActivation(list, '2026-11-02')?.activation_id).toBe('a1');
    expect(activeActivation(list, '2026-11-08')?.activation_id).toBe('a1');
    expect(activeActivation(list, '2026-11-09')).toBeUndefined();
    expect(activeActivation(list, '2026-11-01')).toBeUndefined();
  });

  it('без дати повернення діє далі', () => {
    expect(activeActivation([a('a2', '2026-11-10', null)], '2027-01-01')?.activation_id).toBe('a2');
  });
});
