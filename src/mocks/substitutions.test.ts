import type { CurriculumRow, Day, Lesson, Teacher, TimetableDetail } from '@/api/types';
import { lessonsToCover, propose } from './substitutions';

// пн 16.11.2026; клас c1 очно, c2 дистанційно
const MON = '2026-11-16';
const L = (class_id: string, lesson_no: number, teacher_id: string, subject_id = 's1'): Lesson => ({
  class_id,
  day: 1 as Day,
  lesson_no,
  teacher_id,
  subject_id,
});
const teacher = (id: string, extra: Partial<Teacher> = {}): Teacher => ({
  teacher_id: id,
  teacher_no: Number(id.slice(1)),
  label: id,
  weekly_hours_limit: 24,
  unavailable_days: [],
  ...extra,
});

function tt(lessons: Lesson[]): TimetableDetail {
  return {
    timetable_id: 'v1',
    kind: 'main',
    model: '1.1',
    state: 'published',
    effective_from: '2026-09-01',
    published_at: null,
    data_changed_since_build: false,
    created_at: '2026-09-01T00:00:00Z',
    snapshot_version: 1,
    classes: [],
    teachers: [],
    lessons,
    day_formats: [
      { class_id: 'c1', day: 1, format: 'in_person' },
      { class_id: 'c2', day: 1, format: 'remote' },
    ],
  };
}
const plan = (teacher_id: string, subject_id: string): CurriculumRow => ({
  class_id: 'c1',
  subject_id,
  teacher_id,
  hours_per_week: 1,
});

function run(lessons: Lesson[], teachers: Teacher[], rows: CurriculumRow[] = []) {
  const t = tt(lessons);
  return propose({
    tt: t,
    date: MON,
    absentId: 't1',
    lessons: lessonsToCover(t, MON, 't1', null),
    teachers,
    plan: rows,
    busy: () => false,
  });
}

describe('мок-solver замін (крок 1)', () => {
  it('бере вчителя цього предмета, інакше — «не за фахом»', () => {
    const r = run(
      [L('c1', 1, 't1')],
      [teacher('t1'), teacher('t2'), teacher('t3')],
      [plan('t3', 's1')],
    );
    expect(r.proposals[0]).toMatchObject({
      kind: 'teacher',
      new_teacher_id: 't3',
      off_profile: false,
    });
    expect(r.step).toBe(1);

    const r2 = run([L('c1', 1, 't1')], [teacher('t1'), teacher('t2')]);
    expect(r2.proposals[0]).toMatchObject({ new_teacher_id: 't2', off_profile: true });
  });

  it('не бере зайнятого, недоступного, з вичерпаним лімітом чи з іншим форматом дня', () => {
    const r = run(
      [L('c1', 1, 't1'), L('c2', 1, 't2'), L('c2', 2, 't5')],
      [
        teacher('t1'),
        teacher('t2'), // уже веде 1 урок
        teacher('t3', { unavailable_days: [1] }),
        teacher('t4', { weekly_hours_limit: 0 }),
        teacher('t5'), // цього дня лише дистанційно, а c1 — очно
      ],
    );
    expect(r.proposals[0]).toMatchObject({ kind: 'self_study', new_teacher_id: null });
    expect(r.step).toBe(3);
  });

  it('один кандидат не бере два уроки одночасно; «увесь день» чи лише вказані уроки', () => {
    const lessons = [L('c1', 1, 't1'), L('c1', 2, 't1')];
    const r = run(lessons, [teacher('t1'), teacher('t2')]);
    expect(r.proposals.map((p) => p.new_teacher_id)).toEqual(['t2', 't2']);
    expect(lessonsToCover(tt(lessons), MON, 't1', [2]).map((l) => l.lesson_no)).toEqual([2]);
    expect(lessonsToCover(tt(lessons), '2026-11-17', 't1', null)).toEqual([]);
  });
});
