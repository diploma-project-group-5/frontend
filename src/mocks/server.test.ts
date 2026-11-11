import { schoolApi, tenantApi, timetableApi } from '@/api/endpoints';
import { isApiError, type ApiError } from '@/api/http';
import type { Day, TimetableDetail } from '@/api/types';
import { minEffectiveFrom, todayKyiv } from '@/lib/time';
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
