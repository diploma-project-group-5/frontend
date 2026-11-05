import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { schoolApi, timetableApi } from '@/api/endpoints';
import type { Day, TimetableDetail, TimetableLoad } from '@/api/types';
import { DAY_SHORT, formatDate } from '@/lib/time';
import { Badge, Card, FormatBadge, Notice, PageHeader, ProblemNotice, Spinner, Stack } from '@/ui';
import s from './TimetablePage.module.css';

export function TimetablePage() {
  const { id = '' } = useParams();
  const tt = useQuery({ queryKey: ['timetable', id], queryFn: () => timetableApi.get(id) });
  const load = useQuery({
    queryKey: ['timetable', id, 'load'],
    queryFn: () => timetableApi.load(id),
  });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });

  if (tt.isPending) return <Spinner />;
  if (tt.error) return <ProblemNotice error={tt.error} />;

  const v = tt.data;
  return (
    <>
      <PageHeader
        title={`Версія ${v.timetable_id.slice(0, 8)} · модель ${v.model}`}
        actions={
          v.state === 'published' ? (
            <Badge>
              Опубліковано, діє з {v.effective_from ? formatDate(v.effective_from) : '—'}
            </Badge>
          ) : (
            <>
              <Badge>Перевірена, не опублікована</Badge>
              {v.kind === 'main' && (
                <Link to={`/scheduler/approval?version=${v.timetable_id}`}>До погодження →</Link>
              )}
            </>
          )
        }
      />
      <Stack>
        {load.isPending && <Spinner label="Рахуємо навантаження укриття…" />}
        {load.error && <ProblemNotice error={load.error} />}
        {load.data && <LoadPanel load={load.data} />}

        <Card>
          <h2>Сітка уроків</h2>
          <Grid
            tt={v}
            subjectName={(sid) =>
              subjects.data?.find((x) => x.subject_id === sid)?.short_name ?? '…'
            }
            reasons={load.data?.class_days}
          />
        </Card>
      </Stack>
    </>
  );
}

function LoadPanel({ load }: { load: TimetableLoad }) {
  const { summary } = load;
  return (
    <Card>
      <h2>Навантаження укриття по днях</h2>
      {!load.validation.ok && (
        <Notice tone="bad">
          <p>Перевірка знайшла порушення:</p>
          <ul>
            {load.validation.conflicts.map((c, i) => (
              <li key={i}>{c.message ?? c.rule}</li>
            ))}
          </ul>
        </Notice>
      )}
      <table className={s.load}>
        <thead>
          <tr>
            <th>День</th>
            <th>Усі люди / паспортна місткість</th>
            {load.model === '1.2' && <th>Учні / навчальні місця</th>}
          </tr>
        </thead>
        <tbody>
          {load.days.map((d) => (
            <tr key={d.day}>
              <td>{DAY_SHORT[d.day]}</td>
              <td>
                <Meter {...d.passport} />
              </td>
              {load.model === '1.2' && <td>{d.seats && <Meter {...d.seats} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className={s.summary}>
        <dt>Дистанційних класо-днів</dt>
        <dd>{summary.remote_class_days}</dd>
        <dt>Пік</dt>
        <dd>
          {summary.peak.load} / {summary.peak.limit} ({DAY_SHORT[summary.peak.day]})
        </dd>
        <dt>Час побудови</dt>
        <dd>{(summary.build_ms / 1000).toFixed(1)} с</dd>
        <dt>Класи без очних днів</dt>
        <dd>
          {summary.classes_without_in_person_days.length === 0 ? (
            'немає'
          ) : (
            <Badge tone="sub">{summary.classes_without_in_person_days.length}</Badge>
          )}
        </dd>
      </dl>
    </Card>
  );
}

function Meter({ load, limit }: { load: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((load / limit) * 100)) : 0;
  const over = load > limit;
  return (
    <div className={s.meter}>
      <div className={s.bar}>
        <div className={over ? s.fillOver : s.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className="mono">
        {load} / {limit}
      </span>
    </div>
  );
}

function Grid({
  tt,
  subjectName,
  reasons,
}: {
  tt: TimetableDetail;
  subjectName: (id: string) => string;
  reasons?: TimetableLoad['class_days'];
}) {
  const days = useMemo(
    () => [...new Set(tt.day_formats.map((f) => f.day))].sort() as Day[],
    [tt.day_formats],
  );
  const [day, setDay] = useState<Day>(days[0] ?? 1);
  const maxLesson = Math.max(0, ...tt.lessons.map((l) => l.lesson_no));
  const teacher = (id: string) => tt.teachers.find((t) => t.teacher_id === id)?.label ?? '';

  return (
    <>
      <div className={s.tabs} role="tablist">
        {days.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            className={d === day ? s.tabActive : s.tab}
            onClick={() => setDay(d)}
          >
            {DAY_SHORT[d]}
          </button>
        ))}
      </div>
      <div className={s.gridWrap}>
        <table className={s.grid}>
          <thead>
            <tr>
              <th>Клас</th>
              {Array.from({ length: maxLesson }, (_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tt.classes.map((c) => {
              const fmt = tt.day_formats.find((f) => f.class_id === c.class_id && f.day === day);
              const reason = reasons?.find((r) => r.class_id === c.class_id && r.day === day);
              return (
                <tr key={c.class_id}>
                  <th title={reason?.reason}>
                    {c.name} {fmt && <FormatBadge format={fmt.format} />}
                  </th>
                  {Array.from({ length: maxLesson }, (_, i) => {
                    const l = tt.lessons.find(
                      (x) => x.class_id === c.class_id && x.day === day && x.lesson_no === i + 1,
                    );
                    return (
                      <td key={i}>
                        {l && (
                          <>
                            <b>{subjectName(l.subject_id)}</b>
                            <small className="muted">{teacher(l.teacher_id)}</small>
                          </>
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
      <p className="muted">Наведіть на клас, щоб побачити причину формату дня.</p>
    </>
  );
}
