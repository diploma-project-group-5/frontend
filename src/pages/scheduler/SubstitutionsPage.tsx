import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router';
import { schoolApi, timetableApi } from '@/api/endpoints';
import { isApiError, type ApiError } from '@/api/http';
import type { Absence, AbsenceAccepted, Bell, Lesson, Substitution } from '@/api/types';
import { isTerminal, JOB_STATE_LABEL, jobErrorText } from '@/api/useJob';
import { useSingleFlight } from '@/api/useSingleFlight';
import { config } from '@/config';
import { conflictNames, describeConflict, type ConflictNames } from '@/lib/conflicts';
import {
  groupState,
  isLost,
  isoWeekdayOf,
  schoolDatesBetween,
  stepText,
  versionIdAt,
} from '@/lib/substitutions';
import { addDaysIso, formatDate, formatDayHeading, todayKyiv } from '@/lib/time';
import { useUnsavedChanges } from '@/lib/unsaved';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  ModalActions,
  Notice,
  PageHeader,
  ProblemNotice,
  Spinner,
  Stack,
} from '@/ui';
import { IconOk } from '@/ui/icons';
import s from './SubstitutionsPage.module.css';

/**
 * «Заміни» (етап 2, розділи 06 і 10) — як у прототипі: «Нова відсутність» і «Пропозиції».
 * API timetable-service: POST/GET/DELETE /absences, GET /substitutions?date=,
 * POST /substitutions/{job_id}:approve|:reject. Пропозиції рахує solver — по задачі на кожну дату.
 *
 * Відмінність від прототипу: POST /absences приймає один період і один набір номерів уроків
 * на всі дати (прототип дозволяв уроки окремо для кожної дати).
 */
export function SubstitutionsPage() {
  const [params, setParams] = useSearchParams();
  const absences = useAbsences();
  const [created, setCreated] = useState<AbsenceAccepted | null>(null);

  if (!params.get('tab') && absences.isPending) return <Spinner />;
  const tab = params.get('tab') ?? (absences.data?.length ? 'props' : 'new');
  const go = (t: 'new' | 'props') => setParams({ tab: t }, { replace: true });

  return (
    <>
      <PageHeader title="Заміни" />
      <div className={s.tabs} role="tablist" aria-label="Заміни">
        <button type="button" role="tab" aria-selected={tab === 'new'} onClick={() => go('new')}>
          Нова відсутність
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'props'}
          onClick={() => go('props')}
        >
          Пропозиції{absences.data?.length ? ` · ${absences.data.length}` : ''}
        </button>
      </div>

      {tab === 'new' ? (
        <NewAbsence
          onCreated={(res) => {
            setCreated(res);
            go('props');
          }}
        />
      ) : (
        <Proposals created={created} onDismiss={() => setCreated(null)} />
      )}
    </>
  );
}

/** Поточні й майбутні відсутності; опитуємо, поки якась задача ще рахується. */
function useAbsences() {
  return useQuery({
    queryKey: ['absences'],
    queryFn: timetableApi.absences,
    refetchInterval: (q) =>
      q.state.data?.some((a) => a.jobs.some((j) => !isTerminal(j))) ? config.jobPollMs : false,
  });
}

/** Спільні дані: назви, дзвінки, версії, план тривог. Ключі — ті самі, що в інших розділах. */
function useSchoolContext() {
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  const bells = useQuery({ queryKey: ['bells'], queryFn: schoolApi.getBells });
  const holidays = useQuery({ queryKey: ['holidays'], queryFn: timetableApi.getHolidays });
  const versions = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });
  const alertPlan = useQuery({ queryKey: ['alert-plan'], queryFn: timetableApi.alertPlan });
  const names: ConflictNames = conflictNames({
    classes: classes.data,
    teachers: teachers.data,
    subjects: subjects.data,
  });
  const error =
    teachers.error ?? classes.error ?? versions.error ?? profile.error ?? alertPlan.error;
  const ready = !!(teachers.data && classes.data && versions.data && profile.data);
  return {
    teachers: teachers.data ?? [],
    subjects: subjects.data ?? [],
    plan: plan.data ?? [],
    profile: profile.data,
    bells: bells.data ?? [],
    holidays: holidays.data ?? null,
    versions: versions.data ?? [],
    alertPlan: alertPlan.data,
    names,
    error,
    ready,
  };
}

const label = (names: ConflictNames, kind: keyof ConflictNames, id: string | null) =>
  (id && names[kind]?.get(id)) || '—';

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const dayTitle = (date: string) => capitalize(formatDayHeading(date));

/** Перша навчальна дата від сьогодні (відсутність вносять з сьогодні або пізніше). */
function firstSchoolDate(saturday: boolean) {
  const today = todayKyiv();
  return schoolDatesBetween(today, addDaysIso(today, 7), saturday)[0] ?? today;
}

// ───────────── нова відсутність ─────────────

function HowSolverWorks() {
  return (
    <Card className={s.how}>
      <details>
        <summary>Як solver шукає заміну</summary>
        <ol>
          <li>
            <b>Крок 1.</b> Будь-який вільний вчитель, що цього дня працює в тому ж форматі (очно чи
            дистанційно), у межах тижневого ліміту й не в недоступний день. Перевага — вчителю цього
            предмета, інакше заміна позначається «не за фахом». Місткість дня дотримано.
          </li>
          <li>
            <b>Крок 2.</b> Немає — перебудова лише дня відсутності з мінімумом змінених уроків; інші
            дні й формати днів класів не змінюються.
          </li>
          <li>
            <b>Крок 3.</b> Немає — сусідні навчальні дні в межах ISO-тижня, не раніше сьогодні. Якщо
            й так немає — «самостійна робота» (під час погодження можна обрати «скасовано»).
          </li>
        </ol>
      </details>
    </Card>
  );
}

function NewAbsence({ onCreated }: { onCreated: (res: AbsenceAccepted) => void }) {
  const qc = useQueryClient();
  const ctx = useSchoolContext();
  const saturday = !!ctx.profile?.saturday;
  const perDay = ctx.profile?.lessons_per_day ?? ctx.bells.length;
  const active = ctx.teachers.filter((t) => !t.deleted_at);

  const [teacherId, setTeacherId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState<'all' | 'part'>('all');
  const [lessonNos, setLessonNos] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  // знімок введеного на момент успішного запиту: після нього форма вже не «незбережена»
  const entered = JSON.stringify([teacherId, from, to, mode, lessonNos]);
  const [sent, setSent] = useState<string | null>(null);
  useUnsavedChanges(!!(teacherId || from || to || lessonNos.length) && entered !== sent, {
    title: 'Відсутність не збережено',
  });

  const tid = teacherId || active[0]?.teacher_id || '';
  const dFrom = from || firstSchoolDate(saturday);
  const dTo = to || dFrom;
  const dates = schoolDatesBetween(dFrom, dTo, saturday, ctx.holidays);

  // які версії діють на ці дати — щоб показати уроки вчителя до запиту
  const at = new Map(dates.map((d) => [d, versionIdAt(d, ctx.versions, ctx.alertPlan)]));
  const ids = [...new Set([...at.values()].flatMap((v) => (v ? [v.id] : [])))];
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['timetable', id],
      queryFn: () => timetableApi.get(id),
    })),
  });
  const byId = new Map(
    details.flatMap((q) => (q.data ? [[q.data.timetable_id, q.data] as const] : [])),
  );
  const lessonsOn = (date: string, onlyChosen = true): Lesson[] => {
    const v = at.get(date);
    const tt = v && byId.get(v.id);
    if (!tt) return [];
    const wd = isoWeekdayOf(date);
    return tt.lessons
      .filter(
        (l) =>
          l.teacher_id === tid &&
          l.day === wd &&
          (!onlyChosen || mode === 'all' || lessonNos.includes(l.lesson_no)),
      )
      .sort((a, b) => a.lesson_no - b.lesson_no);
  };
  const previewReady = details.every((q) => !q.isPending);
  const total = dates.reduce((n, d) => n + lessonsOn(d).length, 0);

  const create = useMutation({
    mutationFn: () =>
      timetableApi.createAbsence({
        teacher_id: tid,
        date_from: dFrom,
        date_to: dTo,
        ...(mode === 'part' ? { lesson_nos: lessonNos } : {}),
      }),
    onSuccess: (res) => {
      // до переходу на вкладку пропозицій: інакше блокер незбережених змін зупинить і його
      flushSync(() => setSent(entered));
      void qc.invalidateQueries({ queryKey: ['absences'] });
      onCreated(res);
    },
  });
  // POST /absences не ідемпотентний: подвійний клік давав дві відсутності й дві задачі заміни
  const createOnce = useSingleFlight(create);

  if (ctx.error) return <ProblemNotice error={ctx.error} />;
  if (!ctx.ready) return <Spinner />;
  if (!active.length)
    return <Notice tone="info">Спершу додайте вчителів у «Даних закладу».</Notice>;

  const subjectsOf = (id: string) =>
    [...new Set(ctx.plan.filter((r) => r.teacher_id === id).map((r) => r.subject_id))]
      .map((sid) => ctx.subjects.find((x) => x.subject_id === sid)?.short_name)
      .filter(Boolean)
      .join(', ');
  const classesAt = (n: number) =>
    [
      ...new Set(
        dates.flatMap((d) =>
          lessonsOn(d, false)
            .filter((l) => l.lesson_no === n)
            .map((l) => label(ctx.names, 'classes', l.class_id)),
        ),
      ),
    ].join(', ');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dTo < dFrom) return setError('Дата «по» раніша за «з».');
    if (mode === 'part' && !lessonNos.length) return setError('Оберіть хоча б один урок.');
    setError(null);
    createOnce();
  };

  return (
    <div className={s.narrow}>
      <HowSolverWorks />
      <Card>
        <form onSubmit={submit} noValidate>
          <Stack>
            <Field
              label="Хто відсутній"
              hint="Причину відсутності не вказуйте: поля причини немає."
            >
              {(id) => (
                <select
                  id={id}
                  value={tid}
                  onChange={(e) => {
                    setTeacherId(e.target.value);
                    setLessonNos([]);
                  }}
                >
                  {active.map((t) => (
                    <option key={t.teacher_id} value={t.teacher_id}>
                      {t.label}
                      {subjectsOf(t.teacher_id) ? ` · ${subjectsOf(t.teacher_id)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <div className={s.f2}>
              <Field label="З">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    min={todayKyiv()}
                    value={dFrom}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      if (!to || to < e.target.value) setTo(e.target.value);
                    }}
                  />
                )}
              </Field>
              <Field label="По">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    min={dFrom}
                    value={dTo}
                    onChange={(e) => setTo(e.target.value)}
                  />
                )}
              </Field>
            </div>

            <div>
              <div className={s.seg} role="group" aria-label="Які уроки">
                <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
                  Увесь день
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'part'}
                  onClick={() => setMode('part')}
                >
                  Окремі уроки
                </button>
              </div>
              {mode === 'part' && (
                <fieldset className={s.checks} aria-label="Номери уроків">
                  {Array.from({ length: perDay }, (_, i) => i + 1).map((n) => (
                    <label key={n}>
                      <input
                        type="checkbox"
                        checked={lessonNos.includes(n)}
                        onChange={() =>
                          setLessonNos((xs) =>
                            xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n].sort(),
                          )
                        }
                      />
                      {n} урок{classesAt(n) ? ` · ${classesAt(n)}` : ''}
                    </label>
                  ))}
                </fieldset>
              )}
              {mode === 'part' && (
                <p className="muted">Ті самі номери уроків — на кожну дату періоду.</p>
              )}
            </div>

            <section aria-label="Уроки, які треба замінити">
              {dates.length === 0 ? (
                <p className="muted">У періоді немає навчальних днів.</p>
              ) : (
                <ul className={s.preview}>
                  {dates.map((d) => {
                    const ls = lessonsOn(d);
                    const v = at.get(d);
                    return (
                      <li key={d}>
                        <span>
                          <b>{dayTitle(d)}</b>{' '}
                          <span className="muted">
                            {!v
                              ? 'розклад ще не діє'
                              : !previewReady
                                ? '…'
                                : ls.length
                                  ? `${ls.length} ур.: ${ls
                                      .map(
                                        (l) =>
                                          `${l.lesson_no} — ${label(ctx.names, 'classes', l.class_id)}`,
                                      )
                                      .join(', ')}`
                                  : 'уроків немає'}
                          </span>
                        </span>
                        {v?.alert && <Chip tone="out">діє розклад тривог</Chip>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {error && (
              <p role="alert" className={s.err}>
                {error}
              </p>
            )}
            {isApiError(create.error, 'teacher_is_substitute') ? (
              <Notice tone="bad">
                <p>
                  Цей вчитель уже погоджений замінником у ці дні й уроки. Спершу скасуйте
                  відсутність, для якої його призначено, або внесіть відсутність без цих уроків.
                </p>
                <CoveringLessons lessons={create.error.body.lessons} names={ctx.names} />
              </Notice>
            ) : (
              create.error && <ProblemNotice error={create.error} />
            )}

            <div className={s.foot}>
              <span className="muted">
                Навчальних дат: {dates.length} · уроків: {total} · по задачі заміни на кожну дату з
                уроками
              </span>
              <Button
                type="submit"
                variant="primary"
                disabled={create.isPending || entered === sent || (previewReady && total === 0)}
              >
                {create.isPending ? 'Вносимо…' : 'Внести відсутність'}
              </Button>
            </div>
          </Stack>
        </form>
      </Card>
    </div>
  );
}

// ───────────── пропозиції ─────────────

function Proposals({
  created,
  onDismiss,
}: {
  created: AbsenceAccepted | null;
  onDismiss: () => void;
}) {
  const absences = useAbsences();
  const ctx = useSchoolContext();

  if (absences.isPending || !ctx.ready) return <Spinner />;
  if (absences.error) return <ProblemNotice error={absences.error} />;
  if (ctx.error) return <ProblemNotice error={ctx.error} />;

  return (
    <div className={s.wide}>
      {created && (
        <Notice tone="ok">
          <p>
            Відсутність внесено: задач заміни — {created.job_ids.length}. Пропозиції з’являться,
            щойно solver їх порахує. <button onClick={onDismiss}>Закрити</button>
          </p>
        </Notice>
      )}
      {absences.data.length === 0 ? (
        <p className="muted">Відсутностей і пропозицій немає.</p>
      ) : (
        absences.data.map((a) => <AbsenceCard key={a.absence_id} absence={a} ctx={ctx} />)
      )}
    </div>
  );
}

type Ctx = ReturnType<typeof useSchoolContext>;

function AbsenceCard({ absence: a, ctx }: { absence: Absence; ctx: Ctx }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => timetableApi.deleteAbsence(a.absence_id),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['absences'] });
      void qc.invalidateQueries({ queryKey: ['substitutions'] });
    },
  });
  const cancelOnce = useSingleFlight(cancel);
  const who = label(ctx.names, 'teachers', a.teacher_id);
  const period =
    a.date_from === a.date_to
      ? formatDate(a.date_from)
      : `${formatDate(a.date_from)} – ${formatDate(a.date_to)}`;
  const which = a.lesson_nos?.length ? `уроки ${a.lesson_nos.join(', ')}` : 'увесь день';

  return (
    <section className={s.absence} aria-label={`Відсутність: ${who}`}>
      <div className={s.absenceHead}>
        <h3>
          Відсутній {who}{' '}
          <span className="muted">
            · {period} · {which}
          </span>
        </h3>
        <Button size="sm" onClick={() => setConfirm(true)}>
          Скасувати відсутність
        </Button>
      </div>
      {a.jobs.map((j) => (
        <JobGroup key={j.job_id} job={j} ctx={ctx} />
      ))}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Скасувати відсутність?">
        <p>
          {who}, {period}. Пропозиції й уже погоджені заміни цієї відсутності буде відхилено, а
          сторінки за QR повернуться до розкладу без замін.
        </p>
        {cancel.error && <ProblemNotice error={cancel.error} />}
        <ModalActions>
          <Button onClick={() => setConfirm(false)}>Залишити</Button>
          <Button variant="danger" disabled={cancel.isPending} onClick={() => cancelOnce()}>
            Скасувати відсутність
          </Button>
        </ModalActions>
      </Modal>
    </section>
  );
}

const key = (r: Pick<Substitution, 'class_id' | 'lesson_no'>) => `${r.class_id}|${r.lesson_no}`;

function JobGroup({ job, ctx }: { job: Absence['jobs'][number]; ctx: Ctx }) {
  const qc = useQueryClient();
  const done = job.state === 'done';
  // rejected: validator-lib знайшов нові конфлікти — пропозиції збережено як відхилені (RQ4), їх видно
  const rejected = job.state === 'rejected';
  const hasRows = done || rejected;
  const subs = useQuery({
    queryKey: ['substitutions', job.date],
    queryFn: () => timetableApi.substitutions(job.date),
    enabled: hasRows,
  });
  const rows = (subs.data ?? [])
    .filter((r) => r.job_id === job.job_id)
    .sort((a, b) => a.lesson_no - b.lesson_no);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  // для збою й відмови — код і conflicts з GET /jobs/{id}, щоб пояснити їх людськими словами
  const failed = !done && isTerminal(job);
  const details = useQuery({
    queryKey: ['job', job.job_id],
    queryFn: () => timetableApi.getJob(job.job_id),
    enabled: failed,
  });

  const settle = (next: Substitution[]) => {
    qc.setQueryData<Substitution[]>(['substitutions', job.date], (old) => [
      ...(old ?? []).filter((r) => r.job_id !== job.job_id),
      ...next,
    ]);
    void qc.invalidateQueries({ queryKey: ['substitutions', job.date] });
  };
  const approve = useMutation({
    mutationFn: () =>
      timetableApi.approveSubstitution(job.job_id, {
        cancel: rows
          .filter((r) => r.kind === 'self_study' && cancelled.has(key(r)))
          .map(({ class_id, lesson_no }) => ({ class_id, lesson_no })),
      }),
    onSuccess: settle,
  });
  const reject = useMutation({
    mutationFn: () => timetableApi.rejectSubstitution(job.job_id),
    onSuccess: settle,
  });
  // подвійний клік: другий :approve/:reject лише пише зайвий запис у журнал
  const approveOnce = useSingleFlight(approve);
  const rejectOnce = useSingleFlight(reject);

  const v = versionIdAt(job.date, ctx.versions, ctx.alertPlan);
  const bells: Bell[] = v?.alert ? (ctx.alertPlan?.bells ?? []) : ctx.bells;
  const state = groupState(rows);
  const lost = rows.some((r) => isLost(r, ctx.versions, ctx.alertPlan));

  let chip;
  if (!done)
    chip = <Chip tone={isTerminal(job) ? 'bad' : 'acc'}>{JOB_STATE_LABEL[job.state]}</Chip>;
  else if (state === 'approved') chip = <Chip tone="ok">погоджено</Chip>;
  else if (state === 'rejected') chip = <Chip>відхилено</Chip>;
  else if (state === 'proposed') chip = <Chip tone="acc">пропозиція</Chip>;

  return (
    <article className={s.sgroup} aria-label={dayTitle(job.date)}>
      <header>
        <span>
          {dayTitle(job.date)} {v?.alert && <small className="muted">· розклад тривог</small>}
        </span>
        <span className={s.headActs}>
          {lost && <Chip tone="warn">втратила силу: на дату діє інша версія</Chip>}
          {chip}
        </span>
      </header>

      {rejected && (
        <div className={s.sbody}>
          <Notice tone="bad">
            <p>
              Перевірка не прийняла пропозиції солвера
              {details.data?.conflicts?.length ? ':' : '.'}
            </p>
            {!!details.data?.conflicts?.length && (
              <ul>
                {details.data.conflicts.map((c, i) => (
                  <li key={i}>{describeConflict(c, ctx.names)}</li>
                ))}
              </ul>
            )}
            <p>
              Погодити їх не можна. Скасуйте відсутність і внесіть її знову або замініть вручну.
            </p>
          </Notice>
        </div>
      )}
      {!hasRows ? (
        <div className={s.sbody}>
          {failed ? (
            details.data?.error === 'unsupported_job_type' ? (
              <p role="status">
                Солвер на сервері ще не підбирає заміни (версія до 0.4.0). Поки що призначте заміну
                вручну.
              </p>
            ) : (
              <p role="status">
                Пропозицій немає: задача завершилась зі станом «{JOB_STATE_LABEL[job.state]}».{' '}
                {jobErrorText(details.data?.error)} Скасуйте відсутність і внесіть її знову пізніше.
              </p>
            )
          ) : (
            <p className="muted" role="status">
              Solver рахує пропозиції… ({JOB_STATE_LABEL[job.state]})
            </p>
          )}
        </div>
      ) : subs.isPending ? (
        <div className={s.sbody}>
          <Spinner />
        </div>
      ) : subs.error ? (
        <div className={s.sbody}>
          <ProblemNotice error={subs.error} />
        </div>
      ) : rows.length === 0 ? (
        <div className={s.sbody}>
          <p className="muted">Уроків для заміни немає.</p>
        </div>
      ) : (
        <>
          {rows.map((r) => (
            <SubstitutionRow
              key={key(r)}
              row={r}
              bells={bells}
              names={ctx.names}
              cancelled={cancelled.has(key(r))}
              onCancelled={(on) =>
                setCancelled((xs) => {
                  const next = new Set(xs);
                  if (on) next.add(key(r));
                  else next.delete(key(r));
                  return next;
                })
              }
            />
          ))}
          {(approve.error || reject.error) && (
            <div className={s.sbody}>
              <DecisionError error={approve.error ?? reject.error} />
            </div>
          )}
          {state === 'proposed' && (
            <div className={s.acts}>
              <Button
                size="sm"
                disabled={approve.isPending || reject.isPending}
                onClick={() => rejectOnce()}
              >
                Відхилити
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={approve.isPending || reject.isPending}
                onClick={() => approveOnce()}
              >
                <IconOk width={14} height={14} />
                Погодити
              </Button>
            </div>
          )}
          {state === 'approved' && !lost && (
            <p className={`${s.note} muted`}>
              Видно на сторінках за QR: у класу урок позначено «Заміна».
            </p>
          )}
          {state === 'rejected' && !rejected && (
            <p className={`${s.note} muted`}>
              Відхилену пропозицію збережено для оцінювання якості замін.
            </p>
          )}
        </>
      )}
    </article>
  );
}

function SubstitutionRow({
  row: r,
  bells,
  names,
  cancelled,
  onCancelled,
}: {
  row: Substitution;
  bells: Bell[];
  names: ConflictNames;
  cancelled: boolean;
  onCancelled: (on: boolean) => void;
}) {
  const bell = bells.find((b) => b.lesson_no === r.lesson_no);
  const name = `sc-${r.job_id}-${key(r)}`;
  let res;
  if (r.kind === 'teacher') {
    res = (
      <>
        <Chip tone="acc">інший вчитель</Chip>
        <b>{label(names, 'teachers', r.new_teacher_id)}</b>
        {r.off_profile && <Chip tone="warn">не за фахом</Chip>}
      </>
    );
  } else if (r.kind === 'moved' && r.moved_to) {
    res = (
      <span>
        Урок переноситься на {dayTitle(r.moved_to.date)}, {r.moved_to.lesson_no} урок
        {r.new_teacher_id && (
          <>
            , веде <b>{label(names, 'teachers', r.new_teacher_id)}</b>{' '}
            {r.off_profile && <Chip tone="warn">не за фахом</Chip>}
          </>
        )}
      </span>
    );
  } else if (r.kind === 'self_study' && r.state === 'proposed') {
    res = (
      <>
        <Chip>самостійна</Chip>
        <span
          className={s.choice}
          role="radiogroup"
          aria-label={`${r.lesson_no} урок: як провести`}
        >
          <label>
            <input
              type="radio"
              name={name}
              checked={!cancelled}
              onChange={() => onCancelled(false)}
            />
            самостійна робота
          </label>
          <label>
            <input
              type="radio"
              name={name}
              checked={cancelled}
              onChange={() => onCancelled(true)}
            />
            скасовано
          </label>
        </span>
      </>
    );
  } else {
    res =
      r.kind === 'cancelled' ? (
        <Chip tone="bad">скасовано</Chip>
      ) : (
        <>
          <Chip>самостійна</Chip>
          <b>самостійна робота</b>
        </>
      );
  }

  return (
    <div className={s.lrow}>
      <span>
        <b>
          {r.lesson_no} урок{bell ? ` · ${bell.start}–${bell.end}` : ''}
        </b>
        <br />
        <span className="muted">
          {label(names, 'classes', r.class_id)} · {label(names, 'subjects', r.subject_id)}
        </span>
      </span>
      <div>
        <div className={s.res}>{res}</div>
        <small className="muted">{stepText(r)}</small>
      </div>
    </div>
  );
}

/** 409 teacher_is_substitute: уроки, де вчитель уже погоджений замінником (lessons[] у відповіді). */
function CoveringLessons({ lessons, names }: { lessons: unknown; names: ConflictNames }) {
  const list = Array.isArray(lessons)
    ? (lessons as { date?: string; class_id?: string; lesson_no?: number }[])
    : [];
  if (!list.length) return null;
  return (
    <ul>
      {list.map((l, i) => (
        <li key={i}>
          {l.date ? `${dayTitle(l.date)}, ` : ''}
          {label(names, 'classes', l.class_id ?? null)}, урок {l.lesson_no}
        </li>
      ))}
    </ul>
  );
}

/** Відмови :approve / :reject людськими словами (коди — README timetable-service). */
/**
 * Три різні 409 stale на :approve (timetable substitutions.ts): на дату діє інша версія; урок
 * пропозиції вже не в цьому слоті (тиждень змінився); пропозиція не вкладається в тиждень (issues[]).
 */
function staleReason(error: ApiError): string {
  if (Array.isArray(error.body.issues))
    return 'Після пропозиції тиждень змінився, і вона в нього більше не вкладається.';
  if (/слот|тиждень змінився/i.test(`${error.title} ${error.detail ?? ''}`))
    return 'Після пропозиції тиждень змінився: урок уже не в цьому слоті (його перенесли або на нього погодили іншу заміну).';
  return 'На цю дату вже діє інша версія розкладу, і пропозиція їй не відповідає.';
}

function DecisionError({ error }: { error: unknown }) {
  if (isApiError(error, 'stale'))
    return (
      <Notice tone="bad">
        <p>{staleReason(error)} Скасуйте відсутність і внесіть її знову.</p>
      </Notice>
    );
  if (isApiError(error, 'slot_taken'))
    return (
      <Notice tone="bad">
        <p>Один із уроків уже має погоджену заміну. Відхиліть цю пропозицію.</p>
      </Notice>
    );
  if (isApiError(error, 'date_passed'))
    return (
      <Notice tone="bad">
        <p>
          Дата заміни (або дата, на яку переноситься урок) уже минула — погодити її не можна.
          Відхиліть пропозицію.
        </p>
      </Notice>
    );
  if (isApiError(error, 'job_not_ready'))
    return (
      <Notice tone="warn">
        <p>Пропозицій для погодження ще немає. Оновіть сторінку трохи пізніше.</p>
      </Notice>
    );
  // conflicts[] показує ProblemNotice: тексти з contracts, назви — з кешу кабінету
  return <ProblemNotice error={error} />;
}
