import { config } from '@/config';
import { jobPollInterval } from './useJob';

describe('jobPollInterval', () => {
  const q = (status: string, state?: 'queued' | 'running' | 'done' | 'failed') => ({
    state: { status, data: state ? { state } : undefined },
  });

  it('опитує, поки задача рахується', () => {
    expect(jobPollInterval(q('pending'))).toBe(config.jobPollMs);
    expect(jobPollInterval(q('success', 'queued'))).toBe(config.jobPollMs);
    expect(jobPollInterval(q('success', 'running'))).toBe(config.jobPollMs);
  });

  it('зупиняється на кінцевому стані', () => {
    expect(jobPollInterval(q('success', 'done'))).toBe(false);
    expect(jobPollInterval(q('success', 'failed'))).toBe(false);
  });

  it('зупиняється після помилки запиту — і без даних, і з попереднім станом', () => {
    expect(jobPollInterval(q('error'))).toBe(false);
    expect(jobPollInterval(q('error', 'running'))).toBe(false);
  });
});
