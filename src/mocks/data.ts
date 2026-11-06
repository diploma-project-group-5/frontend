import type {
  AccessToken,
  ClassDayFormat,
  Conflict,
  CurriculumRow,
  Day,
  Lesson,
  SchoolClass,
  SchoolListItem,
  SchoolProfile,
  Subject,
  Teacher,
  TimetableDetail,
  TimetableLoad,
  TimetableSummary,
} from '@/api/types';

/** Демо-заклад для мок-режиму (`npm run dev:mock`). Дані вигадані. */

export const profile: SchoolProfile = {
  name: 'Ліцей № 17',
  lessons_per_day: 6,
  saturday: false,
  shelter_capacity: 160,
  non_teaching_staff: 12,
  shelter_seats: 130,
  snapshot_version: 42,
};

export const bells = [
  ['08:30', '09:15'],
  ['09:25', '10:10'],
  ['10:30', '11:15'],
  ['11:35', '12:20'],
  ['12:30', '13:15'],
  ['13:25', '14:10'],
].map(([start, end], i) => ({ lesson_no: i + 1, start: start!, end: end! }));

export const classes: SchoolClass[] = (
  [
    ['5-А', 28, true],
    ['5-Б', 26, false],
    ['6-А', 30, true],
    ['6-Б', 25, false],
    ['7-А', 29, false],
    ['7-Б', 27, true],
  ] as const
).map(([name, students, prio], i) => ({
  class_id: `c${i + 1}`,
  name,
  students,
  in_person_priority: prio,
  archived_at: null,
}));

export const subjects: Subject[] = (
  [
    ['Українська мова', 'Укр', 'language_literature'],
    ['Математика', 'Мат', 'math'],
    ['Англійська мова', 'Англ', 'language_literature'],
    ['Історія', 'Іст', 'civic_history'],
    ['Біологія', 'Біол', 'science'],
    ['Інформатика', 'Інф', 'informatics'],
    ['Мистецтво', 'Мист', 'arts'],
    ['Фізкультура', 'Фізк', 'physical'],
  ] as const
).map(([name, short_name, area], i) => ({
  subject_id: `s${i + 1}`,
  name,
  short_name,
  education_area: area,
  not_in_shelter: area === 'physical',
  archived_at: null,
}));

export const teachers: Teacher[] = [
  'Іваненко О. П.',
  'Коваль Н. В.',
  'Мельник І. С.',
  'Шевченко Л. М.',
  'Бондар Т. І.',
  'Ткаченко Г. О.',
  'Кравець А. Р.',
  'Олійник В. Д.',
].map((label, i) => ({
  teacher_id: `t${i + 1}`,
  teacher_no: i + 1,
  label,
  weekly_hours_limit: 24,
  unavailable_days: [],
}));

export const DAYS: Day[] = [1, 2, 3, 4, 5];

/** Навантаження дня за формулою 1.1: учні очних класів + персонал + вчителі з очними уроками. */
function dayLoad(day: Day, lessons: Lesson[], formats: ClassDayFormat[]) {
  const inPerson = formats.filter((f) => f.day === day && f.format === 'in_person');
  const students = inPerson.reduce(
    (sum, f) => sum + classes.find((c) => c.class_id === f.class_id)!.students,
    0,
  );
  const teachersInPerson = new Set(
    lessons
      .filter((l) => l.day === day && inPerson.some((f) => f.class_id === l.class_id))
      .map((l) => l.teacher_id),
  ).size;
  return students + profile.non_teaching_staff! + teachersInPerson;
}

/** Як солвер: поки день не вміщається в ліміт, переводимо на дистанційне спершу класи без пріоритету. */
function fitCapacity(lessons: Lesson[], formats: ClassDayFormat[]) {
  const limit = profile.shelter_capacity!;
  for (const day of DAYS) {
    const order = [...classes.filter((c) => !c.archived_at)].sort(
      (a, b) =>
        Number(a.in_person_priority) - Number(b.in_person_priority) || a.students - b.students,
    );
    for (const c of order) {
      if (dayLoad(day, lessons, formats) <= limit) break;
      const f = formats.find((x) => x.class_id === c.class_id && x.day === day);
      if (f) f.format = 'remote';
    }
  }
}

/** Навчальний план закладу (GET/PUT /curriculum); заповнюється з чинної версії під час старту. */
export const plan: CurriculumRow[] = [];

/**
 * Детермінована «побудова»: якщо план є — розкладає його години по днях і уроках,
 * інакше зсуває предмети по класах і днях; seed змінює розклад.
 */
export function makeTimetable(id: string, seed: number): TimetableDetail {
  const lessons: Lesson[] = [];
  const day_formats: ClassDayFormat[] = [];
  const perDay = profile.lessons_per_day ?? 6;
  classes
    .filter((c) => !c.archived_at)
    .forEach((c, ci) => {
      for (const day of DAYS) {
        // один дистанційний день на клас; пріоритетні класи частіше лишаються очно
        const remoteDay = ((ci + seed) % 5) + 1;
        const remote = day === remoteDay && !(c.in_person_priority && (ci + day) % 2 === 0);
        day_formats.push({ class_id: c.class_id, day, format: remote ? 'remote' : 'in_person' });
      }
      const rows = plan.filter((r) => r.class_id === c.class_id && r.hours_per_week > 0);
      if (plan.length) {
        const queue = rows.flatMap((r) => Array<CurriculumRow>(r.hours_per_week).fill(r));
        const shift = queue.length ? (ci + seed) % queue.length : 0;
        const ordered = [...queue.slice(shift), ...queue.slice(0, shift)];
        // слоти «урок 1 пн…пт, урок 2 пн…пт…», щоб предмет розходився по днях
        const slots = Array.from({ length: perDay * DAYS.length }, (_, k) => ({
          day: DAYS[k % DAYS.length]!,
          lesson_no: Math.floor(k / DAYS.length) + 1,
        }));
        const used = new Set<number>();
        for (const r of ordered) {
          // як солвер: без накладок вчителя; не знайшлося слоту — урок «не розміщено»
          const k = slots.findIndex(
            (sl, i) =>
              !used.has(i) &&
              !lessons.some(
                (l) =>
                  l.teacher_id === r.teacher_id && l.day === sl.day && l.lesson_no === sl.lesson_no,
              ),
          );
          if (k < 0) continue;
          used.add(k);
          lessons.push({
            class_id: c.class_id,
            ...slots[k]!,
            subject_id: r.subject_id,
            teacher_id: r.teacher_id,
          });
        }
        return;
      }
      for (const day of DAYS) {
        for (let n = 1; n <= 6; n++) {
          const si = (ci + day * 3 + n + seed) % subjects.length;
          lessons.push({
            class_id: c.class_id,
            day,
            lesson_no: n,
            subject_id: subjects[si]!.subject_id,
            teacher_id: teachers[si]!.teacher_id,
          });
        }
      }
    });
  fitCapacity(lessons, day_formats);
  return {
    timetable_id: id,
    kind: 'main',
    model: '1.1',
    state: 'validated',
    effective_from: null,
    published_at: null,
    data_changed_since_build: false,
    created_at: new Date().toISOString(),
    snapshot_version: profile.snapshot_version,
    classes: classes
      .filter((c) => !c.archived_at)
      .map(({ class_id, name }) => ({ class_id, name })),
    teachers: teachers.map(({ teacher_id, label }) => ({ teacher_id, label })),
    lessons,
    day_formats,
  };
}

/**
 * Спрощений validator-lib для мока: накладки вчителів, недоступні дні, номер уроку ≤ уроків на день.
 * Правило «вчитель за день в одному форматі» мок-солвер не моделює, тож тут його немає.
 */
const DAY_NAME = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;

export function validateTimetable(tt: TimetableDetail): Conflict[] {
  const out: Conflict[] = [];
  const perDay = profile.lessons_per_day ?? 6;
  const name = (id: string) => tt.classes.find((c) => c.class_id === id)?.name ?? id;
  const label = (id: string) => tt.teachers.find((x) => x.teacher_id === id)?.label ?? id;
  const seen = new Map<string, Lesson>();
  for (const l of tt.lessons) {
    if (l.lesson_no > perDay) {
      out.push({
        rule: 'lesson_out_of_range',
        class_id: l.class_id,
        day: l.day,
        lesson_no: l.lesson_no,
        message: `${name(l.class_id)}: ${l.lesson_no} урок, а уроків на день ${perDay}`,
      });
    }
    const t = teachers.find((x) => x.teacher_id === l.teacher_id);
    if (t?.unavailable_days.includes(l.day)) {
      out.push({
        rule: 'teacher_unavailable',
        teacher_id: l.teacher_id,
        day: l.day,
        message: `${t.label} не працює в цей день`,
      });
    }
    const key = `${l.teacher_id}|${l.day}|${l.lesson_no}`;
    const other = seen.get(key);
    if (other) {
      out.push({
        rule: 'teacher_clash',
        teacher_id: l.teacher_id,
        day: l.day,
        lesson_no: l.lesson_no,
        message: `${label(l.teacher_id)}: накладка ${name(other.class_id)} і ${name(l.class_id)} (${DAY_NAME[l.day]}, ${l.lesson_no} урок)`,
      });
    } else seen.set(key, l);
  }
  return out;
}

/** Формула 1.1: учні очних класів + персонал + вчителі з очними уроками ≤ паспортна місткість. */
export function makeLoad(tt: TimetableDetail): TimetableLoad {
  const limit = profile.shelter_capacity!;
  const days = DAYS.map((day) => ({
    day,
    passport: { load: dayLoad(day, tt.lessons, tt.day_formats), limit },
  }));
  const peak = days.reduce((a, b) => (b.passport.load > a.passport.load ? b : a));
  return {
    model: '1.1',
    days,
    class_days: tt.day_formats.map((f) => {
      const c = classes.find((x) => x.class_id === f.class_id)!;
      return {
        ...f,
        reason:
          f.format === 'remote'
            ? 'Ліміт укриття на цей день вичерпано'
            : c.in_person_priority
              ? 'Клас має пріоритет очного навчання'
              : 'Місць в укритті вистачає',
      };
    }),
    summary: {
      remote_class_days: tt.day_formats.filter((f) => f.format === 'remote').length,
      peak: { day: peak.day, load: peak.passport.load, limit },
      build_ms: 3200,
      classes_without_in_person_days: [],
    },
    validation: (() => {
      const conflicts = validateTimetable(tt);
      return { ok: conflicts.length === 0, conflicts };
    })(),
  };
}

export function summary(tt: TimetableDetail): TimetableSummary {
  return {
    timetable_id: tt.timetable_id,
    kind: 'main',
    model: tt.model,
    state: tt.state,
    effective_from: tt.effective_from,
    published_at: tt.published_at,
    data_changed_since_build: tt.data_changed_since_build,
    created_at: tt.created_at,
  };
}

export const schools: SchoolListItem[] = [
  { school_id: 'sch1', name: 'Ліцей № 17', login: 'lyceum17', created_at: '2026-10-01T09:00:00Z' },
  { school_id: 'sch2', name: 'Гімназія № 5', login: 'gym5', created_at: '2026-10-14T12:30:00Z' },
];

const generations = new Map<string, number>();

export function tokens(): AccessToken[] {
  const origin = window.location.origin;
  const make = (
    scope: 'class' | 'teacher',
    tokenId: string,
    targetId: string,
    label: string,
    hash: string,
  ): AccessToken => ({
    token_id: tokenId,
    scope,
    target_id: targetId,
    target_label: label,
    generation: generations.get(tokenId) ?? 1,
    url: `${origin}/${scope === 'class' ? 'c' : 't'}#${hash}`,
  });
  return [
    ...classes
      .filter((c) => !c.archived_at) // архівований клас — QR відкликано
      .map((c) =>
        make(
          'class',
          `q-${c.class_id}`,
          c.class_id,
          c.name,
          c.class_id === 'c1' ? 'demo-class' : `demo-${c.class_id}`,
        ),
      ),
    ...teachers
      .filter((t) => !t.deleted_at) // видалений вчитель — QR відкликано
      .map((t) =>
        make(
          'teacher',
          `q-${t.teacher_id}`,
          t.teacher_id,
          t.label,
          t.teacher_id === 't1' ? 'demo-teacher' : `demo-${t.teacher_id}`,
        ),
      ),
  ];
}

export function rotate(tokenId: string): AccessToken | undefined {
  generations.set(tokenId, (generations.get(tokenId) ?? 1) + 1);
  return tokens().find((t) => t.token_id === tokenId);
}

/** Навчальний план, що відповідає чинній версії: клас × предмет → вчитель, годин на тиждень. */
export function curriculum(tt: TimetableDetail): CurriculumRow[] {
  const rows = new Map<string, CurriculumRow>();
  for (const l of tt.lessons) {
    const key = `${l.class_id}|${l.subject_id}`;
    const r = rows.get(key);
    if (r) r.hours_per_week++;
    else
      rows.set(key, {
        class_id: l.class_id,
        subject_id: l.subject_id,
        teacher_id: l.teacher_id,
        hours_per_week: 1,
      });
  }
  return [...rows.values()];
}
