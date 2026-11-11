import { useQuery, useQueryClient } from '@tanstack/react-query';
import { schoolApi } from '@/api/endpoints';
import type { Conflict, SchoolClass, Subject, Teacher } from '@/api/types';

/**
 * Текст для елемента conflicts[] (contracts/schemas/events/conflict.v1.json).
 * У конфлікті лише ідентифікатори й числа, без назв і підписів: назви підставляє клієнт
 * з даних кабінету укладача (або з копій у версії розкладу).
 */

export interface ConflictNames {
  classes?: ReadonlyMap<string, string>;
  teachers?: ReadonlyMap<string, string>;
  subjects?: ReadonlyMap<string, string>;
}

const DAY = ['', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'] as const;
const CONDITION = { seats: 'навчальні місця', passport: 'паспортна місткість' } as const;

export function describeConflict(c: Conflict, names: ConflictNames = {}): string {
  const cls = (c.class_id && names.classes?.get(c.class_id)) || 'Клас';
  const teacher = (c.teacher_id && names.teachers?.get(c.teacher_id)) || 'Вчитель';
  const subject = (c.subject_id && names.subjects?.get(c.subject_id)) || 'предмет';
  const day = c.day ? DAY[c.day] : null;
  const at = [day, c.lesson_no ? `${c.lesson_no} урок` : null].filter(Boolean).join(', ');
  const when = at ? ` (${at})` : '';
  const ratio =
    c.value !== undefined && c.limit !== undefined ? `: ${c.value} при ліміті ${c.limit}` : '';
  const row = `${cls} · ${subject}`;

  switch (c.rule) {
    case 'capacity_exceeded':
      return `Укриття переповнене${when}${ratio}${c.condition ? ` (${CONDITION[c.condition]})` : ''}.`;
    case 'staff_over_passport':
      return `Непедагогічний персонал сам перевищує паспортну місткість укриття${ratio}.`;
    case 'class_hours_exceed_slots':
      return `${cls}: годин на тиждень більше, ніж уроків у тижні${ratio}.`;
    case 'teacher_weekly_limit':
      return `${teacher}: перевищено тижневий ліміт годин${ratio}.`;
    case 'teacher_hours_exceed_available_slots':
      return `${teacher}: годин більше, ніж уроків у доступні дні${ratio}.`;
    case 'teacher_unavailable_all_days':
      return `${teacher}: має години, але жодного доступного дня.`;
    case 'row_day_cap':
      return `${row}: години не вміщуються в доступні дні.`;
    case 'alert_bells':
      return 'Дзвінки тривог не дають жодного уроку.';
    case 'packing':
      return c.hint && c.teacher_id
        ? `Імовірна причина: найбільше навантаження в ${teacher}.`
        : 'Розклад не вміщується: розв’язувач довів, що варіанта з цими даними немає.';
    case 'invalid_input':
      return 'Запит на побудову відхилено як некоректний.';
    case 'class_not_active':
      return `${cls}: класу вже немає серед активних.`;
    case 'subject_not_active':
      return `${subject}: предмета вже немає серед активних.`;
    case 'teacher_not_active':
      return `${teacher}: вчителя вже немає серед активних.`;
    case 'day_not_school_day':
      return `${day ?? 'День'}: не навчальний день.`;
    case 'lesson_no_out_of_range':
      return `${cls}: урок поза межами дня${when}${c.limit !== undefined ? `, уроків у дні ${c.limit}` : ''}.`;
    case 'day_format_missing':
      return `${cls}: не визначено формат дня${when}.`;
    case 'day_format_duplicate':
      return `${cls}: формат дня задано двічі${when}.`;
    case 'in_person_without_lessons':
      return `${cls}: очний день без уроків${when}.`;
    case 'class_double_booked':
      return `${cls}: два уроки одночасно${when}.`;
    case 'teacher_double_booked':
      return `${teacher}: накладка уроків${when}.`;
    case 'teacher_mixed_format':
      return `${teacher}: в один день має очні й дистанційні класи${when}.`;
    case 'teacher_unavailable_day':
      return `${teacher}: урок у недоступний день${when}.`;
    case 'lesson_not_in_plan':
      return `${row}: такого уроку немає в навчальному плані.`;
    case 'teacher_not_in_plan':
      return `${row}: вчитель не той, що в навчальному плані.`;
    case 'plan_hours_mismatch':
      return `${row}: кількість уроків не збігається з планом${c.value !== undefined && c.limit !== undefined ? ` (${c.value} замість ${c.limit})` : ''}.`;
    case 'no_shelter_in_person':
      return `${cls}: очний день у розкладі тривог без місця в укритті${when}.`;
    default:
      return `Порушено правило ${c.rule}${when}.`;
  }
}

function byId<T>(list: readonly T[] | undefined, id: (x: T) => string, name: (x: T) => string) {
  return list ? new Map(list.map((x) => [id(x), name(x)])) : undefined;
}

export function conflictNames(src: {
  classes?: readonly Pick<SchoolClass, 'class_id' | 'name'>[];
  teachers?: readonly Pick<Teacher, 'teacher_id' | 'label'>[];
  subjects?: readonly Pick<Subject, 'subject_id' | 'short_name' | 'name'>[];
}): ConflictNames {
  return {
    classes: byId(
      src.classes,
      (x) => x.class_id,
      (x) => x.name,
    ),
    teachers: byId(
      src.teachers,
      (x) => x.teacher_id,
      (x) => x.label,
    ),
    subjects: byId(
      src.subjects,
      (x) => x.subject_id,
      (x) => x.name,
    ),
  };
}

/** Назви з даних закладу (кабінет укладача). Ті самі ключі запитів, що й у «Даних закладу». */
export function useConflictNames(): ConflictNames {
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  return conflictNames({ classes: classes.data, teachers: teachers.data, subjects: subjects.data });
}

/** Лише з кешу, без запитів: для загального ProblemNotice (його бачить і адмін). */
export function useCachedConflictNames(): ConflictNames {
  const qc = useQueryClient();
  return conflictNames({
    classes: qc.getQueryData<SchoolClass[]>(['classes']),
    teachers: qc.getQueryData<Teacher[]>(['teachers']),
    subjects: qc.getQueryData<Subject[]>(['subjects']),
  });
}
