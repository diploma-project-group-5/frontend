import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { timetableApi } from '@/api/endpoints';
import type { Holidays } from '@/api/types';
import { formatDate } from '@/lib/time';
import { Button, Card, Field, ProblemNotice, Spinner, Stack } from '@/ui';
import { IconPlus, IconTrash } from '@/ui/icons';
import s from './DataPages.module.css';

/**
 * Календар (прототип) ↔ GET/PUT /holidays (специфікація v24, етап 2).
 * API зберігає одну пару дат канікул без назви: вільного тексту немає, бо на сторінці за QR
 * web показує фіксований «Канікули з … по …» (захист від витоку ПД і XSS).
 */
export function CalendarTab() {
  const qc = useQueryClient();
  const holidays = useQuery({ queryKey: ['holidays'], queryFn: timetableApi.getHolidays });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (h: Holidays) => timetableApi.putHolidays(h),
    onSuccess: (h) => {
      qc.setQueryData(['holidays'], h);
      setFrom('');
      setTo('');
    },
  });

  if (holidays.isPending) return <Spinner />;
  if (holidays.error) return <ProblemNotice error={holidays.error} />;
  const h = holidays.data;
  const set = !!h.holiday_from && !!h.holiday_to;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setError('Вкажіть обидві дати.');
    if (to < from) return setError('Дата «по» раніша за «з».');
    setError(null);
    save.mutate({ holiday_from: from, holiday_to: to });
  };

  return (
    <Card className={s.narrow}>
      <Stack>
        <p className="muted">
          Канікули: у ці дати уроків немає, а сторінки за QR показують «Канікули з … по …».
          Навчальні дні — пн–пт, субота вмикається у вкладці «Заклад».
        </p>

        {set ? (
          <div className={s.offRow}>
            <span>
              <b>Канікули</b>{' '}
              <span className="muted mono">
                {formatDate(h.holiday_from!)} – {formatDate(h.holiday_to!)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Прибрати канікули"
              disabled={save.isPending}
              onClick={() => save.mutate({ holiday_from: null, holiday_to: null })}
            >
              <IconTrash />
            </Button>
          </div>
        ) : (
          <p className="muted">Канікул не задано</p>
        )}

        <form onSubmit={submit}>
          <Stack>
            <div className={s.f2}>
              <Field label="З">
                {(id) => (
                  <input
                    id={id}
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                )}
              </Field>
              <Field label="По">
                {(id) => (
                  <input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                )}
              </Field>
            </div>
            {error && (
              <p className={s.err} role="alert">
                {error}
              </p>
            )}
            {save.error && <ProblemNotice error={save.error} />}
            <div>
              <Button type="submit" size="sm" disabled={save.isPending}>
                <IconPlus width={14} height={14} />
                {set ? 'Замінити канікули' : 'Додати'}
              </Button>
            </div>
            {set && <p className="muted">У MVP — одна пара дат: нові дати замінять поточні.</p>}
          </Stack>
        </form>
      </Stack>
    </Card>
  );
}
