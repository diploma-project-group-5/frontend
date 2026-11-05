import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { timetableApi } from './endpoints';
import { TERMINAL_JOB_STATES, type Job } from './types';

export function isTerminal(job: Pick<Job, 'state'> | undefined): boolean {
  return !!job && TERMINAL_JOB_STATES.includes(job.state);
}

/**
 * Довгі операції повертають 202 + job_id; стан — опитуванням GET /jobs/{job_id}
 * (розділ 07). Опитування зупиняється на кінцевому стані.
 */
export function useJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => timetableApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (isTerminal(q.state.data) ? false : config.jobPollMs),
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
