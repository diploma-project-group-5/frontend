import { TZDate } from '@date-fns/tz';
import { addDays, format, getISOWeek, getISOWeekYear, isWeekend, parseISO } from 'date-fns';
import { config } from '@/config';
import type { IsoDate, PublishedPhase } from '@/api/types';

/**
 * Модель часу (розділ 04): «сьогодні», ISO-тиждень і «не раніше ніж через 7 днів»
 * рахуються в Europe/Kyiv, а не в зоні браузера.
 */

/** Сьогоднішня дата за Києвом, 'YYYY-MM-DD'. */
export function todayKyiv(now: Date = new Date()): IsoDate {
  return format(new TZDate(now, config.timeZone), 'yyyy-MM-dd');
}

/** ISO-тиждень дати за Києвом, напр. '2026-W45'. */
export function isoWeekKyiv(now: Date = new Date()): string {
  const d = new TZDate(now, config.timeZone);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd');
}

/**
 * Найраніша допустима effective_from: навчальний день не раніше ніж через N днів.
 * Сервер перевіряє сам (422) — це лише підказка для форми.
 */
export function minEffectiveFrom(
  now: Date = new Date(),
  daysAhead: number = config.publishMinDaysAhead,
  saturday = false,
): IsoDate {
  let d = addDaysIso(todayKyiv(now), daysAhead);
  while (!isSchoolDay(d, saturday)) d = addDaysIso(d, 1);
  return d;
}

export function isSchoolDay(date: IsoDate, saturday = false): boolean {
  const d = parseISO(date);
  if (!isWeekend(d)) return true;
  return saturday && d.getDay() === 6;
}

/**
 * Фаза опублікованої версії обчислюється з effective_from (розділ 05):
 * майбутня дата — «запланована»; найпізніша з минулих — «чинна»; решта — «архівна».
 */
export function publishedPhase(
  effectiveFrom: IsoDate,
  allEffectiveFrom: IsoDate[],
  today: IsoDate = todayKyiv(),
): PublishedPhase {
  if (effectiveFrom > today) return 'scheduled';
  const latestPast = allEffectiveFrom
    .filter((d) => d <= today)
    .sort()
    .at(-1);
  return effectiveFrom === latestPast ? 'current' : 'archived';
}

const dateFmt = new Intl.DateTimeFormat('uk-UA', {
  timeZone: config.timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const weekdayFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** 'YYYY-MM-DD' → '05.11.2026' (календарна дата без зсуву зони). */
export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** Момент часу (timestamptz) → дата за Києвом. */
export function formatDateTime(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** 'YYYY-MM-DD' → «четвер, 05.11». */
export function formatDayHeading(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${weekdayFmt.format(d)}, ${shortDateFmt.format(d)}`;
}

export const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
