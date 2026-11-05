/**
 * Типи API «Лад» за специфікацією MVP v24 (03.11.2026).
 *
 * ТИМЧАСОВО написані вручну. Джерело правди — OpenAPI у репозиторії `contracts`;
 * коли з'явиться npm-пакет з типами, цей файл замінюється реекспортом з нього.
 * Поля, яких специфікація не фіксує явно, позначено `// припущення`.
 *
 * Правила (розділ 07): snake_case, enum у нижньому регістрі, модель — рядок "1.1" | "1.2",
 * списки без пагінації, дати — 'YYYY-MM-DD', час дзвінків — 'HH:MM'.
 */

export type IsoDate = string;
export type IsoDateTime = string;
export type Uuid = string;

/** Навчальний день: 1 = пн … 6 = сб. */
export type Day = 1 | 2 | 3 | 4 | 5 | 6;
export type Model = '1.1' | '1.2';
export type DayFormat = 'in_person' | 'remote'; // припущення щодо назв значень

// ───────────── помилки ─────────────

export type ProblemCode =
  | 'stale'
  | 'login_taken'
  | 'build_in_progress'
  | 'published_readonly'
  | 'profile_incomplete'
  | 'alert_plan_active'
  | 'alert_plan_locked'
  | (string & {});

/** Елемент conflicts[]: клас, день, правило (розділ 05). Точна форма — у contracts. */
export interface Conflict {
  rule: string;
  class_id?: Uuid;
  teacher_id?: Uuid;
  subject_id?: Uuid;
  day?: Day;
  lesson_no?: number;
  /** для ліміту 1.2 validator-lib називає порушену умову */
  limit?: 'seats' | 'passport';
  message?: string;
}

export interface Warnings {
  lost_substitutions: LostSubstitution[];
}

export interface LostSubstitution {
  date: IsoDate;
  class_id: Uuid;
  lesson_no: number;
}

// ───────────── tenant ─────────────

export interface SchoolRegistration {
  name: string;
  login: string;
}

export interface SchoolRegistered {
  school_id: Uuid;
  login: string;
  /** Показується один раз, сервер його не зберігає. */
  temporary_password: string;
}

export interface SchoolListItem {
  school_id: Uuid;
  name: string;
  login: string;
  created_at: IsoDateTime;
}

// ───────────── school ─────────────

export interface SchoolProfile {
  name: string;
  lessons_per_day: number | null;
  saturday: boolean;
  shelter_capacity: number | null; // паспортна місткість укриття
  non_teaching_staff: number | null; // непедагогічний персонал у будівлі
  shelter_seats: number | null; // облаштовані навчальні місця
  snapshot_version: number;
}

export interface Bell {
  lesson_no: number;
  start: string;
  end: string;
}

export interface SchoolClass {
  class_id: Uuid;
  name: string;
  students: number;
  in_person_priority: boolean;
  archived_at: IsoDateTime | null;
}

export type ClassInput = Pick<SchoolClass, 'name' | 'students' | 'in_person_priority'>;

export type EducationArea =
  | 'math'
  | 'science'
  | 'language_literature'
  | 'civic_history'
  | 'informatics'
  | 'arts'
  | 'technology'
  | 'social_health'
  | 'physical'; // припущення щодо кодів 9 освітніх галузей

export interface Subject {
  subject_id: Uuid;
  name: string;
  short_name: string;
  education_area: EducationArea;
  not_in_shelter: boolean;
  archived_at: IsoDateTime | null;
}

export type SubjectInput = Pick<
  Subject,
  'name' | 'short_name' | 'education_area' | 'not_in_shelter'
>;

export interface Teacher {
  teacher_id: Uuid;
  teacher_no: number;
  label: string; // підпис: «Іваненко О. П.» або «Математика-1»
  weekly_hours_limit: number;
  unavailable_days: Day[];
  /** етап 2: після видалення (ст. 15) лишається лише «Вчитель #N» */
  deleted_at?: IsoDateTime | null;
}

export type TeacherInput = Pick<Teacher, 'label' | 'weekly_hours_limit' | 'unavailable_days'>;

export interface CurriculumRow {
  class_id: Uuid;
  subject_id: Uuid;
  teacher_id: Uuid;
  hours_per_week: number;
}

export interface AuditEntry {
  entry_id: Uuid;
  at: IsoDateTime;
  actor: string;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
}

// ───────────── timetable: задачі ─────────────

export type JobKind = 'build_main' | 'build_alert' | 'substitution';
export type JobState =
  'queued' | 'running' | 'done' | 'infeasible' | 'rejected' | 'timeout' | 'failed';

export const TERMINAL_JOB_STATES: readonly JobState[] = [
  'done',
  'infeasible',
  'rejected',
  'timeout',
  'failed',
];

export interface JobAccepted {
  job_id: Uuid;
}

export interface Job {
  job_id: Uuid;
  kind: JobKind;
  state: JobState;
  snapshot_version: number;
  created_at: IsoDateTime;
  started_at: IsoDateTime | null;
  conflicts?: Conflict[];
  result?: { timetable_id: Uuid } | { alert_plan: true } | { proposals: unknown[] };
}

// ───────────── timetable: версії ─────────────

export type VersionState = 'validated' | 'published';
/** Обчислюється при читанні з effective_from і «сьогодні» (Europe/Kyiv), у БД не зберігається. */
export type PublishedPhase = 'scheduled' | 'current' | 'archived';

export interface TimetableSummary {
  timetable_id: Uuid;
  kind: 'main';
  model: Model;
  state: VersionState;
  effective_from: IsoDate | null;
  published_at: IsoDateTime | null;
  phase?: PublishedPhase; // припущення: сервер може віддавати обчислену фазу
  data_changed_since_build: boolean;
  created_at: IsoDateTime;
}

export interface Lesson {
  class_id: Uuid;
  day: Day;
  lesson_no: number;
  subject_id: Uuid;
  teacher_id: Uuid;
}

export interface ClassDayFormat {
  class_id: Uuid;
  day: Day;
  format: DayFormat;
}

export interface TimetableDetail extends Omit<TimetableSummary, 'kind'> {
  kind: 'main' | 'alert';
  snapshot_version: number;
  /** копія назв класів і підписів вчителів зі знімка */
  classes: { class_id: Uuid; name: string }[];
  teachers: { teacher_id: Uuid; label: string }[];
  lessons: Lesson[];
  day_formats: ClassDayFormat[];
  order?: { order_no: string; order_date: IsoDate; approved_by: string };
}

export interface LimitUsage {
  load: number;
  limit: number;
}

export interface TimetableLoad {
  model: Model;
  days: {
    day: Day;
    /** 1.1: одна умова (паспорт); 1.2: обидві окремо */
    passport: LimitUsage;
    seats?: LimitUsage;
  }[];
  class_days: {
    class_id: Uuid;
    day: Day;
    format: DayFormat;
    reason: string; // ліміт дня, пріоритет, «не в укритті»
  }[];
  summary: {
    remote_class_days: number;
    peak: { day: Day; load: number; limit: number };
    build_ms: number;
    classes_without_in_person_days: Uuid[];
  };
  validation: { ok: boolean; conflicts: Conflict[] };
}

export interface PublishRequest {
  order_no: string;
  order_date: IsoDate;
  approved_by: string;
  effective_from: IsoDate;
}

export interface PublishResponse {
  timetable: TimetableSummary;
  warnings: Warnings;
}

// ───────────── розклад тривог ─────────────

export interface AlertActivation {
  activation_id: Uuid;
  from: IsoDate;
  to: IsoDate | null;
  order_no?: string;
}

export interface AlertPlan {
  timetable_id: Uuid | null;
  state: 'draft' | 'approved';
  bells: Bell[];
  order: { order_no: string; order_date: IsoDate; approved_by: string } | null;
  activations: AlertActivation[];
}

export interface AlertHours {
  days: { date: IsoDate; minutes: number }[];
  current_streak_days: number;
  recommendation: boolean;
  threshold_minutes: number;
  threshold_days: number;
}

// ───────────── канікули (етап 2) ─────────────

/** «Стан закладу» в timetable: дві дати або обидві null; вільного тексту немає (розділ 10). */
export interface Holidays {
  holiday_from: IsoDate | null;
  holiday_to: IsoDate | null;
}

// ───────────── QR ─────────────

export type TokenScope = 'class' | 'teacher';

export interface AccessToken {
  token_id: Uuid;
  scope: TokenScope;
  target_id: Uuid;
  target_label: string;
  generation: number;
  /** відтворене посилання з токеном у фрагменті: https://…/c#<token> */
  url: string;
}

// ───────────── публічна сторінка за QR (розділ 11) ─────────────

export interface PublicLesson {
  lesson_no: number;
  start: string;
  end: string;
  /** для сторінки класу */
  subject?: string;
  /** для сторінки вчителя */
  class_name?: string;
  substitution: boolean;
}

export interface PublicDay {
  date: IsoDate;
  format: DayFormat;
  lessons: PublicLesson[];
  /** етап 2 */
  holiday?: boolean;
  holiday_from?: IsoDate;
  holiday_to?: IsoDate;
}

export interface PublicTimetable {
  state: 'published' | 'not_published';
  target_label: string;
  published_at: IsoDateTime | null;
  upcoming_change: string | null;
  weeks: { week: string; days: PublicDay[] }[];
}
