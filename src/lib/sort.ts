/**
 * Порядок назв, як читає людина: «2-А» перед «10-А», «5-А» перед «5-Б», «Вчитель 2» перед
 * «Вчитель 10». Звичайне порівняння рядків дає 1-А, 10-А, 11-А, 2-А…
 */
const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

export const compareLabels = (a: string, b: string): number => collator.compare(a, b);

export function sortByLabel<T>(items: readonly T[], label: (x: T) => string): T[] {
  return [...items].sort((a, b) => compareLabels(label(a), label(b)));
}
