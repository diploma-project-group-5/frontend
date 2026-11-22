/**
 * Назви полів даних закладу, як їх бачить укладач. Сервіси називають поля кодами
 * (details.fields журналу, detail «Вкажіть значення: shelter_capacity», fields у 422 profile_incomplete).
 */
export const FIELD_LABEL: Record<string, string> = {
  shelter_capacity: 'паспортна місткість укриття',
  non_teaching_staff: 'непедагогічний персонал',
  shelter_seats: 'навчальні місця в укритті',
  lessons_per_day: 'уроків на день',
  saturday: 'субота',
  alert_bells: 'дзвінки тривог',
  bells: 'дзвінки',
  name: 'назва',
  short_name: 'скорочення',
  label: 'підпис',
  students: 'учнів',
  grade: 'паралель',
  priority: 'пріоритет',
  weekly_limit: 'ліміт годин',
  weekly_hours_limit: 'ліміт годин',
  unavailable_days: 'недоступні дні',
};

export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;

/** Коди полів у тексті сервера → назви: «Вкажіть значення: shelter_capacity» → «… паспортна місткість укриття». */
export function humanizeFields(text: string): string {
  return text.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => FIELD_LABEL[m] ?? m);
}
