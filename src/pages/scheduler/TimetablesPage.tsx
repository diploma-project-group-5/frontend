import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { schoolApi, timetableApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { Day, Lesson, TimetableLoad, TimetableSummary } from '@/api/types';
import { isTerminal, JOB_STATE_LABEL, useJob } from '@/api/useJob';
import { conflictNames, describeConflict, useConflictNames } from '@/lib/conflicts';
import { DAY_SHORT, formatDate, peakText, publishedPhase, todayKyiv } from '@/lib/time';
import { Badge, Button, Chip, Notice, PageHeader, ProblemNotice, Spinner } from '@/ui';
import { IconOk, IconRefresh, IconWarn } from '@/ui/icons';
import s from './TimetablesPage.module.css';

const ACTIVE_JOB_KEY = 'lad.activeBuildJob';
const PHASE_LABEL = { scheduled: 'Запланована', current: 'Чинна', archived: 'Архівна' } as const;
const DAY_FULL = ['', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'] as const;

/**
 * «Розклад» (прототип: редактор). Перемикач «Чинний / Чернетка», вкладки днів з навантаженням
 * укриття, сітка «класи × уроки», формати тижня. Чернетка — найновіша версія validated.
 * Перетягування уроку (етап 2): PATCH /timetables/{id}/lessons/{class}/{day}/{no}; зайнятий
 * слот класу — обмін; перевіряє лише сервер (validator-lib), конфлікт → 409 з conflicts[].
 * Опубліковану версію не правлять: :copy створює чернетку-копію.
 */
export function TimetablesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });
  const [showAll, setShowAll] = useState(false);

  // job_id тримаємо в sessionStorage, щоб опитування пережило оновлення сторінки
  const [jobId, setJobId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(ACTIVE_JOB_KEY);
    } catch {
      return null;
    }
  });
  const job = useJob(jobId);
  const build = useMutation({
    mutationFn: timetableApi.build,
    onSuccess: (r) => setJobId(r.job_id),
    onError: (e) => {
      // 409: побудова вже йде — сервер повертає job_id активної задачі
      if (isApiError(e) && e.status === 409 && typeof e.body.job_id === 'string') {
        setJobId(e.body.job_id);
      }
    },
  });
  useEffect(() => {
    try {
      if (jobId) sessionStorage.setItem(ACTIVE_JOB_KEY, jobId);
      else sessionStorage.removeItem(ACTIVE_JOB_KEY);
    } catch {
      /* приватний режим — без збереження */
    }
  }, [jobId]);
  useEffect(() => {
    if (job.data?.state === 'done') void qc.invalidateQueries({ queryKey: ['timetables'] });
  }, [job.data?.state, qc]);
  // Помилка опитування (напр. 404 на задачу з минулої сесії) — це не «побудова триває»
  const running = !!jobId && !job.error && !isTerminal(job.data);

  const today = todayKyiv();
  const versions = list.data ?? [];
  const publishedDates = versions.filter((v) => v.effective_from).map((v) => v.effective_from!);
  const phaseOf = (v: TimetableSummary) =>
    v.state === 'published' && v.effective_from
      ? publishedPhase(v.effective_from, publishedDates, today)
      : null;
  const current = versions.find((v) => phaseOf(v) === 'current');
  const scheduled = versions.find((v) => phaseOf(v) === 'scheduled');
  const draft = versions.find((v) => v.state === 'validated'); // список — найновіші спершу
  const selectedId = id ?? draft?.timetable_id ?? current?.timetable_id ?? null;
  const go = (vid: string) => navigate(`/scheduler/timetables/${vid}`);

  const sources: [TimetableSummary | undefined, string][] = [
    [current, current ? `Чинний · з ${formatDate(current.effective_from!)}` : ''],
    [scheduled, scheduled ? `Запланований · з ${formatDate(scheduled.effective_from!)}` : ''],
    [draft, draft ? `Чернетка ${draft.timetable_id.slice(0, 8)}` : ''],
  ];
  const other = selectedId && !sources.some(([v]) => v?.timetable_id === selectedId);

  return (
    <>
      <PageHeader title="Розклад" />
      <div className={s.toolbar}>
        {list.data && (
          <div className={s.seg} role="group" aria-label="Версія">
            {sources.map(
              ([v, label]) =>
                v && (
                  <button
                    key={v.timetable_id}
                    type="button"
                    aria-pressed={v.timetable_id === selectedId}
                    onClick={() => go(v.timetable_id)}
                  >
                    {label}
                  </button>
                ),
            )}
            {other && (
              <button type="button" aria-pressed>
                Версія {selectedId.slice(0, 8)}
              </button>
            )}
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Сховати версії' : 'Усі версії'}
        </Button>
        <span className={s.grow} />
        <Button
          variant={selectedId === draft?.timetable_id ? 'default' : 'primary'}
          disabled={build.isPending || running}
          onClick={() => build.mutate()}
        >
          <IconRefresh width={15} height={15} />
          Побудувати чернетку
        </Button>
      </div>

      {build.error && !(isApiError(build.error) && build.error.status === 409) && (
        <ProblemNotice error={build.error} />
      )}
      {jobId && (
        <JobStatus
          jobId={jobId}
          onDismiss={() => setJobId(null)}
          onOpen={(vid) => {
            setJobId(null);
            go(vid);
          }}
        />
      )}
      {showAll && list.data && (
        <VersionsTable versions={list.data} phaseOf={phaseOf} selectedId={selectedId} />
      )}

      {list.isPending && <Spinner />}
      {list.error && <ProblemNotice error={list.error} />}
      {list.data && !selectedId && (
        <Notice tone="info">
          <p>Версій ще немає. Натисніть «Побудувати чернетку».</p>
        </Notice>
      )}
      {selectedId && <Editor key={selectedId} id={selectedId} onOpen={go} />}
    </>
  );
}

function JobStatus({
  jobId,
  onDismiss,
  onOpen,
}: {
  jobId: string;
  onDismiss: () => void;
  onOpen: (id: string) => void;
}) {
  const job = useJob(jobId);
  const names = useConflictNames();
  if (job.isPending) return <Spinner label="Запускаємо побудову…" />;
  if (job.error) {
    if (isApiError(job.error) && job.error.status === 404) {
      return (
        <Notice tone="info">
          <p>
            Попередню задачу побудови більше не знайдено.{' '}
            <button onClick={onDismiss}>Закрити</button>
          </p>
        </Notice>
      );
    }
    return <ProblemNotice error={job.error} />;
  }
  const j = job.data;
  if (!isTerminal(j)) {
    return (
      <Notice tone="info">
        <Spinner label={`${JOB_STATE_LABEL[j.state]}… Розрахунок може тривати кілька хвилин.`} />
      </Notice>
    );
  }
  if (j.state === 'done' && j.result && 'timetable_id' in j.result) {
    const vid = j.result.timetable_id;
    return (
      <Notice tone="ok">
        <p>
          Чернетку {vid.slice(0, 8)} побудовано.{' '}
          <Button size="sm" variant="primary" onClick={() => onOpen(vid)}>
            Відкрити чернетку
          </Button>{' '}
          <button onClick={onDismiss}>Закрити</button>
        </p>
      </Notice>
    );
  }
  return (
    <Notice tone="bad">
      <p>
        {JOB_STATE_LABEL[j.state]}. <button onClick={onDismiss}>Закрити</button>
      </p>
      {j.conflicts && j.conflicts.length > 0 && (
        <ul>
          {j.conflicts.map((c, i) => (
            <li key={i}>{describeConflict(c, names)}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}

function VersionsTable({
  versions,
  phaseOf,
  selectedId,
}: {
  versions: TimetableSummary[];
  phaseOf: (v: TimetableSummary) => keyof typeof PHASE_LABEL | null;
  selectedId: string | null;
}) {
  return (
    <div className={s.versions}>
      <table>
        <thead>
          <tr>
            <th>Версія</th>
            <th>Стан</th>
            <th>Діє з</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const phase = phaseOf(v);
            return (
              <tr key={v.timetable_id}>
                <td>
                  <Link to={`/scheduler/timetables/${v.timetable_id}`} className="mono">
                    {v.timetable_id.slice(0, 8)}
                  </Link>{' '}
                  {v.timetable_id === selectedId && <span className="muted">· відкрита</span>}
                </td>
                <td>
                  <Badge>{phase ? PHASE_LABEL[phase] : 'Чернетка'}</Badge>{' '}
                  {v.data_changed_since_build && v.state === 'validated' && (
                    <Badge tone="sub">Дані змінилися після побудови</Badge>
                  )}
                </td>
                <td>{v.effective_from ? formatDate(v.effective_from) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Slot = { class_id: string; day: Day; lesson_no: number };
type Status = { tone: 'info' | 'ok' | 'bad'; text: string; list?: string[] };

const sameSlot = (a: Slot, b: Slot) =>
  a.class_id === b.class_id && a.day === b.day && a.lesson_no === b.lesson_no;

function Editor({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tt = useQuery({ queryKey: ['timetable', id], queryFn: () => timetableApi.get(id) });
  const load = useQuery({
    queryKey: ['timetable', id, 'load'],
    queryFn: () => timetableApi.load(id),
  });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const bells = useQuery({ queryKey: ['bells'], queryFn: schoolApi.getBells });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  // назви для conflicts[]: копії класів і підписів із версії (там і «Вчитель #N»), предмети — з закладу
  const names = conflictNames({
    classes: tt.data?.classes,
    teachers: tt.data?.teachers,
    subjects: tt.data?.subjects ?? subjects.data,
  });

  const [day, setDay] = useState<Day | null>(null);
  const [sel, setSel] = useState<Slot | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [over, setOver] = useState<string | null>(null); // клітинка під перетягуванням
  const drag = useRef<Slot | null>(null);

  const move = useMutation({
    mutationFn: ({ from, to }: { from: Slot; to: Slot }) =>
      timetableApi.moveLesson(id, from, { day: to.day, lesson_no: to.lesson_no }),
    onSuccess: (next) => {
      qc.setQueryData(['timetable', id], next);
      void qc.invalidateQueries({ queryKey: ['timetable', id, 'load'] });
      setStatus({ tone: 'ok', text: 'Збережено в чернетці.' });
    },
    onError: (e) => {
      if (isApiError(e, 'published_readonly')) {
        setStatus({ tone: 'bad', text: 'Опубліковану версію не правлять: зробіть копію.' });
      } else if (isApiError(e) && e.status === 409) {
        setStatus({
          tone: 'bad',
          text: 'Переміщення недоступне, розклад не змінено:',
          list: e.conflicts.map((c) => describeConflict(c, names)),
        });
      } else {
        setStatus({ tone: 'bad', text: 'Не вдалося зберегти зміну. Спробуйте ще раз.' });
      }
    },
  });
  const copy = useMutation({
    mutationFn: () => timetableApi.copy(id),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onOpen(c.timetable_id);
    },
  });

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  if (tt.isPending) return <Spinner />;
  if (tt.error) return <ProblemNotice error={tt.error} />;
  const v = tt.data;
  const editable = v.kind === 'main' && v.state === 'validated';
  const days = [...new Set(v.day_formats.map((f) => f.day))].sort() as Day[];
  const d = day ?? days[0] ?? 1;
  const perDay = Math.max(profile.data?.lessons_per_day ?? 0, ...v.lessons.map((l) => l.lesson_no));
  const lessonAt = (x: Slot) => v.lessons.find((l) => sameSlot(l, x));
  const subjectName = (sid: string) =>
    subjects.data?.find((x) => x.subject_id === sid)?.name ?? '…';
  const teacherLabel = (tid: string) => v.teachers.find((x) => x.teacher_id === tid)?.label ?? '';
  const className = (cid: string) => v.classes.find((c) => c.class_id === cid)?.name ?? '';
  const formatOf = (cid: string, dd: Day) =>
    v.day_formats.find((f) => f.class_id === cid && f.day === dd)?.format;
  const clashWith = (l: Lesson) =>
    v.lessons.find(
      (x) =>
        x !== l && x.teacher_id === l.teacher_id && x.day === l.day && x.lesson_no === l.lesson_no,
    );
  const dayLoad = (dd: Day) => load.data?.days.find((x) => x.day === dd)?.passport;
  const conflicts = load.data?.validation.conflicts ?? [];

  const tryMove = (from: Slot, to: Slot) => {
    if (sameSlot(from, to)) return setSel(null);
    setSel(null);
    move.mutate({ from, to });
  };
  const onCell = (slot: Slot) => {
    if (!editable || move.isPending) return;
    const l = lessonAt(slot);
    if (sel && sel.class_id === slot.class_id) return tryMove(sel, slot);
    if (l) {
      setSel(slot);
      setStatus(null);
    }
  };
  const key = (x: Slot) => `${x.class_id}|${x.day}|${x.lesson_no}`;
  const dnd = (slot: Slot) =>
    editable
      ? {
          onDragOver: (e: DragEvent) => {
            if (drag.current?.class_id !== slot.class_id) return; // лише в рядку свого класу
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (over !== key(slot)) setOver(key(slot));
          },
          onDragLeave: () => setOver((o) => (o === key(slot) ? null : o)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setOver(null);
            const from = drag.current;
            drag.current = null;
            if (from && from.class_id === slot.class_id) tryMove(from, slot);
          },
        }
      : {};

  const hint: Status = !editable
    ? {
        tone: 'info',
        text:
          v.kind === 'alert'
            ? 'Шаблон розкладу тривог: лише перегляд.'
            : 'Опубліковану версію не правлять. Щоб змінити, створіть чернетку-копію й опублікуйте її як звичайно.',
      }
    : sel
      ? {
          tone: 'info',
          text: `Обрано: ${subjectName(lessonAt(sel)?.subject_id ?? '')}, ${className(sel.class_id)}, ${DAY_SHORT[sel.day]}. Клацніть клітинку того ж класу (можна в іншому дні), щоб перемістити або поміняти місцями. Esc — скасувати.`,
        }
      : {
          tone: 'info',
          text: 'Перетягніть урок у межах рядка класу або клацніть урок, а потім іншу клітинку цього класу — також в іншому дні.',
        };
  const shown = status ?? hint;
  const L = dayLoad(d);
  const max = L ? Math.max(L.limit, L.load) * 1.04 : 1;

  return (
    <>
      <div className={s.toolbar}>
        <Badge>
          {v.state === 'published'
            ? `Опубліковано${v.effective_from ? `, діє з ${formatDate(v.effective_from)}` : ''}`
            : v.kind === 'alert'
              ? 'Шаблон тривог · модель 1.2'
              : 'Чернетка · перевірена'}
        </Badge>
        {v.data_changed_since_build && editable && <Chip tone="warn">Дані змінено</Chip>}
        <span className={s.grow} />
        {editable && (
          <Button
            size="sm"
            onClick={() => navigate(`/scheduler/approval?version=${v.timetable_id}`)}
          >
            {conflicts.length ? (
              <Chip tone="bad">{conflicts.length}</Chip>
            ) : (
              <IconOk width={15} height={15} />
            )}
            До погодження
          </Button>
        )}
      </div>
      {copy.error && <ProblemNotice error={copy.error} />}

      <div className={s.dtabs} style={{ ['--n' as string]: days.length }}>
        {days.map((dd) => {
          const x = dayLoad(dd);
          return (
            <button
              key={dd}
              type="button"
              className={`${s.dtab} ${x && x.load > x.limit ? s.dtabOver : ''}`}
              aria-pressed={dd === d}
              onClick={() => setDay(dd)}
            >
              <b>{DAY_SHORT[dd]}</b>
              <small>{x ? `укриття ${x.load}/${x.limit}` : '…'}</small>
            </button>
          );
        })}
      </div>

      <div className={s.edl}>
        <div className={s.edm}>
          {L && (
            <div className={s.dload}>
              <span>
                Укриття, {DAY_FULL[d]}:{' '}
                <b className={L.load > L.limit ? s.over : undefined}>
                  {L.load} / {L.limit}
                </b>{' '}
                осіб
              </span>
              <span className={s.bar}>
                <i
                  className={L.load > L.limit ? s.over : undefined}
                  style={{ width: `${(L.load / max) * 100}%` }}
                />
                <b style={{ left: `${(L.limit / max) * 100}%` }} />
              </span>
              <span className="muted">клацніть формат класу, щоб побачити причину</span>
            </div>
          )}
          {!load.data?.validation.ok && conflicts.length > 0 && (
            <Notice tone="bad">
              <p>Перевірка знайшла порушення:</p>
              <ul>
                {conflicts.map((c, i) => (
                  <li key={i}>{describeConflict(c, names)}</li>
                ))}
              </ul>
            </Notice>
          )}

          <div
            className={`${s.status} ${shown.tone === 'bad' ? s.statusBad : shown.tone === 'ok' ? s.statusOk : ''}`}
            role="status"
          >
            {shown.tone === 'bad' && <IconWarn width={15} height={15} />}
            {shown.tone === 'ok' && <IconOk width={15} height={15} />}
            <span>{shown.text}</span>
            {shown.list && (
              <ul>
                {shown.list.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
            {!editable && v.kind === 'main' && (
              <Button size="sm" disabled={copy.isPending} onClick={() => copy.mutate()}>
                Створити копію для правок
              </Button>
            )}
          </div>

          <div className={s.gw}>
            <table className={s.dg} style={{ minWidth: 110 + perDay * 110 }}>
              <thead>
                <tr>
                  <th className={s.cls}>Клас</th>
                  {Array.from({ length: perDay }, (_, i) => {
                    const b = bells.data?.find((x) => x.lesson_no === i + 1);
                    return (
                      <th key={i}>
                        {i + 1} урок
                        {b && <small>{b.start}</small>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {v.classes.map((c) => {
                  const f = formatOf(c.class_id, d);
                  return (
                    <tr key={c.class_id} className={f === 'remote' ? s.out : undefined}>
                      <th className={s.cls}>
                        <span>{c.name}</span>
                        {f && (
                          <button
                            type="button"
                            className={`${s.fmtb} ${f === 'remote' ? s.out : ''}`}
                            onClick={() =>
                              setStatus(reasonStatus(c.class_id, c.name, d, f, load.data))
                            }
                          >
                            {f === 'remote' ? 'дистанційно' : 'очно'}
                          </button>
                        )}
                      </th>
                      {Array.from({ length: perDay }, (_, i) => {
                        const slot: Slot = { class_id: c.class_id, day: d, lesson_no: i + 1 };
                        const l = lessonAt(slot);
                        const clash = l && clashWith(l);
                        const isSel = !!sel && sameSlot(sel, slot);
                        const target = over === key(slot);
                        return (
                          <td key={i} className={`${s.cell} ${target ? s.tgt : ''}`} {...dnd(slot)}>
                            {l ? (
                              editable ? (
                                <button
                                  type="button"
                                  draggable
                                  className={`${s.les} ${clash ? s.clash : ''} ${isSel ? s.sel : ''}`}
                                  title={`${subjectName(l.subject_id)} · ${teacherLabel(l.teacher_id)}${clash ? ` · накладка з ${className(clash.class_id)}` : ''}`}
                                  aria-pressed={isSel}
                                  onClick={() => onCell(slot)}
                                  onDragStart={(e) => {
                                    drag.current = slot;
                                    e.dataTransfer.setData('text/plain', key(slot));
                                    e.dataTransfer.effectAllowed = 'move';
                                    setSel(null);
                                  }}
                                  onDragEnd={() => {
                                    drag.current = null;
                                    setOver(null);
                                  }}
                                >
                                  <b>{subjectName(l.subject_id)}</b>
                                  <small>{teacherLabel(l.teacher_id)}</small>
                                </button>
                              ) : (
                                <div
                                  className={`${s.les} ${clash ? s.clash : ''}`}
                                  title={`${subjectName(l.subject_id)} · ${teacherLabel(l.teacher_id)}`}
                                >
                                  <b>{subjectName(l.subject_id)}</b>
                                  <small>{teacherLabel(l.teacher_id)}</small>
                                </div>
                              )
                            ) : (
                              editable &&
                              sel?.class_id === c.class_id && (
                                <button
                                  type="button"
                                  className={s.slot}
                                  aria-label={`Вільний слот: ${c.name}, ${DAY_SHORT[d]}, ${i + 1} урок`}
                                  onClick={() => onCell(slot)}
                                />
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {load.data && (
            <p className="muted">
              Дистанційних класо-днів: {load.data.summary.remote_class_days} · пік:{' '}
              {peakText(load.data.summary.peak)} · модель {v.model}
            </p>
          )}
        </div>

        <aside className={s.wkf}>
          <h3>Формати тижня</h3>
          <table className={s.wf}>
            <thead>
              <tr>
                <th />
                {days.map((dd) => (
                  <th key={dd} className={dd === d ? s.on : undefined}>
                    {DAY_SHORT[dd]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.classes.map((c) => (
                <tr key={c.class_id}>
                  <td>{c.name}</td>
                  {days.map((dd) => {
                    const f = formatOf(c.class_id, dd);
                    return (
                      <td key={dd} className={dd === d ? s.on : undefined}>
                        <span
                          className={`${s.fd} ${f === 'remote' ? s.out : ''}`}
                          title={f === 'remote' ? 'дистанційно' : 'очно'}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.legend}>
            <span>
              <span className={s.fd} /> очно
            </span>
            <span>
              <span className={`${s.fd} ${s.out}`} /> дистанційно
            </span>
          </p>
        </aside>
      </div>
    </>
  );
}

function reasonStatus(
  classId: string,
  name: string,
  day: Day,
  format: 'in_person' | 'remote',
  load: TimetableLoad | undefined,
): Status {
  const r = load?.class_days.find((x) => x.class_id === classId && x.day === day);
  return {
    tone: 'info',
    text: `${name}, ${DAY_FULL[day]}: ${format === 'remote' ? 'дистанційно' : 'очно'}.${r ? ` ${r.reason}.` : ''}`,
  };
}
