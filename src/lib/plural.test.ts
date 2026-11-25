import { DAYS_FORMS, durationText, LESSONS_FORMS, plural } from './plural';

it('форми після числа', () => {
  expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => plural(n, DAYS_FORMS))).toEqual([
    '1 день',
    '2 дні',
    '4 дні',
    '5 днів',
    '11 днів',
    '12 днів',
    '14 днів',
    '21 день',
    '22 дні',
    '25 днів',
    '101 день',
    '111 днів',
  ]);
  expect(plural(4, LESSONS_FORMS)).toBe('4 уроки');
  expect(plural(7, LESSONS_FORMS)).toBe('7 уроків');
});

it('тривалість без дробових годин', () => {
  expect(durationText(120)).toBe('2 год');
  expect(durationText(90)).toBe('1 год 30 хв');
  expect(durationText(45)).toBe('45 хв');
});
