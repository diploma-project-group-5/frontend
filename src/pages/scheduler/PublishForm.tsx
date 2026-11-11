import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { timetableApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { PublishResponse } from '@/api/types';
import { describeConflict, useConflictNames } from '@/lib/conflicts';
import { formatDate, minEffectiveFrom, todayKyiv } from '@/lib/time';
import { Button, Field, Notice, ProblemNotice, Stack } from '@/ui';

/**
 * :publish з реквізитами наказу (розділ 05). Сервер перевіряє версію на свіжому знімку:
 * якщо дані закладу змінилися й версія їх порушує — 409 stale, треба перебудувати.
 */
export function PublishForm({ timetableId }: { timetableId: string }) {
  const qc = useQueryClient();
  const minFrom = minEffectiveFrom();
  const [form, setForm] = useState({
    order_no: '',
    order_date: todayKyiv(),
    approved_by: '',
    effective_from: minFrom,
  });
  const [done, setDone] = useState<PublishResponse | null>(null);
  const names = useConflictNames();

  const publish = useMutation({
    mutationFn: () => timetableApi.publish(timetableId, form),
    onSuccess: (res) => {
      setDone(res);
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      void qc.invalidateQueries({ queryKey: ['timetable', timetableId] });
    },
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    publish.mutate();
  };

  if (done) {
    const lost = done.warnings.lost_substitutions;
    return (
      <Stack>
        <Notice tone="ok">
          <p>Розклад опубліковано, діє з {formatDate(form.effective_from)}.</p>
        </Notice>
        {lost.length > 0 && (
          <Notice tone="warn">
            <p>З цієї дати втратять силу погоджені заміни: {lost.length}.</p>
          </Notice>
        )}
      </Stack>
    );
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <p className="muted">
          Система лише пропонує розклад. Його затверджує керівник закладу наказом, а ви публікуєте з
          реквізитами наказу.
        </p>
        <Field label="Наказ №">
          {(id) => <input id={id} required value={form.order_no} onChange={set('order_no')} />}
        </Field>
        <Field label="Дата наказу">
          {(id) => (
            <input
              id={id}
              type="date"
              required
              value={form.order_date}
              onChange={set('order_date')}
            />
          )}
        </Field>
        <Field label="Затвердив">
          {(id) => (
            <input
              id={id}
              required
              value={form.approved_by}
              onChange={set('approved_by')}
              placeholder="Прізвище І. П., посада"
            />
          )}
        </Field>
        <Field label="Діє з" hint={`Навчальний день не раніше ${formatDate(minFrom)}`}>
          {(id) => (
            <input
              id={id}
              type="date"
              required
              min={minFrom}
              value={form.effective_from}
              onChange={set('effective_from')}
            />
          )}
        </Field>

        {isApiError(publish.error, 'stale') ? (
          <Notice tone="bad">
            <p>
              <b>Дані закладу змінилися</b> після побудови, і ця версія їм уже не відповідає.
              Перебудуйте розклад і опублікуйте нову версію.
            </p>
            {publish.error.conflicts.length > 0 && (
              <ul>
                {publish.error.conflicts.map((c, i) => (
                  <li key={i}>{describeConflict(c, names)}</li>
                ))}
              </ul>
            )}
          </Notice>
        ) : (
          publish.error && <ProblemNotice error={publish.error} />
        )}

        <div>
          <Button type="submit" variant="primary" disabled={publish.isPending}>
            {publish.isPending ? 'Публікуємо…' : 'Опублікувати'}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
