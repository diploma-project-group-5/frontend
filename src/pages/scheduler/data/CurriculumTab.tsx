import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useBlocker } from 'react-router';
import { schoolApi } from '@/api/endpoints';
import type { CurriculumRow } from '@/api/types';
import { Button, Chip, Modal, ModalActions, Notice, ProblemNotice, Spinner } from '@/ui';
import s from './DataPages.module.css';

type Cell = { hours: number; teacher_id: string | null };
const key = (classId: string, subjectId: string) => `${classId}|${subjectId}`;
const MAX_HOURS = 12;

function toCells(rows: CurriculumRow[]) {
  return new Map<string, Cell>(
    rows.map((r) => [
      key(r.class_id, r.subject_id),
      { hours: r.hours_per_week, teacher_id: r.teacher_id },
    ]),
  );
}

/**
 * Навчальний план (прототип): ліворуч класи з «уроків / максимум», праворуч предмети класу —
 * години на тиждень і вчитель. API: GET/PUT /curriculum (увесь план одним запитом).
 * Зміни збираються в чернетку й зберігаються кнопкою: так один PUT не перетирає інший.
 * Форма попереджає про перевищення ліміту вчителя (розділ 09) і про уроки без вчителя.
 */
export function CurriculumTab() {
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });

  const [draft, setDraft] = useState<Map<string, Cell> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (rows: CurriculumRow[]) => schoolApi.putCurriculum(rows),
    onSuccess: (rows) => {
      qc.setQueryData(['curriculum'], rows);
      void qc.invalidateQueries({ queryKey: ['timetables'] }); // «дані змінилися після побудови»
      setDraft(null);
    },
  });

  const dirty = draft !== null;
  const blocker = useBlocker(dirty);

  const err = plan.error ?? classes.error ?? subjects.error ?? teachers.error;
  if (err) return <ProblemNotice error={err} />;
  if (!plan.data || !classes.data || !subjects.data || !teachers.data) return <Spinner />;

  const cells = draft ?? toCells(plan.data);
  const cell = (c: string, x: string): Cell =>
    cells.get(key(c, x)) ?? { hours: 0, teacher_id: null };
  const setCell = (c: string, x: string, v: Cell) => {
    save.reset();
    setError(null);
    setDraft(new Map(cells).set(key(c, x), v));
  };

  const activeClasses = classes.data.filter((c) => !c.archived_at);
  const activeSubjects = subjects.data.filter((x) => !x.archived_at);
  const activeTeachers = teachers.data.filter((t) => !t.deleted_at);
  const days = profile.data?.saturday ? 6 : 5;
  const cap = days * (profile.data?.lessons_per_day ?? 0);

  const teacherHours = new Map<string, number>();
  const teachesSubject = new Set<string>();
  for (const [k, v] of cells) {
    if (!v.teacher_id || v.hours <= 0) continue;
    teacherHours.set(v.teacher_id, (teacherHours.get(v.teacher_id) ?? 0) + v.hours);
    teachesSubject.add(`${v.teacher_id}|${k.split('|')[1]}`);
  }
  const classSum = (c: string) =>
    activeSubjects.reduce((n, x) => n + cell(c, x.subject_id).hours, 0);
  const missing = (c: string) =>
    activeSubjects.some((x) => {
      const v = cell(c, x.subject_id);
      return v.hours > 0 && !v.teacher_id;
    });
  const overLimit = activeTeachers.filter(
    (t) => (teacherHours.get(t.teacher_id) ?? 0) > t.weekly_hours_limit,
  );

  const current = activeClasses.find((c) => c.class_id === picked) ?? activeClasses[0] ?? null;

  const submit = () => {
    const rows: CurriculumRow[] = [];
    const unassigned: string[] = [];
    for (const [k, v] of cells) {
      if (v.hours <= 0) continue;
      const [class_id, subject_id] = k.split('|') as [string, string];
      if (!v.teacher_id) {
        const cls = classes.data.find((c) => c.class_id === class_id);
        const sub = subjects.data.find((x) => x.subject_id === subject_id);
        unassigned.push(`${cls?.name ?? class_id} · ${sub?.name ?? subject_id}`);
        continue;
      }
      rows.push({ class_id, subject_id, teacher_id: v.teacher_id, hours_per_week: v.hours });
    }
    if (unassigned.length) return setError(`Призначте вчителя: ${unassigned.join(', ')}.`);
    setError(null);
    save.mutate(rows);
  };
  const discard = () => {
    setDraft(null);
    setError(null);
  };

  return (
    <>
      {overLimit.length > 0 && (
        <Notice tone="warn">
          {overLimit.map((t) => (
            <p key={t.teacher_id}>
              {t.label}: {teacherHours.get(t.teacher_id)} год при ліміті {t.weekly_hours_limit}
            </p>
          ))}
        </Notice>
      )}

      {(dirty || save.isSuccess) && (
        <div className={`${s.saveBar} ${dirty ? s.saveBarDirty : ''}`} role="status">
          {dirty ? (
            <>
              <span>
                <b>План змінено.</b> Збережіть, щоб зміни потрапили в наступну побудову.
              </span>
              <span className={s.saveActs}>
                <Button size="sm" onClick={discard} disabled={save.isPending}>
                  Скасувати зміни
                </Button>
                <Button size="sm" variant="primary" onClick={submit} disabled={save.isPending}>
                  Зберегти план
                </Button>
              </span>
            </>
          ) : (
            <>
              <span>
                <b>План збережено.</b> Чинний розклад зміниться лише після побудови й публікації.
              </span>
              <Link to="/scheduler/timetables">Побудувати чернетку →</Link>
            </>
          )}
        </div>
      )}
      {error && (
        <p className={`${s.err} ${s.errGap}`} role="alert">
          {error}
        </p>
      )}
      {save.error && <ProblemNotice error={save.error} />}

      {!current ? (
        <p className="muted">Спершу додайте класи у вкладці «Класи».</p>
      ) : (
        <div className={s.md}>
          <nav className={s.mlist} aria-label="Класи">
            {activeClasses.map((c) => {
              const n = classSum(c.class_id);
              return (
                <button
                  key={c.class_id}
                  type="button"
                  aria-current={c.class_id === current.class_id}
                  onClick={() => setPicked(c.class_id)}
                >
                  <span>{c.name}</span>
                  <Chip tone={(cap && n > cap) || missing(c.class_id) ? 'bad' : undefined}>
                    {n}/{cap || '—'}
                  </Chip>
                </button>
              );
            })}
          </nav>

          <div className={s.mdBody}>
            <div className={s.mdHead}>
              <b>
                {current.name} · {current.students} учнів
              </b>
              <Chip tone={cap && classSum(current.class_id) > cap ? 'bad' : 'acc'}>
                {classSum(current.class_id)} / {cap || '—'} уроків
              </Chip>
            </div>
            <div className={s.tw}>
              <table>
                <thead>
                  <tr>
                    <th>Предмет</th>
                    <th>Годин на тиждень</th>
                    <th>Вчитель</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSubjects.map((x) => {
                    const v = cell(current.class_id, x.subject_id);
                    const set = (patch: Partial<Cell>) =>
                      setCell(current.class_id, x.subject_id, { ...v, ...patch });
                    // спершу ті, хто вже веде цей предмет; вчителі не мають списку предметів в API
                    const options = [...activeTeachers].sort(
                      (a, b) =>
                        Number(teachesSubject.has(`${b.teacher_id}|${x.subject_id}`)) -
                          Number(teachesSubject.has(`${a.teacher_id}|${x.subject_id}`)) ||
                        a.label.localeCompare(b.label, 'uk'),
                    );
                    return (
                      <tr key={x.subject_id} className={v.hours ? undefined : s.dim}>
                        <td>
                          <b>{x.name}</b>
                        </td>
                        <td>
                          <span className={s.stepper}>
                            <button
                              type="button"
                              aria-label={`Менше годин: ${x.name}`}
                              disabled={v.hours <= 0}
                              onClick={() => set({ hours: v.hours - 1 })}
                            >
                              −
                            </button>
                            <span className={s.num}>{v.hours}</span>
                            <button
                              type="button"
                              aria-label={`Більше годин: ${x.name}`}
                              disabled={v.hours >= MAX_HOURS}
                              onClick={() => set({ hours: v.hours + 1 })}
                            >
                              +
                            </button>
                          </span>
                        </td>
                        <td>
                          <select
                            className={`${s.tsel} ${v.hours && !v.teacher_id ? s.miss : ''}`}
                            aria-label={`Вчитель для ${x.name}`}
                            value={v.teacher_id ?? ''}
                            onChange={(e) => set({ teacher_id: e.target.value || null })}
                          >
                            <option value="">— не призначено</option>
                            {options.map((t) => (
                              <option key={t.teacher_id} value={t.teacher_id}>
                                {t.label} · вільно{' '}
                                {t.weekly_hours_limit - (teacherHours.get(t.teacher_id) ?? 0)} год
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Зміни плану не збережено"
      >
        <p>Якщо піти з вкладки, зміни годин і вчителів буде втрачено.</p>
        <ModalActions>
          <Button onClick={() => blocker.reset?.()}>Залишитися</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Не зберігати
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
