/**
 * Українські форми після числа: 1 день, 2 дні, 5 днів, 11 днів, 21 день.
 * forms — [одна, кілька (2–4), багато].
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  const form =
    m10 === 1 && m100 !== 11
      ? forms[0]
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)
        ? forms[1]
        : forms[2];
  return `${n} ${form}`;
}

export const DAYS_FORMS = ['день', 'дні', 'днів'] as const;
export const LESSONS_FORMS = ['урок', 'уроки', 'уроків'] as const;

/** Тривалість у хвилинах як «2 год», «1 год 30 хв», «45 хв» — без дробових годин. */
export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} хв`;
  return m ? `${h} год ${m} хв` : `${h} год`;
}
