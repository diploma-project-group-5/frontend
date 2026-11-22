import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { timetableApi } from './endpoints';
import { TERMINAL_JOB_STATES, type Job } from './types';

export function isTerminal(job: Pick<Job, 'state'> | undefined): boolean {
  return !!job && TERMINAL_JOB_STATES.includes(job.state);
}

/**
 * Інтервал опитування: зупиняємось на кінцевому стані і після помилки запиту (404 на задачу з
 * минулої сесії, 5xx). Інакше опитування йде вічно, а кнопка побудови лишається заблокованою.
 * Повторити — job.refetch() (кнопка «Оновити стан») або нова побудова.
 */
export function jobPollInterval(q: {
  state: { status: string; data: Pick<Job, 'state'> | undefined };
}): number | false {
  if (q.state.status === 'error' || isTerminal(q.state.data)) return false;
  return config.jobPollMs;
}

/**
 * Довгі операції повертають 202 + job_id; стан — опитуванням GET /jobs/{job_id}
 * (розділ 07). Опитування зупиняється на кінцевому стані або після помилки запиту.
 */
export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => timetableApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: jobPollInterval,
    refetchIntervalInBackground: true,
  });
}

export const JOB_STATE_LABEL: Record<Job['state'], string> = {
  queued: 'У черзі',
  running: 'Рахується',
  done: 'Готово',
  infeasible: 'Розв’язку немає',
  rejected: 'Відхилено перевіркою',
  timeout: 'Не встигли за ліміт часу',
  failed: 'Технічний збій',
};

/**
 * Людські пояснення кодів job.error (timetable-service domain/jobs.ts). Без них rejected від
 * validator-lib і rejected через заблокований план виглядали однаково — «Відхилено перевіркою».
 */
const JOB_ERROR_TEXT: Record<string, string> = {
  validator_rejected:
    'Незалежна перевірка (validator-lib) не прийняла розклад від солвера. Порушені правила — нижче.',
  invalid_snapshot: 'Дані закладу для побудови некоректні. Перевірте «Дані закладу» й повторіть.',
  alert_plan_locked:
    'План тривог уже погоджено або активовано, тому результат побудови не застосовано.',
  deadline_exceeded: 'Задача задовго чекала в черзі й була скасована. Спробуйте ще раз.',
  unsupported_job_type: 'Рушій розрахунку на сервері не підтримує цей тип задачі.',
};

/** Пояснення кінцевого стану задачі: текст за кодом error або null, якщо коду немає. */
export function jobErrorText(error: string | null | undefined): string | null {
  if (!error) return null;
  return JOB_ERROR_TEXT[error] ?? `Код збою: ${error}`;
}
