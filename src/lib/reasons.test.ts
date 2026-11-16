import type { DayFormat } from '@/api/types';
import { reasonText } from './reasons';

describe('reasonText: пояснення формату дня українською (frontend #6)', () => {
  it.each<[DayFormat, string, RegExp]>([
    ['in_person', 'priority', /пріоритет/],
    ['in_person', 'capacity_available', /місця в укритті вистачило/],
    ['remote', 'capacity_available', /місце в укритті було, але цей день не обрано очним/],
    ['remote', 'day_limit', /не вмістився в ліміт укриття/],
    ['remote', 'no_shelter', /не проводиться в укритті/],
    ['remote', 'no_lessons', /немає уроків/],
  ])('%s · %s', (format, reason, text) => {
    expect(reasonText(format, reason)).toMatch(text);
  });

  it.each<[DayFormat, string | undefined]>([
    ['remote', 'priority'], // з validator-lib 0.3.0 не буває
    ['in_person', 'day_limit'],
    ['remote', 'some_new_reason'],
    ['in_person', undefined],
  ])('невідома пара %s · %s — запасний текст без коду', (format, reason) => {
    const text = reasonText(format, reason);
    expect(text).toBe('пояснення причини поки немає');
    expect(text).not.toMatch(/[a-z_]{3,}/);
  });
});
