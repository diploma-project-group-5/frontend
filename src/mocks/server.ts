import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import { config } from '@/config';
import type { Job, PublicDay, PublicTimetable, PublishRequest, TimetableDetail } from '@/api/types';
import { formatDate, minEffectiveFrom, todayKyiv } from '@/lib/time';
import * as d from './data';

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
const jobs = new Map<string, { createdAt: number; seed: number; timetableId?: string }>();
let seq = 0;

// чинна версія з минулою датою, як у сіді демо
const current = d.makeTimetable('7f3a1c20-0000-4000-8000-000000000001', 0);
current.state = 'published';
current.effective_from = '2026-09-01';
current.published_at = '2026-08-25T10:00:00Z';
current.created_at = '2026-08-20T10:00:00Z';
versions.set(current.timetable_id, current);

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

function jobView(id: string): Job | undefined {
  const j = jobs.get(id);
  if (!j) return undefined;
  const age = Date.now() - j.createdAt;
  const base = {
    job_id: id,
    kind: 'build_main' as const,
    snapshot_version: d.profile.snapshot_version,
    created_at: new Date(j.createdAt).toISOString(),
    started_at: age > 1200 ? new Date(j.createdAt + 1200).toISOString() : null,
  };
  if (age < 1200) return { ...base, state: 'queued' };
  if (age < 4000) return { ...base, state: 'running' };
  if (!j.timetableId) {
    const tt = d.makeTimetable(crypto.randomUUID(), j.seed);
    versions.set(tt.timetable_id, tt);
    j.timetableId = tt.timetable_id;
  }
  return { ...base, state: 'done', result: { timetable_id: j.timetableId } };
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
      const fmt = current.day_formats.find((f) => f.class_id === cls.class_id && f.day === day)!;
      const lessons = current.lessons
        .filter(
          (l) =>
            l.day === day &&
            (scope === 'class' ? l.class_id === cls.class_id : l.teacher_id === teacher.teacher_id),
        )
        .sort((a, b) => a.lesson_no - b.lesson_no)
        .map((l) => ({
          lesson_no: l.lesson_no,
          start: d.bells[l.lesson_no - 1]!.start,
          end: d.bells[l.lesson_no - 1]!.end,
          ...(scope === 'class'
            ? { subject: d.subjects.find((s) => s.subject_id === l.subject_id)!.name }
            : { class_name: d.classes.find((c) => c.class_id === l.class_id)!.name }),
          substitution: w === 0 && day === 3 && l.lesson_no === 2,
        }));
      return { date, format: fmt.format, lessons };
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
  if (path === '/school/school') return json(200, d.profile);
  if (path === '/school/bells') return json(200, d.bells);
  if (path === '/school/classes') return json(200, d.classes);
  if (path === '/school/subjects') return json(200, d.subjects);
  if (path === '/school/teachers') return json(200, d.teachers);

  // ── timetable: задачі й версії ──
  if (path === '/timetable/timetables:build' && method === 'POST') {
    const active = [...jobs.keys()].find((id) => {
      const s = jobView(id)?.state;
      return s === 'queued' || s === 'running';
    });
    if (active) return problem(409, 'build_in_progress', 'Побудова вже йде', { job_id: active });
    const id = crypto.randomUUID();
    jobs.set(id, { createdAt: Date.now(), seed: ++seq });
    return json(202, { job_id: id });
  }
  if ((m = path.match(/^\/timetable\/jobs\/([^/]+)$/))) {
    const j = jobView(m[1]!);
    return j ? json(200, j) : notFound();
  }
  if (path === '/timetable/timetables') {
    const list = [...versions.values()]
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
          {
            rule: 'capacity',
            day: 3,
            limit: 'passport',
            message: 'Ср: у будівлі 171 особа при паспортній місткості 160',
          },
        ],
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
    tt.state = 'published';
    tt.effective_from = req.effective_from;
    tt.published_at = new Date().toISOString();
    return json(200, { timetable: d.summary(tt), warnings: { lost_substitutions: [] } });
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

export function installMockServer() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.origin,
    );
    if (!url.pathname.startsWith(config.apiBase + '/')) return realFetch(input, init);
    const path = url.pathname.slice(config.apiBase.length);
    const method = (init?.method ?? 'GET').toUpperCase();
    await new Promise((r) => setTimeout(r, 250)); // імітація мережі
    return handle(url, path, method, init);
  };
  console.info('[lad] мок-режим: /api/v1/* обслуговує src/mocks, Keycloak вимкнено');
}
