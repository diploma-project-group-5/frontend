import {
  formatDate,
  formatDayHeading,
  isoWeekKyiv,
  minEffectiveFrom,
  publishedPhase,
  todayKyiv,
} from './time';

describe('todayKyiv', () => {
  it('о 23:30 за Києвом — ще той самий день, хоча в UTC інший час', () => {
    // 2026-11-05 23:30 Kyiv (UTC+2 взимку) = 21:30 UTC
    expect(todayKyiv(new Date('2026-11-05T21:30:00Z'))).toBe('2026-11-05');
  });

  it('о 00:30 за Києвом — уже наступний день, хоча в UTC ще попередній', () => {
    // 2026-11-06 00:30 Kyiv = 2026-11-05 22:30 UTC
    expect(todayKyiv(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06');
  });

  it('влітку зсув +3 (перехід на літній час)', () => {
    // 2026-07-01 00:30 Kyiv (UTC+3) = 2026-06-30 21:30 UTC
    expect(todayKyiv(new Date('2026-06-30T21:30:00Z'))).toBe('2026-07-01');
  });
});

describe('isoWeekKyiv', () => {
  it('рахує ISO-тиждень за Києвом', () => {
    expect(isoWeekKyiv(new Date('2026-11-05T10:00:00Z'))).toBe('2026-W45');
  });

  it('межа тижня: неділя 23:30 UTC — це вже понеділок за Києвом', () => {
    // 2026-11-08 (нд) 23:30 UTC = 2026-11-09 (пн) 01:30 Kyiv
    expect(isoWeekKyiv(new Date('2026-11-08T23:30:00Z'))).toBe('2026-W46');
  });
});

describe('minEffectiveFrom', () => {
  it('+7 днів, якщо це навчальний день', () => {
    // чт 05.11 → чт 12.11
    expect(minEffectiveFrom(new Date('2026-11-05T10:00:00Z'))).toBe('2026-11-12');
  });

  it('переносить з вихідного на понеділок', () => {
    // сб 07.11 + 7 = сб 14.11 → пн 16.11
    expect(minEffectiveFrom(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-16');
  });

  it('субота допустима, якщо в профілі ввімкнено суботу', () => {
    expect(minEffectiveFrom(new Date('2026-11-07T10:00:00Z'), 7, true)).toBe('2026-11-14');
  });
});

describe('publishedPhase', () => {
  const all = ['2026-09-01', '2026-10-19', '2026-11-16'];
  const today = '2026-11-05';

  it('майбутня — запланована', () => {
    expect(publishedPhase('2026-11-16', all, today)).toBe('scheduled');
  });
  it('найпізніша з минулих — чинна', () => {
    expect(publishedPhase('2026-10-19', all, today)).toBe('current');
  });
  it('старіші — архівні', () => {
    expect(publishedPhase('2026-09-01', all, today)).toBe('archived');
  });
  it('effective_from сьогодні — вже чинна', () => {
    expect(publishedPhase('2026-11-05', ['2026-10-19', '2026-11-05'], today)).toBe('current');
  });
});

describe('форматування', () => {
  it('formatDate', () => {
    expect(formatDate('2026-11-05')).toBe('05.11.2026');
  });
  it('formatDayHeading', () => {
    expect(formatDayHeading('2026-11-05')).toBe('четвер, 05.11');
  });
});
