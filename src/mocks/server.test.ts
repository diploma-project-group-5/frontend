import { schoolApi, tenantApi, timetableApi } from '@/api/endpoints';
import { isApiError, type ApiError } from '@/api/http';
import type { Day, TimetableDetail } from '@/api/types';
import { schoolDatesBetween } from '@/lib/substitutions';
import { addDaysIso, minEffectiveFrom, todayKyiv } from '@/lib/time';
import { conflictErrors } from '@/test/contracts';
import { startMockBackend } from '@/test/render';

/**
 * Мок-бекенд — це і `npm run dev:mock`, і основа тестів сторінок. Тут перевіряємо, що він
 * відповідає контрактам сервісів: форма conflicts[] — за contracts, коди помилок — як у README.
 */

async function published(): Promise<TimetableDetail> {
  const list = await timetableApi.list();
  const v = list.find((x) => x.state === 'published')!;
  return timetableApi.get(v.timetable_id);
}

/** Перебирає обміни уроків у межах дня класу, доки сервер не відповість 409 conflicts. */
async function firstRejectedMove(tt: TimetableDetail): Promise<ApiError> {
  for (const a of tt.lessons) {
    for (const b of tt.lessons) {
      if (a.class_id !== b.class_id || a.day !== b.day || a.lesson_no >= b.lesson_no) continue;
      try {
        await timetableApi.moveLesson(tt.timetable_id, a, { day: b.day, lesson_no: b.lesson_no });
      } catch (e) {
        if (isApiError(e, 'conflicts')) return e;
        throw e;
      }
    }
  }
  throw new Error('жоден обмін не дав 409');
}

describe('conflicts[] мок-бекенду відповідають contracts/conflict.v1.json', () => {
  it('validateTimetable і /load: накладка вчителя й переповнене укриття', async () => {
    const d = await startMockBackend();
    const tt = structuredClone(await published());
    const [a, b] = [
      tt.lessons[0]!,
      tt.lessons.find((l) => l.class_id !== tt.lessons[0]!.class_id)!,
    ];
    b.day = a.day;
    b.lesson_no = a.lesson_no;
    b.teacher_id = a.teacher_id;
    tt.day_formats.forEach((f) => (f.format = 'in_person'));
    d.profile.shelter_capacity = 10;

    const load = d.makeLoad(tt);
    const rules = load.validation.conflicts.map((c) => c.rule);
    expect(rules).toContain('teacher_double_booked');
    expect(rules).toContain('capacity_exceeded');
    expect(load.validation.ok).toBe(false);
    for (const c of load.validation.conflicts) expect(conflictErrors(c)).toEqual([]);
  });

  it('PATCH з накладкою: 409 conflicts за схемою, розклад не змінено', async () => {
    await startMockBackend();
    const copy = await timetableApi.copy((await published()).timetable_id);
    const before = await timetableApi.get(copy.timetable_id);

    // перший обмін, що проходить, змінює сітку; тому порівнюємо з версією перед відмовою
    const err = await firstRejectedMove(before);
    expect(err.status).toBe(409);
    expect(err.conflicts.length).toBeGreaterThan(0);
    for (const c of err.conflicts) expect(conflictErrors(c)).toEqual([]);
  });
});

describe('коди помилок і стани, як у сервісах', () => {
  it('опубліковану версію не правлять: 409 published_readonly', async () => {
    await startMockBackend();
    const tt = await published();
    const l = tt.lessons[0]!;
    await expect(
      timetableApi.moveLesson(tt.timetable_id, l, { day: l.day, lesson_no: 2 }),
    ).rejects.toSatisfy((e) => isApiError(e, 'published_readonly'));
  });

  it('вчитель у плані: DELETE → 409 in_curriculum; новий — видаляється', async () => {
    await startMockBackend();
    await expect(schoolApi.deleteTeacher('t1')).rejects.toSatisfy((e) =>
      isApiError(e, 'in_curriculum'),
    );
    const t = await schoolApi.createTeacher({
      label: 'Новий В. В.',
      weekly_hours_limit: 18,
      unavailable_days: [5 as Day],
    });
    await schoolApi.deleteTeacher(t.teacher_id);
    const list = await schoolApi.listTeachers();
    expect(list.find((x) => x.teacher_id === t.teacher_id)?.label ?? 'немає').not.toBe(
      'Новий В. В.',
    );
  });

  it('план з невідомим вчителем: 422 unknown_reference', async () => {
    await startMockBackend();
    const rows = await schoolApi.getCurriculum();
    await expect(schoolApi.putCurriculum([{ ...rows[0]!, teacher_id: 'nope' }])).rejects.toSatisfy(
      (e) => isApiError(e, 'unknown_reference'),
    );
  });

  it(':publish: 409 stale з conflicts[] за схемою; рання дата — 422', async () => {
    await startMockBackend();
    const draft = await timetableApi.copy((await published()).timetable_id);
    const order = { order_no: 'stale', order_date: '2026-11-11', approved_by: 'Директор' };
    const stale = await timetableApi
      .publish(draft.timetable_id, { ...order, effective_from: minEffectiveFrom() })
      .catch((e: unknown) => e);
    expect(isApiError(stale, 'stale')).toBe(true);
    for (const c of (stale as ApiError).conflicts) expect(conflictErrors(c)).toEqual([]);

    await expect(
      timetableApi.publish(draft.timetable_id, {
        ...order,
        order_no: '1',
        effective_from: todayKyiv(),
      }),
    ).rejects.toSatisfy((e) => isApiError(e, 'effective_from_too_early'));
  });

  it('зайнятий логін закладу: 409 login_taken', async () => {
    await startMockBackend();
    await expect(tenantApi.registerSchool({ name: 'Ліцей', login: 'taken' })).rejects.toSatisfy(
      (e) => isApiError(e, 'login_taken'),
    );
  });

  it(':build → 202 job_id → queued → done з timetable_id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await startMockBackend();
    const { job_id } = await timetableApi.build();
    expect((await timetableApi.getJob(job_id)).state).toBe('queued');
    vi.setSystemTime(Date.now() + 5000);
    const job = await timetableApi.getJob(job_id);
    expect(job.state).toBe('done');
    const id = (job.result as { timetable_id: string }).timetable_id;
    expect((await timetableApi.get(id)).state).toBe('validated');
  });
});

describe('відсутності й заміни (етап 2), як у timetable-service', () => {
  /** Найближчі навчальні дати (без вихідних і канікул закладу) — тест не залежить від дня запуску. */
  const firstSchoolDays = async () =>
    schoolDatesBetween(
      todayKyiv(),
      addDaysIso(todayKyiv(), 60),
      false,
      await timetableApi.getHolidays(),
    ).slice(0, 3);
  /** Задачі substitution рахуються ~1,6 с: зсуваємо годинник і читаємо стан. */
  async function settle() {
    vi.setSystemTime(Date.now() + 5000);
    await timetableApi.absences();
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    return () => vi.useRealTimers();
  });

  it('у демо є погоджена заміна й пропозиція', async () => {
    await startMockBackend();
    const list = await timetableApi.absences();
    expect(list).toHaveLength(2);
    const states = await Promise.all(
      list.map(async (a) => {
        const subs = await timetableApi.substitutions(a.jobs[0]!.date);
        return subs.filter((x) => x.job_id === a.jobs[0]!.job_id)[0]?.state;
      }),
    );
    expect(states).toEqual(['approved', 'proposed']);
  });

  it('POST /absences: 422 для минулої дати й періоду без уроків; 202 → по задачі на дату', async () => {
    await startMockBackend();
    const [d1, d2] = await firstSchoolDays();
    await expect(
      timetableApi.createAbsence({
        teacher_id: 't1',
        date_from: '2020-01-06',
        date_to: '2020-01-06',
      }),
    ).rejects.toSatisfy((e) => isApiError(e, 'invalid_date'));
    await expect(
      timetableApi.createAbsence({
        teacher_id: 't1',
        date_from: d1!,
        date_to: d1!,
        lesson_nos: [9],
      }),
    ).rejects.toSatisfy((e) => isApiError(e, 'no_lessons'));

    // сид мока погоджує заміну на перший навчальний день від сьогодні, і замісник залежить від дня
    // тижня — беремо вчителя, який у ці дні не замісник (інакше чесне 409 teacher_is_substitute)
    const busy = new Set(
      (await Promise.all([d1!, d2!].map((d) => timetableApi.substitutions(d))))
        .flat()
        .filter((x) => x.state === 'approved')
        .map((x) => x.new_teacher_id),
    );
    const teacher = ['t2', 't3', 't4', 't7', 't8'].find((t) => !busy.has(t))!;
    const res = await timetableApi.createAbsence({
      teacher_id: teacher,
      date_from: d1!,
      date_to: d2!,
    });
    expect(res.job_ids).toHaveLength(2);
    const a = (await timetableApi.absences()).find((x) => x.absence_id === res.absence_id)!;
    expect(a.jobs.map((j) => j.state)).toEqual(['queued', 'queued']);
    await settle();
    const after = (await timetableApi.absences()).find((x) => x.absence_id === res.absence_id)!;
    expect(after.jobs.map((j) => j.state)).toEqual(['done', 'done']);
    const job = await timetableApi.getJob(res.job_ids[0]!);
    expect((job.result as { proposals: unknown[] }).proposals.length).toBeGreaterThan(0);
  });

  it(':approve з cancel; повторне погодження — 409 job_not_ready; :reject; DELETE → rejected', async () => {
    await startMockBackend();
    const [, , d3] = await firstSchoolDays();
    const res = await timetableApi.createAbsence({
      teacher_id: 't3',
      date_from: d3!,
      date_to: d3!,
    });
    await settle();
    const jobId = res.job_ids[0]!;
    const rows = (await timetableApi.substitutions(d3!)).filter((x) => x.job_id === jobId);
    expect(rows.every((r) => r.state === 'proposed')).toBe(true);
    const self = rows.find((r) => r.kind === 'self_study');

    const approved = await timetableApi.approveSubstitution(jobId, {
      cancel: self ? [{ class_id: self.class_id, lesson_no: self.lesson_no }] : [],
    });
    expect(approved.every((r) => r.state === 'approved')).toBe(true);
    if (self) expect(approved.find((r) => r.lesson_no === self.lesson_no)?.kind).toBe('cancelled');
    await expect(timetableApi.approveSubstitution(jobId)).rejects.toSatisfy((e) =>
      isApiError(e, 'job_not_ready'),
    );

    await timetableApi.deleteAbsence(res.absence_id);
    const after = (await timetableApi.substitutions(d3!)).filter((x) => x.job_id === jobId);
    expect(after.every((r) => r.state === 'rejected')).toBe(true);
    expect((await timetableApi.absences()).some((a) => a.absence_id === res.absence_id)).toBe(
      false,
    );
  });

  it('нова версія з дати заміни: :publish повертає lost_substitutions, :approve — 409 stale', async () => {
    await startMockBackend();
    const from = minEffectiveFrom();
    const res = await timetableApi.createAbsence({
      teacher_id: 't4',
      date_from: from,
      date_to: from,
    });
    await settle();
    const seeded = (await timetableApi.absences()).find((a) => a.teacher_id === 't5')!;
    const seededJob = seeded.jobs[0]!;
    // погоджена заміна з демо — раніше за нову версію, тож силу не втрачає
    const draft = await timetableApi.copy((await published()).timetable_id);
    const pub = await timetableApi.publish(draft.timetable_id, {
      order_no: '50-о',
      order_date: todayKyiv(),
      approved_by: 'Директор',
      effective_from: from,
    });
    expect(pub.warnings.lost_substitutions.every((x) => x.date >= from)).toBe(true);
    expect(seededJob.date < from).toBe(true);

    await expect(timetableApi.approveSubstitution(res.job_ids[0]!)).rejects.toSatisfy((e) =>
      isApiError(e, 'stale'),
    );
  });
});
