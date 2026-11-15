import type {
  AlertPlan,
  Day,
  Holidays,
  IsoDate,
  Substitution,
  TimetableSummary,
} from '@/api/types';
import { addDaysIso, isSchoolDay } from './time';

/**
 * Помічники «Замін» (етап 2). Сервер вирішує сам; тут — лише те, що інтерфейсу треба показати
 * до запиту (які дати й уроки зачепить відсутність) і після (чи заміна ще має силу).
 */

/** ISO-день тижня дати: 1 = пн … 7 = нд. */
export const isoWeekdayOf = (date: IsoDate): Day | 7 =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) as Day | 7;

/** Навчальні дати періоду включно: без вихідних (субота — за профілем) і канікул. */
export function schoolDatesBetween(
  from: IsoDate,
  to: IsoDate,
  saturday = false,
  holidays: Holidays | null = null,
  limit = 31,
): IsoDate[] {
  const out: IsoDate[] = [];
  if (!from || !to || to < from) return out;
  for (let d = from; d <= to && out.length < limit; d = addDaysIso(d, 1)) {
    if (!isSchoolDay(d, saturday)) continue;
    if (holidays?.holiday_from && holidays.holiday_to) {
      if (d >= holidays.holiday_from && d <= holidays.holiday_to) continue;
    }
    out.push(d);
  }
  return out;
}

/**
 * Яка версія діє на дату (як resolveScheduleAt у timetable-service): активація розкладу тривог
 * (from ≤ дата < to) — шаблон тривог; інакше опублікована main з найпізнішою effective_from ≤ дата.
 */
export function versionIdAt(
  date: IsoDate,
  versions: TimetableSummary[],
  alertPlan: Pick<AlertPlan, 'timetable_id' | 'activations'> | undefined,
): { id: string; alert: boolean } | null {
  const act = alertPlan?.activations.find((a) => a.from <= date && (!a.to || a.to > date));
  if (act && alertPlan?.timetable_id) return { id: alertPlan.timetable_id, alert: true };
  const main = versions
    .filter((v) => v.state === 'published' && v.effective_from && v.effective_from <= date)
    .sort((a, b) => a.effective_from!.localeCompare(b.effective_from!))
    .at(-1);
  return main ? { id: main.timetable_id, alert: false } : null;
}

/** Погоджена заміна втрачає силу, коли на її дату почала діяти інша версія (lost_substitutions). */
export function isLost(
  s: Pick<Substitution, 'state' | 'date' | 'timetable_id'>,
  versions: TimetableSummary[],
  alertPlan: Pick<AlertPlan, 'timetable_id' | 'activations'> | undefined,
): boolean {
  if (s.state !== 'approved') return false;
  const v = versionIdAt(s.date, versions, alertPlan);
  return !!v && v.id !== s.timetable_id;
}

/**
 * Як solver знайшов заміну (розділ 06): пояснення під рядком пропозиції. Поле step у
 * timetable-service одне на всю задачу (найдальший крок), тож крок рядка визначаємо з нього самого:
 * новий вчитель — крок 1, перенос у межах дня — крок 2, на інший день — крок 3.
 */
export function stepText(s: Pick<Substitution, 'kind' | 'date' | 'moved_to'>): string {
  if (s.kind === 'self_study' || s.kind === 'cancelled')
    return 'Розв’язку немає й у межах тижня: самостійна робота, укладач може обрати «скасовано»';
  if (s.kind === 'moved')
    return s.moved_to && s.moved_to.date !== s.date
      ? 'Крок 3 · сусідній навчальний день у межах тижня'
      : 'Крок 2 · перебудова лише дня відсутності, формати днів не змінено';
  return 'Крок 1 · вільний вчитель, що цього дня працює в тому ж форматі';
}

/** Стан групи пропозицій однієї задачі (одна дата). */
export function groupState(rows: Pick<Substitution, 'state'>[]): Substitution['state'] | 'empty' {
  if (!rows.length) return 'empty';
  if (rows.some((r) => r.state === 'proposed')) return 'proposed';
  if (rows.every((r) => r.state === 'rejected')) return 'rejected';
  return 'approved';
}
