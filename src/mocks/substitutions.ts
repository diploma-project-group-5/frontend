import type {
  CurriculumRow,
  Day,
  IsoDate,
  Lesson,
  Substitution,
  Teacher,
  TimetableDetail,
} from '@/api/types';

/**
 * Спрощений solver замін для мок-режиму. Справжній solver задачі substitution ще не обробляє
 * (contracts: solve.substitution.requested — чернетка етапу 2), тож тут лише крок 1 специфікації:
 *  - вільний вчитель, що цього дня працює в тому ж форматі (або не має уроків), не недоступний
 *    у цей день і не вичерпав тижневого ліміту;
 *  - перевага — вчителю цього предмета, інакше «не за фахом»;
 *  - кандидата немає — «самостійна робота» (крок 3 без результату).
 * Форма результату — як приймає timetable-service (README, «Результат заміни»).
 */

export const isoWeekday = (date: IsoDate): Day =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) as Day;

/** Уроки відсутнього на дату: увесь день або лише вказані номери. */
export function lessonsToCover(
  tt: TimetableDetail,
  date: IsoDate,
  teacherId: string,
  lessonNos: number[] | null,
): Lesson[] {
  const day = isoWeekday(date);
  return tt.lessons
    .filter(
      (l) =>
        l.teacher_id === teacherId &&
        l.day === day &&
        (lessonNos === null || lessonNos.includes(l.lesson_no)),
    )
    .sort((a, b) => a.lesson_no - b.lesson_no || a.class_id.localeCompare(b.class_id));
}

export type Proposal = Pick<
  Substitution,
  | 'class_id'
  | 'lesson_no'
  | 'subject_id'
  | 'original_teacher_id'
  | 'kind'
  | 'new_teacher_id'
  | 'off_profile'
  | 'moved_to'
>;

export function propose({
  tt,
  date,
  absentId,
  lessons,
  teachers,
  plan,
  busy,
}: {
  tt: TimetableDetail;
  date: IsoDate;
  absentId: string;
  lessons: Lesson[];
  teachers: Teacher[];
  plan: CurriculumRow[];
  /** уже зайнятий іншою заміною на цю дату й урок */
  busy: (teacherId: string, lessonNo: number) => boolean;
}): { step: number; proposals: Proposal[] } {
  const day = isoWeekday(date);
  const formatOf = (classId: string) =>
    tt.day_formats.find((f) => f.class_id === classId && f.day === day)?.format;
  const weekly = new Map<string, number>();
  for (const l of tt.lessons) weekly.set(l.teacher_id, (weekly.get(l.teacher_id) ?? 0) + 1);
  const extra = new Map<string, Set<number>>(); // уроки, які кандидат уже бере в цій задачі

  const proposals = lessons.map((l): Proposal => {
    const base = {
      class_id: l.class_id,
      lesson_no: l.lesson_no,
      subject_id: l.subject_id,
      original_teacher_id: absentId,
      moved_to: null,
    };
    const fmt = formatOf(l.class_id);
    const teachesSubject = (t: Teacher) =>
      plan.some((r) => r.teacher_id === t.teacher_id && r.subject_id === l.subject_id);
    const free = teachers.filter((t) => {
      if (t.teacher_id === absentId || t.deleted_at) return false;
      if (t.unavailable_days.includes(day)) return false;
      const own = tt.lessons.filter((x) => x.teacher_id === t.teacher_id && x.day === day);
      if (own.some((x) => x.lesson_no === l.lesson_no)) return false;
      if (extra.get(t.teacher_id)?.has(l.lesson_no) || busy(t.teacher_id, l.lesson_no))
        return false;
      // один формат за день; мок-розклад цього правила не тримає (як і мок-валідатор), тож
      // якщо в кандидата вже змішані формати, правило для нього не застосовуємо
      const formats = new Set(own.map((x) => formatOf(x.class_id)));
      if (formats.size === 1 && !formats.has(fmt)) return false;
      const hours = (weekly.get(t.teacher_id) ?? 0) + (extra.get(t.teacher_id)?.size ?? 0);
      return hours < t.weekly_hours_limit;
    });
    const pick = [...free].sort(
      (a, b) =>
        Number(teachesSubject(b)) - Number(teachesSubject(a)) ||
        (weekly.get(a.teacher_id) ?? 0) - (weekly.get(b.teacher_id) ?? 0) ||
        a.teacher_no - b.teacher_no,
    )[0];
    if (!pick) return { ...base, kind: 'self_study', new_teacher_id: null, off_profile: false };
    extra.set(pick.teacher_id, new Set([...(extra.get(pick.teacher_id) ?? []), l.lesson_no]));
    return {
      ...base,
      kind: 'teacher',
      new_teacher_id: pick.teacher_id,
      off_profile: !teachesSubject(pick),
    };
  });
  return { step: proposals.some((p) => p.kind === 'self_study') ? 3 : 1, proposals };
}
