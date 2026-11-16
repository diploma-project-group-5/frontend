import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import { config } from '@/config';
import type {
  AlertHours,
  AlertPlan,
  AuditEntry,
  Conflict,
  CurriculumRow,
  Day,
  Job,
  PublicDay,
  PublicTimetable,
  PublishRequest,
  Substitution,
  TimetableDetail,
} from '@/api/types';
import { formatDate, minEffectiveFrom, todayKyiv } from '@/lib/time';
import * as d from './data';
import * as sub from './substitutions';

/**
 * Мок-бекенд для `npm run dev:mock`: підміняє window.fetch для /api/v1/*.
 * Лише для розробки інтерфейсу без platform; у прод-збірку не потрапляє.
 *
 * Сценарії:
 *  - «Побудувати розклад»: задача queued → running → done приблизно за 4 с;
 *  - публікація з «stale» у номері наказу → 409 stale;
 *  - реєстрація закладу з логіном «taken» → 409 login_taken;
 *  - /c#demo-class, /t#demo-teacher — сторінки за QR; будь-який інший токен → 404.
 */

const versions = new Map<string, TimetableDetail>();
type MockJob = {
  createdAt: number;
  seed: number;
  kind: 'build_main' | 'build_alert' | 'substitution';
  timetableId?: string;
  /** substitution: відсутність, дата й шаблон, від якого рахуємо */
  absenceId?: string;
  date?: string;
  computed?: boolean;
};
const jobs = new Map<string, MockJob>();
let seq = 0;

// чинна версія з минулою датою, як у сіді демо
const current = d.makeTimetable('7f3a1c20-0000-4000-8000-000000000001', 0);
current.state = 'published';
current.effective_from = '2026-09-01';
current.published_at = '2026-08-25T10:00:00Z';
current.created_at = '2026-08-20T10:00:00Z';
versions.set(current.timetable_id, current);
d.plan.push(...d.curriculum(current)); // план закладу відповідає чинній версії

// погоджений розклад тривог із сіду (шаблон kind='alert', модель 1.2)
function makeAlertTemplate(seed: number) {
  const tt = d.makeTimetable(crypto.randomUUID(), seed + 2);
  tt.kind = 'alert';
  tt.model = '1.2';
  versions.set(tt.timetable_id, tt);
  return tt.timetable_id;
}

const alertPlan: AlertPlan = {
  timetable_id: makeAlertTemplate(0),
  state: 'approved',
  // скорочені уроки по 35 хв
  bells: [
    ['08:30', '09:05'],
    ['09:15', '09:50'],
    ['10:05', '10:40'],
    ['10:55', '11:30'],
    ['11:40', '12:15'],
    ['12:25', '13:00'],
  ].map(([start, end], i) => ({ lesson_no: i + 1, start: start!, end: end! })),
  order: { order_no: '112-о', order_date: '2026-09-28', approved_by: 'Савченко Л. М., директор' },
  activations: [],
};

/** Що діє на дату (як resolveScheduleAt у timetable-service): активація тривог або чинна main. */
function versionAt(date: string): TimetableDetail | undefined {
  const act = alertPlan.activations.find((a) => a.from <= date && (!a.to || a.to > date));
  if (act && alertPlan.timetable_id) return versions.get(alertPlan.timetable_id);
  return [...versions.values()]
    .filter((v) => v.kind === 'main' && v.state === 'published' && v.effective_from! <= date)
    .sort((a, b) => a.effective_from!.localeCompare(b.effective_from!))
    .at(-1);
}

// ── відсутності й заміни (етап 2) ──
type MockAbsence = {
  absence_id: string;
  teacher_id: string;
  date_from: string;
  date_to: string;
  lesson_nos: number[] | null;
  created_at: string;
  cancelled: boolean;
};
const absences: MockAbsence[] = [];
const subs: Substitution[] = [];
const MAX_ABSENCE_DAYS = 31;

const alertLocked = () => alertPlan.activations.some((a) => !a.to || a.to > todayKyiv());

// облік тривог: вигадані хвилини за останні дні, остання серія — понад поріг
const THRESHOLD_MIN = 120;
const THRESHOLD_DAYS = 3;
const alertMinutes = new Map<string, number>();
for (let i = 13; i >= 0; i--) {
  const date = addDaysIsoLocal(todayKyiv(), -i);
  alertMinutes.set(date, i <= 2 ? 150 + i * 20 : [0, 45, 90, 30, 0, 160, 20][i % 7]!);
}

function addDaysIsoLocal(date: string, n: number) {
  return format(addDays(parseISO(date), n), 'yyyy-MM-dd');
}

function alertHoursView(from: string, to: string): AlertHours {
  const days: AlertHours['days'] = [];
  for (let dt = from; dt <= to; dt = addDaysIsoLocal(dt, 1)) {
    days.push({ date: dt, minutes: alertMinutes.get(dt) ?? 0 });
  }
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && days[i]!.minutes > THRESHOLD_MIN; i--) streak++;
  return {
    days,
    current_streak_days: streak,
    recommendation: streak >= THRESHOLD_DAYS,
    threshold_minutes: THRESHOLD_MIN,
    threshold_days: THRESHOLD_DAYS,
  };
}

// журнал дій (без прізвищ — «Вчитель #N»)
const auditLog: AuditEntry[] = [
  ['2026-08-25T10:00:00Z', 'Опубліковано розклад', null, { наказ: '97-о', 'діє з': '01.09' }],
  ['2026-09-28T12:10:00Z', 'Погоджено розклад тривог', null, { наказ: '112-о' }],
  ['2026-10-20T08:40:00Z', 'Змінено дані вчителя', 'Вчитель #5', { поле: 'ліміт годин' }],
  [
    '2026-10-27T09:05:00Z',
    'Перевипущено QR-код',
    'Вчитель #7',
    { примітка: 'старий код недійсний' },
  ],
].map(([at, action, target, details], i) => ({
  entry_id: `a${i + 1}`,
  at: at as string,
  actor: 'Укладач розкладу',
  action: action as string,
  target: target as string | null,
  details: details as Record<string, unknown>,
}));

function audit(action: string, target: string | null, details: Record<string, unknown> = {}) {
  auditLog.unshift({
    entry_id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: 'Укладач розкладу',
    action,
    target,
    details,
  });
}

function activeBuild(kind?: MockJob['kind']) {
  return [...jobs.keys()].find((id) => {
    const j = jobs.get(id)!;
    const s = jobView(id)?.state;
    const matches = kind ? j.kind === kind : j.kind !== 'substitution';
    return matches && (s === 'queued' || s === 'running');
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  });

const problem = (status: number, code: string, title: string, extra: object = {}) =>
  json(status, { type: 'about:blank', status, title, code, ...extra });

const notFound = () => problem(404, 'not_found', 'Not Found');

/** Кожна зміна даних закладу: snapshot_version + 1, версії «дані змінилися», запис журналу. */
function dataChanged(action: string, target: string | null, details: Record<string, unknown> = {}) {
  d.profile.snapshot_version++;
  for (const v of versions.values()) if (v.state === 'validated') v.data_changed_since_build = true;
  audit(action, target, details);
}

const holidays: { holiday_from: string | null; holiday_to: string | null } = {
  holiday_from: '2026-12-28',
  holiday_to: '2027-01-10',
};

function jobView(id: string): Job | undefined {
  const j = jobs.get(id);
  if (!j) return undefined;
  const age = Date.now() - j.createdAt;
  if (j.kind === 'substitution') return substitutionJobView(id, j, age);
  const base = {
    job_id: id,
    kind: j.kind,
    snapshot_version: d.profile.snapshot_version,
    created_at: new Date(j.createdAt).toISOString(),
    started_at: age > 1200 ? new Date(j.createdAt + 1200).toISOString() : null,
  };
  if (age < 1200) return { ...base, state: 'queued' };
  if (age < 4000) return { ...base, state: 'running' };
  if (j.kind === 'build_alert') {
    if (!j.timetableId) {
      // результат build_alert заміняє шаблон тривог і повертає план у draft
      if (alertPlan.timetable_id) versions.delete(alertPlan.timetable_id);
      j.timetableId = makeAlertTemplate(j.seed);
      alertPlan.timetable_id = j.timetableId;
      alertPlan.state = 'draft';
      alertPlan.order = null;
    }
    return { ...base, state: 'done', result: { alert_plan: true } };
  }
  if (!j.timetableId) {
    const tt = d.makeTimetable(crypto.randomUUID(), j.seed);
    versions.set(tt.timetable_id, tt);
    j.timetableId = tt.timetable_id;
  }
  return { ...base, state: 'done', result: { timetable_id: j.timetableId } };
}

/** Задача substitution: queued → running → done приблизно за 1,6 с; пропозиції — при першому done. */
function substitutionJobView(id: string, j: MockJob, age: number): Job {
  const base = {
    job_id: id,
    kind: j.kind,
    snapshot_version: d.profile.snapshot_version,
    created_at: new Date(j.createdAt).toISOString(),
    started_at: age > 600 ? new Date(j.createdAt + 600).toISOString() : null,
  };
  if (age < 600) return { ...base, state: 'queued' };
  if (age < 1600) return { ...base, state: 'running' };
  if (!j.computed) {
    j.computed = true;
    const a = absences.find((x) => x.absence_id === j.absenceId)!;
    const tt = versions.get(j.timetableId!)!;
    const date = j.date!;
    const lessons = sub.lessonsToCover(tt, date, a.teacher_id, a.lesson_nos);
    const taken = subs.filter((x) => x.date === date && x.state !== 'rejected');
    const { step, proposals } = sub.propose({
      tt,
      date,
      absentId: a.teacher_id,
      lessons,
      teachers: d.teachers,
      plan: d.plan,
      busy: (t, n) => taken.some((x) => x.new_teacher_id === t && x.lesson_no === n),
    });
    subs.push(
      ...proposals.map((p) => ({
        ...p,
        job_id: id,
        date,
        timetable_id: tt.timetable_id,
        step,
        state: a.cancelled ? ('rejected' as const) : ('proposed' as const),
      })),
    );
  }
  return { ...base, state: 'done', result: { proposals: subs.filter((x) => x.job_id === id) } };
}

/** Навчальні дати періоду (пн–пт, субота — якщо в профілі), без канікул. */
function schoolDates(from: string, to: string): string[] {
  const out: string[] = [];
  const { holiday_from: hf, holiday_to: ht } = holidays;
  for (let x = from; x <= to; x = addDaysIsoLocal(x, 1)) {
    const wd = sub.isoWeekday(x);
    if (hf && ht && x >= hf && x <= ht) continue;
    if (wd <= 5 || (wd === 6 && d.profile.saturday)) out.push(x);
  }
  return out;
}

function createAbsence(body: {
  teacher_id: string;
  date_from: string;
  date_to: string;
  lesson_nos?: number[] | null;
}): Response {
  const today = todayKyiv();
  if (body.date_from < today)
    return problem(422, 'invalid_date', 'Дата в минулому', {
      detail: 'Відсутність вносять з сьогодні або пізніше',
    });
  if (body.date_to < body.date_from)
    return problem(422, 'invalid_date', 'Некоректний період', {
      detail: 'date_to раніше за date_from',
    });
  if (schoolDates(body.date_from, body.date_to).length > MAX_ABSENCE_DAYS)
    return problem(422, 'invalid_date', 'Задовгий період', {
      detail: `Не більше ${MAX_ABSENCE_DAYS} днів`,
    });
  const t = d.teachers.find((x) => x.teacher_id === body.teacher_id && !x.deleted_at);
  if (!t) return problem(422, 'teacher_not_found', 'Вчителя не знайдено');
  const lessonNos = body.lesson_nos?.length ? [...new Set(body.lesson_nos)].sort() : null;
  // timetable #6: вчитель сам погоджений замінник у ці дні й уроки
  const substitute = subs.some(
    (x) =>
      x.state === 'approved' &&
      x.new_teacher_id === t.teacher_id &&
      x.date >= body.date_from &&
      x.date <= body.date_to &&
      (lessonNos === null || lessonNos.includes(x.lesson_no)),
  );
  if (substitute)
    return problem(409, 'teacher_is_substitute', 'Вчитель уже погоджений замінником у ці години');

  const planned = schoolDates(body.date_from, body.date_to).flatMap((date) => {
    const tt = versionAt(date);
    if (!tt) return [];
    return sub.lessonsToCover(tt, date, t.teacher_id, lessonNos).length ? [{ date, tt }] : [];
  });
  if (!planned.length)
    return problem(422, 'no_lessons', 'Немає уроків для заміни', {
      detail: 'У цей період вчитель не має уроків в опублікованому розкладі',
    });

  const a: MockAbsence = {
    absence_id: crypto.randomUUID(),
    teacher_id: t.teacher_id,
    date_from: body.date_from,
    date_to: body.date_to,
    lesson_nos: lessonNos,
    created_at: new Date().toISOString(),
    cancelled: false,
  };
  absences.push(a);
  const job_ids = planned.map(({ date, tt }) => {
    const id = crypto.randomUUID();
    jobs.set(id, {
      createdAt: Date.now(),
      seed: ++seq,
      kind: 'substitution',
      absenceId: a.absence_id,
      date,
      timetableId: tt.timetable_id,
    });
    return id;
  });
  audit('Внесено відсутність', `Вчитель #${t.teacher_no}`, {
    дати: `${formatDate(a.date_from)}–${formatDate(a.date_to)}`,
    задач: job_ids.length,
  });
  return json(202, { absence_id: a.absence_id, job_ids });
}

function absenceView(a: MockAbsence) {
  const own = [...jobs.entries()].filter(([, j]) => j.absenceId === a.absence_id);
  return {
    absence_id: a.absence_id,
    teacher_id: a.teacher_id,
    date_from: a.date_from,
    date_to: a.date_to,
    lesson_nos: a.lesson_nos,
    created_at: a.created_at,
    jobs: own
      .map(([id, j]) => ({ job_id: id, date: j.date!, state: jobView(id)!.state }))
      .sort((x, y) => x.date.localeCompare(y.date)),
  };
}

/** Погоджені заміни з дати, коли почне діяти інша версія, — втрачають силу. */
function lostFrom(from: string, timetableId: string) {
  return subs
    .filter((x) => x.state === 'approved' && x.date >= from && x.timetable_id !== timetableId)
    .map(({ date, class_id, lesson_no }) => ({ date, class_id, lesson_no }));
}

function approveSubstitution(jobId: string, cancel: { class_id: string; lesson_no: number }[]) {
  const j = jobs.get(jobId);
  if (!j || j.kind !== 'substitution')
    return problem(404, 'not_found', 'Задачу заміни не знайдено');
  const view = jobView(jobId)!;
  const own = subs.filter((x) => x.job_id === jobId && x.state === 'proposed');
  if (view.state !== 'done' || !own.length)
    return problem(409, 'job_not_ready', 'Немає пропозицій для погодження');
  const date = j.date!;
  if (date < todayKyiv()) return problem(409, 'date_passed', 'Дата заміни вже минула');
  if (versionAt(date)?.timetable_id !== own[0]!.timetable_id)
    return problem(409, 'stale', 'На дату діє інший розклад', {
      detail: 'Внесіть відсутність знову',
    });
  const approved = subs.filter((x) => x.date === date && x.state === 'approved');
  if (
    own.some((p) => approved.some((x) => x.class_id === p.class_id && x.lesson_no === p.lesson_no))
  )
    return problem(409, 'slot_taken', 'Слот уже має погоджену заміну');
  const clash = own.find(
    (p) =>
      p.new_teacher_id &&
      approved.some((x) => x.new_teacher_id === p.new_teacher_id && x.lesson_no === p.lesson_no),
  );
  if (clash)
    return problem(409, 'conflicts', 'Заміна створює накладку', {
      conflicts: [
        {
          rule: 'teacher_double_booked',
          teacher_id: clash.new_teacher_id!,
          day: sub.isoWeekday(date),
          lesson_no: clash.lesson_no,
        },
      ] satisfies Conflict[],
    });
  for (const p of own) {
    if (
      p.kind === 'self_study' &&
      cancel.some((c) => c.class_id === p.class_id && c.lesson_no === p.lesson_no)
    )
      p.kind = 'cancelled';
    p.state = 'approved';
  }
  const t = d.teachers.find((x) => x.teacher_id === own[0]!.original_teacher_id);
  audit('Погоджено заміну', t ? `Вчитель #${t.teacher_no}` : null, {
    дата: formatDate(date),
    уроків: own.length,
  });
  return json(
    200,
    subs.filter((x) => x.job_id === jobId),
  );
}

function publicTimetable(scope: 'class' | 'teacher'): PublicTimetable {
  const today = todayKyiv();
  const monday = startOfISOWeek(parseISO(today));
  const cls = d.classes[0]!;
  const teacher = d.teachers[0]!;

  const weeks = [0, 1].map((w) => {
    const weekStart = addDays(monday, w * 7);
    const days: PublicDay[] = d.DAYS.map((day) => {
      const date = format(addDays(weekStart, day - 1), 'yyyy-MM-dd');
      // як timetable-service: канікули — format null і holiday: true
      if (holidays.holiday_from && holidays.holiday_to) {
        const { holiday_from, holiday_to } = holidays;
        if (date >= holiday_from && date <= holiday_to)
          return { date, format: null, lessons: [], holiday: true, holiday_from, holiday_to };
      }
      const fmt = current.day_formats.find((f) => f.class_id === cls.class_id && f.day === day)!;
      // погоджені заміни на дату (від версії, що діє): «Заміна» в класу, «скасовано» — без уроку
      const daySubs = subs.filter(
        (x) => x.date === date && x.state === 'approved' && x.timetable_id === current.timetable_id,
      );
      const subAt = (l: { class_id: string; lesson_no: number }) =>
        daySubs.find((x) => x.class_id === l.class_id && x.lesson_no === l.lesson_no);
      const lessons = current.lessons
        .filter((l) => {
          if (l.day !== day) return false;
          const s = subAt(l);
          if (scope === 'class') return l.class_id === cls.class_id && s?.kind !== 'cancelled';
          // вчитель: свої уроки без тих, де його замінили, і уроки, де він новий вчитель
          return s ? s.new_teacher_id === teacher.teacher_id : l.teacher_id === teacher.teacher_id;
        })
        .sort((a, b) => a.lesson_no - b.lesson_no)
        .map((l) => ({
          lesson_no: l.lesson_no,
          start: d.bells[l.lesson_no - 1]?.start ?? '',
          end: d.bells[l.lesson_no - 1]?.end ?? '',
          ...(scope === 'class'
            ? { subject: d.subjects.find((s) => s.subject_id === l.subject_id)!.name }
            : { class_name: d.classes.find((c) => c.class_id === l.class_id)!.name }),
          substitution: !!subAt(l),
        }));
      // у вчителя без уроків цього дня формату немає
      return { date, format: scope === 'teacher' && !lessons.length ? null : fmt.format, lessons };
    });
    return { week: format(weekStart, "RRRR-'W'II"), days };
  });

  const scheduled = [...versions.values()].find(
    (v) => v.state === 'published' && v.effective_from! > today,
  );
  return {
    state: 'published',
    target_label: scope === 'class' ? cls.name : teacher.label,
    published_at: current.published_at,
    upcoming_change: scheduled
      ? `З ${formatDate(scheduled.effective_from!)} діє новий розклад`
      : null,
    weeks,
  };
}

// Демо, як у прототипі: одна погоджена заміна й одна пропозиція на найближчі навчальні дні.
(function seedSubstitutions() {
  const [first, second] = schoolDates(todayKyiv(), addDaysIsoLocal(todayKyiv(), 10));
  const seed = (teacherId: string, date: string | undefined, approve: boolean) => {
    if (!date) return;
    const res = createAbsence({ teacher_id: teacherId, date_from: date, date_to: date });
    if (res.status !== 202) return;
    const a = absences.at(-1)!;
    for (const [id, j] of jobs) {
      if (j.absenceId !== a.absence_id) continue;
      j.createdAt -= 10_000; // уже пораховано
      jobView(id);
      if (approve) approveSubstitution(id, []);
    }
  };
  seed('t5', first, true);
  seed('t6', second, false);
})();

function handle(url: URL, path: string, method: string, init: RequestInit | undefined) {
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const headers = new Headers(init?.headers);
  let m: RegExpMatchArray | null;

  // ── tenant ──
  if (path === '/tenant/schools' && method === 'GET') return json(200, d.schools);
  if (path === '/tenant/schools' && method === 'POST') {
    if (body.login === 'taken' || d.schools.some((s) => s.login === body.login)) {
      return problem(409, 'login_taken', 'Логін зайнятий');
    }
    const s = { school_id: crypto.randomUUID(), ...body, created_at: new Date().toISOString() };
    d.schools.push(s);
    return json(201, {
      school_id: s.school_id,
      login: s.login,
      temporary_password: 'Kx7-pQ2m-Vt9z',
    });
  }

  // ── school ──
  if (path === '/school/school' && method === 'PUT') {
    Object.assign(d.profile, body, { name: d.profile.name });
    d.profile.snapshot_version++;
    for (const v of versions.values())
      if (v.state === 'validated') v.data_changed_since_build = true;
    audit('Змінено профіль закладу', null, body);
    return json(200, d.profile);
  }
  if (path === '/school/school') return json(200, d.profile);
  if (path === '/school/bells' && method === 'PUT') {
    const list = body as typeof d.bells;
    const bad = list.some(
      (b, i) =>
        b.lesson_no !== i + 1 || !(b.start < b.end) || (i > 0 && b.start < list[i - 1]!.end),
    );
    if (bad) return problem(422, 'bells_invalid', 'Дзвінки перетинаються або йдуть не по черзі');
    d.bells.splice(0, d.bells.length, ...list);
    dataChanged('Змінено дзвінки', null, { уроків: list.length });
    return json(200, d.bells);
  }
  if (path === '/school/bells') return json(200, d.bells);
  if (path === '/school/classes' && method === 'POST') {
    const c = { class_id: `c${Date.now()}`, ...body, archived_at: null };
    d.classes.push(c);
    dataChanged(`Додано клас`, c.name);
    return json(201, c);
  }
  if ((m = path.match(/^\/school\/classes\/([^/]+)$/))) {
    const c = d.classes.find((x) => x.class_id === m![1]);
    if (!c) return notFound();
    if (method === 'PUT') {
      Object.assign(c, body);
      dataChanged('Змінено клас', c.name);
      return json(200, c);
    }
    if (method === 'DELETE') {
      c.archived_at = new Date().toISOString();
      dataChanged('Архівовано клас', c.name, { QR: 'відкликано' });
      return new Response(null, { status: 204 });
    }
  }
  if (path === '/school/classes') return json(200, d.classes);

  if (path === '/school/subjects' && method === 'POST') {
    const x = { subject_id: `s${Date.now()}`, ...body, archived_at: null };
    d.subjects.push(x);
    dataChanged('Додано предмет', x.name);
    return json(201, x);
  }
  if ((m = path.match(/^\/school\/subjects\/([^/]+)$/))) {
    const x = d.subjects.find((y) => y.subject_id === m![1]);
    if (!x) return notFound();
    if (method === 'PUT') {
      Object.assign(x, body);
      dataChanged('Змінено предмет', x.name);
      return json(200, x);
    }
    if (method === 'DELETE') {
      if (d.plan.some((r) => r.subject_id === x.subject_id && r.hours_per_week > 0)) {
        return problem(409, 'in_curriculum', 'Предмет є в навчальному плані');
      }
      x.archived_at = new Date().toISOString();
      dataChanged('Архівовано предмет', x.name);
      return new Response(null, { status: 204 });
    }
  }
  if (path === '/school/subjects') return json(200, d.subjects);

  // ── канікули (етап 2): дві дати або обидві null ──
  // ── етап 2: відсутності й заміни ──
  if (path === '/timetable/absences' && method === 'POST') return createAbsence(body);
  if (path === '/timetable/absences' && method === 'GET') {
    const today = todayKyiv();
    return json(
      200,
      absences
        .filter((a) => !a.cancelled && a.date_to >= today)
        .sort((x, y) => x.date_from.localeCompare(y.date_from))
        .map(absenceView),
    );
  }
  if ((m = path.match(/^\/timetable\/absences\/([^/]+)$/)) && method === 'DELETE') {
    const a = absences.find((x) => x.absence_id === m![1] && !x.cancelled);
    if (!a) return notFound();
    a.cancelled = true;
    const ids = new Set(absenceView(a).jobs.map((j) => j.job_id));
    for (const x of subs) if (ids.has(x.job_id)) x.state = 'rejected';
    const t = d.teachers.find((x) => x.teacher_id === a.teacher_id);
    audit('Скасовано відсутність', t ? `Вчитель #${t.teacher_no}` : null);
    return json(200, { cancelled: true });
  }
  if (path === '/timetable/substitutions' && method === 'GET') {
    const date = url.searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problem(422, 'invalid_date', 'Некоректна дата');
    for (const [id, j] of jobs) if (j.kind === 'substitution' && j.date === date) jobView(id);
    return json(
      200,
      subs
        .filter((x) => x.date === date)
        .sort((a, b) => a.class_id.localeCompare(b.class_id) || a.lesson_no - b.lesson_no),
    );
  }
  if (
    (m = path.match(/^\/timetable\/substitutions\/([^/:]+):(approve|reject)$/)) &&
    method === 'POST'
  ) {
    if (m[2] === 'approve') return approveSubstitution(m[1]!, (body?.cancel ?? []) as never);
    const j = jobs.get(m[1]!);
    if (!j || j.kind !== 'substitution')
      return problem(404, 'not_found', 'Задачу заміни не знайдено');
    for (const x of subs) if (x.job_id === m[1] && x.state === 'proposed') x.state = 'rejected';
    audit('Відхилено пропозицію заміни', null, { дата: formatDate(j.date!) });
    return json(
      200,
      subs.filter((x) => x.job_id === m![1]),
    );
  }

  if (path === '/timetable/holidays' && method === 'GET') return json(200, holidays);
  if (path === '/timetable/holidays' && method === 'PUT') {
    const { holiday_from: f, holiday_to: t } = body as typeof holidays;
    if (!f !== !t) return problem(422, 'holidays_pair', 'Вкажіть обидві дати або жодної');
    if (f && t && f > t) return problem(422, 'holidays_order', 'Дата «з» пізніша за «по»');
    Object.assign(holidays, { holiday_from: f, holiday_to: t });
    audit(f ? 'Задано канікули' : 'Прибрано канікули', null, f ? { з: f, по: t } : {});
    return json(200, holidays);
  }
  // ── вчителі: підпис, ліміт, недоступні дні; етап 2 — видалення (ст. 15) і експорт (ст. 8) ──
  if (path === '/school/teachers' && method === 'POST') {
    if (d.teachers.some((t) => !t.deleted_at && t.label === body.label)) {
      return problem(409, 'label_taken', 'Підпис має бути унікальним');
    }
    const no = Math.max(0, ...d.teachers.map((t) => t.teacher_no)) + 1;
    const t = { teacher_id: `t${Date.now()}`, teacher_no: no, ...body, deleted_at: null };
    d.teachers.push(t);
    dataChanged('Додано вчителя', `Вчитель #${no}`, { QR: 'видано' });
    return json(201, t);
  }
  if ((m = path.match(/^\/(school|timetable)\/teachers\/([^/]+)\/export$/))) {
    const t = d.teachers.find((x) => x.teacher_id === m![2] && !x.deleted_at);
    if (!t) return notFound();
    const ref = `Вчитель #${t.teacher_no}`;
    if (m[1] === 'school') {
      audit('Експортовано дані вчителя', ref, { підстава: 'запит особи (ст. 8)' });
      return json(200, {
        teacher_id: t.teacher_id,
        teacher_no: t.teacher_no,
        label: t.label,
        weekly_hours_limit: t.weekly_hours_limit,
        unavailable_days: t.unavailable_days,
        curriculum: d.plan.filter((r) => r.teacher_id === t.teacher_id),
        audit_entries: auditLog.filter((e) => e.target === ref).length,
      });
    }
    return json(200, {
      lessons: [...versions.values()]
        .filter((v) => v.kind === 'main')
        .map((v) => ({
          timetable_id: v.timetable_id,
          state: v.state,
          lessons: v.lessons.filter((l) => l.teacher_id === t.teacher_id).length,
        })),
      absences: absences
        .filter((a) => a.teacher_id === t.teacher_id)
        .map(({ date_from, date_to, lesson_nos, cancelled }) => ({
          date_from,
          date_to,
          lesson_nos,
          cancelled,
        })),
      substitutions: subs
        .filter((x) => x.original_teacher_id === t.teacher_id || x.new_teacher_id === t.teacher_id)
        .map(({ date, lesson_no, kind, state }) => ({ date, lesson_no, kind, state })),
    });
  }
  if ((m = path.match(/^\/school\/teachers\/([^/]+)$/))) {
    const t = d.teachers.find((x) => x.teacher_id === m![1] && !x.deleted_at);
    if (!t) return notFound();
    if (method === 'PUT') {
      if (d.teachers.some((x) => x !== t && !x.deleted_at && x.label === body.label)) {
        return problem(409, 'label_taken', 'Підпис має бути унікальним');
      }
      Object.assign(t, body);
      dataChanged('Змінено дані вчителя', `Вчитель #${t.teacher_no}`);
      return json(200, t);
    }
    if (method === 'DELETE') {
      if (d.plan.some((r) => r.teacher_id === t.teacher_id && r.hours_per_week > 0)) {
        return problem(409, 'in_curriculum', 'Вчителя призначено в навчальному плані');
      }
      const ref = `Вчитель #${t.teacher_no}`;
      t.label = ref;
      t.deleted_at = new Date().toISOString();
      // timetable ставить «Вчитель #N» у копіях підписів у версіях (school.data.changed)
      for (const v of versions.values())
        for (const x of v.teachers) if (x.teacher_id === t.teacher_id) x.label = ref;
      dataChanged('Видалено дані вчителя', ref, { QR: 'відкликано' });
      return new Response(null, { status: 204 });
    }
  }
  if (path === '/school/teachers') return json(200, d.teachers);

  if (path === '/school/curriculum' && method === 'PUT') {
    const rows = body as CurriculumRow[];
    const bad = rows.find(
      (r) =>
        !d.classes.some((c) => c.class_id === r.class_id) ||
        !d.subjects.some((x) => x.subject_id === r.subject_id && !x.archived_at) ||
        !d.teachers.some((t) => t.teacher_id === r.teacher_id && !t.deleted_at) ||
        !(r.hours_per_week > 0),
    );
    if (bad)
      return problem(
        422,
        'unknown_reference',
        'Рядок плану з невідомим класом, предметом чи вчителем',
      );
    d.plan.splice(0, d.plan.length, ...rows);
    dataChanged('Змінено навчальний план', null, { рядків: rows.length });
    return json(200, d.plan);
  }
  if (path === '/school/curriculum') return json(200, d.plan);
  if (path === '/school/audit') {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '9999';
    return json(
      200,
      auditLog
        .filter((e) => e.at.slice(0, 10) >= from && e.at.slice(0, 10) <= to)
        .sort((x, y) => y.at.localeCompare(x.at)),
    );
  }

  // ── розклад тривог ──
  if (path === '/timetable/alert-plan' && method === 'GET') return json(200, alertPlan);
  if (path === '/timetable/alert-plan:build' && method === 'POST') {
    if (alertLocked()) return problem(409, 'alert_plan_active', 'Діє активація розкладу тривог');
    const busy = activeBuild();
    if (busy) return problem(409, 'build_in_progress', 'Побудова вже йде', { job_id: busy });
    const id = crypto.randomUUID();
    jobs.set(id, { createdAt: Date.now(), seed: ++seq, kind: 'build_alert' });
    return json(202, { job_id: id });
  }
  if (path === '/timetable/alert-plan:approve' && method === 'POST') {
    if (activeBuild('build_alert')) return problem(409, 'build_in_progress', 'Побудова вже йде');
    alertPlan.state = 'approved';
    alertPlan.order = body;
    audit('Погоджено розклад тривог', null, { наказ: body.order_no });
    return json(200, alertPlan);
  }
  if (path === '/timetable/alert-plan:activate' && method === 'POST') {
    if (alertPlan.state !== 'approved') return problem(409, 'not_approved', 'План не погоджено');
    if (body.from < todayKyiv()) return problem(422, 'invalid_date', 'Дата раніше сьогодні');
    const overlaps = alertPlan.activations.some((a) => !a.to || a.to > body.from);
    if (overlaps) return problem(409, 'overlap', 'Перетин з іншою активацією');
    alertPlan.activations.push({ activation_id: crypto.randomUUID(), from: body.from, to: null });
    audit('Активовано розклад тривог', null, { з: body.from });
    return json(200, {
      warnings: { lost_substitutions: lostFrom(body.from, alertPlan.timetable_id ?? '') },
    });
  }
  if ((m = path.match(/^\/timetable\/alert-plan\/activations\/([^/:]+):end$/))) {
    const a = alertPlan.activations.find((x) => x.activation_id === m![1]);
    if (!a) return notFound();
    if (body.from <= a.from || body.from < todayKyiv()) {
      return problem(
        422,
        'invalid_date',
        'Дата повернення має бути пізніша за початок і не раніше сьогодні',
      );
    }
    if (a.from > todayKyiv()) alertPlan.activations.splice(alertPlan.activations.indexOf(a), 1);
    else a.to = body.from;
    audit('Повернуто звичайний розклад', null, { з: body.from });
    return json(200, { warnings: { lost_substitutions: [] } });
  }
  if (path === '/timetable/alert-hours' && method === 'GET') {
    const from = url.searchParams.get('from')!;
    const to = url.searchParams.get('to')!;
    return json(200, alertHoursView(from, to));
  }
  if ((m = path.match(/^\/timetable\/alert-hours\/(\d{4}-\d{2}-\d{2})$/)) && method === 'PUT') {
    alertMinutes.set(m[1]!, Number(body.minutes));
    return json(200, { date: m[1], minutes: Number(body.minutes) });
  }

  // ── timetable: задачі й версії ──
  if (path === '/timetable/timetables:build' && method === 'POST') {
    const active = activeBuild();
    if (active) return problem(409, 'build_in_progress', 'Побудова вже йде', { job_id: active });
    const id = crypto.randomUUID();
    jobs.set(id, { createdAt: Date.now(), seed: ++seq, kind: 'build_main' });
    return json(202, { job_id: id });
  }
  if ((m = path.match(/^\/timetable\/jobs\/([^/]+)$/))) {
    const j = jobView(m[1]!);
    return j ? json(200, j) : notFound();
  }
  if (path === '/timetable/timetables') {
    const list = [...versions.values()]
      .filter((v) => v.kind === 'main')
      .map(d.summary)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json(200, list);
  }
  if ((m = path.match(/^\/timetable\/timetables\/([^/:]+):publish$/)) && method === 'POST') {
    const tt = versions.get(m[1]!);
    if (!tt) return notFound();
    const req = body as PublishRequest;
    if (req.order_no.toLowerCase().includes('stale')) {
      return problem(409, 'stale', 'Дані закладу змінилися', {
        conflicts: [
          { rule: 'capacity_exceeded', day: 3, condition: 'passport', value: 171, limit: 160 },
        ] satisfies Conflict[],
      });
    }
    if (req.effective_from < minEffectiveFrom()) {
      return problem(422, 'effective_from_too_early', 'Занадто рання дата', {
        detail: 'Дата початку дії — навчальний день не раніше ніж через 7 днів.',
      });
    }
    // нова публікація заміняє заплановану: та повертається у validated
    for (const v of versions.values()) {
      if (v.state === 'published' && v.effective_from! > todayKyiv()) {
        v.state = 'validated';
        v.effective_from = null;
        v.published_at = null;
      }
    }
    const lost = lostFrom(req.effective_from, tt.timetable_id);
    tt.state = 'published';
    tt.effective_from = req.effective_from;
    tt.published_at = new Date().toISOString();
    audit('Опубліковано розклад', null, {
      наказ: req.order_no,
      'діє з': formatDate(req.effective_from),
    });
    return json(200, { timetable: d.summary(tt), warnings: { lost_substitutions: lost } });
  }
  // ── етап 2: ручна правка й копія ──
  if (
    (m = path.match(/^\/timetable\/timetables\/([^/:]+)\/lessons\/([^/]+)\/(\d)\/(\d+)$/)) &&
    method === 'PATCH'
  ) {
    const tt = versions.get(m[1]!);
    if (!tt) return notFound();
    if (tt.state === 'published') {
      return problem(409, 'published_readonly', 'Опубліковану версію не правлять');
    }
    const [classId, day, no] = [m[2]!, Number(m[3]) as Day, Number(m[4])];
    const to = body as { day: Day; lesson_no: number };
    const a = tt.lessons.find((l) => l.class_id === classId && l.day === day && l.lesson_no === no);
    if (!a) return notFound();
    const b = tt.lessons.find(
      (l) => l.class_id === classId && l.day === to.day && l.lesson_no === to.lesson_no,
    );
    // пробна зміна на копії уроків: зайнятий слот класу — обмін
    const moved = tt.lessons.map((l) =>
      l === a
        ? { ...l, day: to.day, lesson_no: to.lesson_no }
        : l === b
          ? { ...l, day, lesson_no: no }
          : l,
    );
    const touched = (l: { teacher_id: string }) =>
      l.teacher_id === a.teacher_id || (b && l.teacher_id === b.teacher_id);
    const conflicts = d
      .validateTimetable({ ...tt, lessons: moved })
      .filter((c) => !c.teacher_id || touched({ teacher_id: c.teacher_id }));
    if (conflicts.length) {
      return problem(409, 'conflicts', 'Зміна порушує правила розкладу', { conflicts });
    }
    tt.lessons = moved;
    return json(200, tt);
  }
  if ((m = path.match(/^\/timetable\/timetables\/([^/:]+):copy$/)) && method === 'POST') {
    const src = versions.get(m[1]!);
    if (!src || src.kind !== 'main') return notFound();
    const copy: TimetableDetail = {
      ...structuredClone(src),
      timetable_id: crypto.randomUUID(),
      state: 'validated',
      effective_from: null,
      published_at: null,
      created_at: new Date().toISOString(),
    };
    delete copy.order;
    versions.set(copy.timetable_id, copy);
    return json(201, copy);
  }
  if ((m = path.match(/^\/timetable\/timetables\/([^/:]+)\/load$/))) {
    const tt = versions.get(m[1]!);
    return tt ? json(200, d.makeLoad(tt)) : notFound();
  }
  if ((m = path.match(/^\/timetable\/timetables\/([^/:]+)$/))) {
    const tt = versions.get(m[1]!);
    return tt ? json(200, tt) : notFound();
  }

  // ── QR ──
  if (path === '/timetable/access-tokens') {
    const type = url.searchParams.get('type');
    return json(
      200,
      d.tokens().filter((t) => !type || t.scope === type),
    );
  }
  if ((m = path.match(/^\/timetable\/access-tokens\/([^/:]+):rotate$/)) && method === 'POST') {
    const t = d.rotate(m[1]!);
    if (t) audit('Перевипущено QR-код', t.target_label, { примітка: 'старий код недійсний' });
    return t ? json(200, t) : notFound();
  }

  // ── публічні сторінки ──
  if (path === '/public/timetable') {
    const token = headers.get('X-Access-Token');
    if (token === 'demo-class') return json(200, publicTimetable('class'));
    if (token === 'demo-teacher') return json(200, publicTimetable('teacher'));
    return json(404, { status: 404, title: 'Посилання недійсне. Зверніться до закладу.' });
  }

  return problem(404, 'not_found', `Мок: немає обробника для ${method} ${path}`);
}

/**
 * Підміняє fetch для /api/v1/*. Стан даних — у модулях src/mocks (новий після перезавантаження,
 * у тестах — після vi.resetModules()). latency імітує мережу; у тестах — 0.
 */
export function installMockServer({ latency = 250, quiet = false } = {}) {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin,
    );
    if (!url.pathname.startsWith(config.apiBase + '/')) return realFetch(input, init);
    const path = url.pathname.slice(config.apiBase.length);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (latency) await new Promise((r) => setTimeout(r, latency));
    return handle(url, path, method, init);
  };
  if (!quiet) console.info('[lad] мок-режим: /api/v1/* обслуговує src/mocks, Keycloak вимкнено');
  return () => {
    globalThis.fetch = realFetch;
  };
}
