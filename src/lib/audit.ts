import { fieldLabel } from './fields';
import { formatDate } from './time';

/**
 * Журнал дій: сервіси пишуть машинні коди (school-service і timetable-service, recordAudit /
 * writeAudit). Укладачу показуємо їх українською; невідомий код — як є, щоб нічого не губилось.
 */
const ACTION_LABEL: Record<string, string> = {
  school_registered: 'Заклад зареєстровано',
  profile_updated: 'Змінено профіль закладу',
  bells_replaced: 'Змінено дзвінки',
  class_created: 'Додано клас',
  class_updated: 'Змінено клас',
  class_archived: 'Клас архівовано',
  subject_created: 'Додано предмет',
  subject_updated: 'Змінено предмет',
  subject_archived: 'Предмет архівовано',
  teacher_created: 'Додано вчителя',
  teacher_updated: 'Змінено вчителя',
  teacher_deleted: 'Дані вчителя видалено',
  teacher_exported: 'Експорт даних вчителя',
  curriculum_replaced: 'Змінено навчальний план',
  holidays_set: 'Задано канікули',
  holidays_cleared: 'Канікули прибрано',
  timetable_published: 'Опубліковано розклад',
  alert_plan_approved: 'Погоджено план тривог',
  alert_plan_activated: 'Активовано розклад тривог',
  alert_plan_ended: 'Повернено звичайний розклад',
  alert_plan_activation_cancelled: 'Скасовано заплановану активацію тривог',
  absence_recorded: 'Внесено відсутність',
  absence_cancelled: 'Скасовано відсутність',
  substitution_approved: 'Погоджено заміну',
  substitution_rejected: 'Відхилено заміну',
  qr_rotated: 'Оновлено QR-код',
};

const DETAIL_LABEL: Record<string, string> = {
  fields: 'поля',
  lessons: 'уроків',
  rows: 'рядків',
  curriculum_rows_removed: 'прибрано рядків плану',
  order_no: 'наказ №',
  order_date: 'дата наказу',
  effective_from: 'діє з',
  replaced_scheduled: 'замінено заплановану',
  from: 'з',
  date: 'дата',
  date_from: 'з',
  date_to: 'по',
  holiday_from: 'з',
  holiday_to: 'по',
  jobs: 'задач',
  scope: 'тип',
  generation: 'покоління',
  source: 'джерело',
  timetable_id: 'версія',
  job_id: 'задача',
  absence_id: 'відсутність',
  token_id: 'токен',
};

const VALUE_LABEL: Record<string, string> = {
  class: 'клас',
  teacher: 'вчитель',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function formatValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (typeof v === 'string') {
    if (DATE.test(v)) return formatDate(v);
    if (UUID.test(v)) return v.slice(0, 8);
    return VALUE_LABEL[v] ?? v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    return v
      .map((x) => (key === 'fields' && typeof x === 'string' ? fieldLabel(x) : formatValue(key, x)))
      .join(', ');
  }
  if (typeof v === 'object') {
    // вкладений об'єкт показуємо парами «ключ: значення», а не «[object Object]»
    return `(${formatAuditDetails(v as Record<string, unknown>)})`;
  }
  return String(v);
}

/** details запису журналу одним рядком: «поля: місткість укриття; наказ №: 12». */
export function formatAuditDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => `${DETAIL_LABEL[k] ?? k}: ${formatValue(k, v)}`)
    .join('; ');
}
