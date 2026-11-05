import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { schoolApi } from '@/api/endpoints';
import type { Bell } from '@/api/types';
import { Button, Card, ProblemNotice, Spinner } from '@/ui';
import s from './DataPages.module.css';

/**
 * Основні дзвінки: GET/PUT /bells (№ уроку → початок, кінець). Рядків стільки, скільки
 * «Уроків на день» у профілі. Дзвінки тривог — окремо, у «Сценаріях» (PUT /alert-plan/bells).
 */
export function BellsCard() {
  const bells = useQuery({ queryKey: ['bells'], queryFn: schoolApi.getBells });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  const qc = useQueryClient();
  // мутація тут, а не у формі: після збереження форма перемонтовується з новими даними
  const save = useMutation({
    mutationFn: (b: Bell[]) => schoolApi.putBells(b),
    onSuccess: (b) => {
      qc.setQueryData(['bells'], b);
      void qc.invalidateQueries({ queryKey: ['timetables'] });
    },
  });

  return (
    <Card>
      <h3>Дзвінки</h3>
      {(bells.isPending || profile.isPending) && <Spinner />}
      {bells.error && <ProblemNotice error={bells.error} />}
      {bells.data && profile.data && (
        <BellsForm
          // нові дані з сервера або інша кількість уроків — форма починається наново
          key={`${bells.dataUpdatedAt}-${profile.data.lessons_per_day}`}
          bells={bells.data}
          count={profile.data.lessons_per_day ?? bells.data.length}
          save={save}
        />
      )}
      <p className="muted">Дзвінки розкладу тривог задаються окремо — у «Сценаріях».</p>
    </Card>
  );
}

type Row = { start: string; end: string };

function validate(rows: Row[]) {
  const errors = new Map<number, string>();
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!r.start || !r.end) errors.set(i, 'вкажіть початок і кінець');
    else if (r.end <= r.start) errors.set(i, 'кінець раніше за початок');
    else if (prev?.end && r.start < prev.end) errors.set(i, 'починається до кінця попереднього');
  });
  return errors;
}

function BellsForm({
  bells,
  count,
  save,
}: {
  bells: Bell[];
  count: number;
  save: UseMutationResult<Bell[], unknown, Bell[]>;
}) {
  const initial: Row[] = Array.from({ length: count }, (_, i) => {
    const b = bells.find((x) => x.lesson_no === i + 1);
    return { start: b?.start ?? '', end: b?.end ?? '' };
  });
  const [rows, setRows] = useState(initial);
  const [shown, setShown] = useState(false); // помилки показуємо після першої спроби зберегти

  const dirty =
    rows.some((r, i) => r.start !== initial[i]!.start || r.end !== initial[i]!.end) ||
    bells.length !== count;
  const errors = validate(rows);

  const set = (i: number, patch: Partial<Row>) => {
    save.reset();
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShown(true);
    if (errors.size) return;
    save.mutate(rows.map((r, i) => ({ lesson_no: i + 1, ...r })));
  };

  return (
    <form onSubmit={submit} noValidate>
      <table>
        <thead>
          <tr>
            <th>Урок</th>
            <th>Початок</th>
            <th>Кінець</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const err = shown ? errors.get(i) : undefined;
            return (
              <tr key={i}>
                <td className={s.num}>{i + 1}</td>
                <td>
                  <input
                    type="time"
                    step={300}
                    aria-label={`Початок уроку ${i + 1}`}
                    aria-invalid={!!err}
                    className={err ? s.miss : undefined}
                    value={r.start}
                    onChange={(e) => set(i, { start: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    step={300}
                    aria-label={`Кінець уроку ${i + 1}`}
                    aria-invalid={!!err}
                    className={err ? s.miss : undefined}
                    value={r.end}
                    onChange={(e) => set(i, { end: e.target.value })}
                  />
                  {err && <div className={s.err}>{err}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {bells.length !== count && (
        <p className="muted">
          Рядків — як «Уроків на день» ({count}); збереження{' '}
          {bells.length > count ? 'прибере' : 'додасть'} дзвінки, щоб кількість збігалася.
        </p>
      )}
      {shown && errors.size > 0 && (
        <p className={s.err} role="alert">
          Виправте час уроків: {[...errors.keys()].map((i) => i + 1).join(', ')}.
        </p>
      )}
      {save.isError && <ProblemNotice error={save.error} />}
      {save.isSuccess && !dirty && (
        <p className="muted" role="status">
          Збережено. Сторінки за QR показують час за чинними дзвінками.
        </p>
      )}
      <div className={s.saveActs}>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setRows(initial);
            setShown(false);
          }}
        >
          Скасувати
        </Button>
        <Button type="submit" size="sm" variant="primary" disabled={!dirty || save.isPending}>
          Зберегти дзвінки
        </Button>
      </div>
    </form>
  );
}
