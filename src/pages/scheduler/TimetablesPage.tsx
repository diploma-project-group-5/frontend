import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { timetableApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { TimetableSummary } from '@/api/types';
import { isTerminal, JOB_STATE_LABEL, useJob } from '@/api/useJob';
import { formatDate, publishedPhase, todayKyiv } from '@/lib/time';
import { Badge, Button, Card, Notice, PageHeader, ProblemNotice, Spinner, Stack } from '@/ui';

const ACTIVE_JOB_KEY = 'lad.activeBuildJob';

export function TimetablesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });

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

  const running = !!jobId && !isTerminal(job.data);

  return (
    <>
      <PageHeader
        title="Версії розкладу"
        actions={
          <Button
            variant="primary"
            disabled={build.isPending || running}
            onClick={() => build.mutate()}
          >
            Побудувати розклад
          </Button>
        }
      />
      <Stack>
        {build.error && !(isApiError(build.error) && build.error.status === 409) && (
          <ProblemNotice error={build.error} />
        )}
        {jobId && <JobStatus jobId={jobId} onDismiss={() => setJobId(null)} />}

        <Card>
          {list.isPending && <Spinner />}
          {list.error && <ProblemNotice error={list.error} />}
          {list.data && <VersionsTable versions={list.data} />}
        </Card>
      </Stack>
    </>
  );
}

function JobStatus({ jobId, onDismiss }: { jobId: string; onDismiss: () => void }) {
  const job = useJob(jobId);
  if (job.isPending) return <Spinner label="Запускаємо побудову…" />;
  if (job.error) return <ProblemNotice error={job.error} />;

  const j = job.data;
  if (!isTerminal(j)) {
    return (
      <Notice tone="info">
        <Spinner label={`${JOB_STATE_LABEL[j.state]}… Розрахунок може тривати кілька хвилин.`} />
      </Notice>
    );
  }
  if (j.state === 'done' && j.result && 'timetable_id' in j.result) {
    return (
      <Notice tone="ok">
        <p>
          Побудовано нову версію.{' '}
          <Link to={`/scheduler/timetables/${j.result.timetable_id}`}>
            Відкрити сітку й навантаження
          </Link>{' '}
          · <button onClick={onDismiss}>Закрити</button>
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
            <li key={i}>{c.message ?? c.rule}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}

const PHASE_LABEL = { scheduled: 'Запланована', current: 'Чинна', archived: 'Архівна' } as const;

function VersionsTable({ versions }: { versions: TimetableSummary[] }) {
  const today = todayKyiv();
  const published = versions.filter((v) => v.effective_from).map((v) => v.effective_from!);

  if (versions.length === 0) {
    return <p className="muted">Версій ще немає. Натисніть «Побудувати розклад».</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Версія</th>
          <th>Стан</th>
          <th>Діє з</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {versions.map((v) => (
          <tr key={v.timetable_id}>
            <td>
              <Link to={`/scheduler/timetables/${v.timetable_id}`} className="mono">
                {v.timetable_id.slice(0, 8)}
              </Link>{' '}
              <span className="muted">модель {v.model}</span>
            </td>
            <td>
              {v.state === 'published' && v.effective_from ? (
                <Badge>{PHASE_LABEL[publishedPhase(v.effective_from, published, today)]}</Badge>
              ) : (
                <Badge>Перевірена</Badge>
              )}{' '}
              {v.data_changed_since_build && v.state === 'validated' && (
                <Badge tone="sub">Дані змінилися після побудови</Badge>
              )}
            </td>
            <td>{v.effective_from ? formatDate(v.effective_from) : '—'}</td>
            <td>
              <Link to={`/scheduler/timetables/${v.timetable_id}`}>Відкрити</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
