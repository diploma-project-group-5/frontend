import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { timetableApi } from '@/api/endpoints';
import type { PublishResponse, TimetableDetail } from '@/api/types';
import { mainPhases } from '@/lib/phases';
import { compareLabels, sortByLabel } from '@/lib/sort';
import { DAY_SHORT, peaksText, todayKyiv } from '@/lib/time';
import { Card, FormatBadge, Notice, PageHeader, ProblemNotice, Spinner, Stack } from '@/ui';
import { PublishedNotice, PublishForm } from './PublishForm';

/**
 * «Погодження» (прототип) = :publish з реквізитами наказу (розділ 05).
 * Система лише пропонує — керівник затверджує наказом, укладач публікує.
 */
export function ApprovalPage() {
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ['timetables'], queryFn: timetableApi.list });
  const [published, setPublished] = useState<{ res: PublishResponse; from: string } | null>(null);

  if (list.isPending) return <Spinner />;
  if (list.error) return <ProblemNotice error={list.error} />;

  const candidates = list.data.filter((v) => v.state === 'validated');
  const selectedId = params.get('version') ?? candidates[0]?.timetable_id;
  const selected = candidates.find((v) => v.timetable_id === selectedId);
  const { current } = mainPhases(list.data, todayKyiv());

  return (
    <>
      <PageHeader title="Погодження" />
      {published && <PublishedNotice res={published.res} effectiveFrom={published.from} />}
      {candidates.length === 0 ? (
        !published && (
          <Card>
            <p>
              Немає версій, що чекають на погодження. Побудуйте нову у розділі{' '}
              <Link to="/scheduler/timetables">«Розклад»</Link>.
            </p>
          </Card>
        )
      ) : (
        <Stack>
          <Card>
            <label className="row">
              <b>Версія для погодження</b>
              <select
                value={selectedId}
                onChange={(e) => setParams({ version: e.target.value }, { replace: true })}
              >
                {candidates.map((v) => (
                  <option key={v.timetable_id} value={v.timetable_id}>
                    {v.timetable_id.slice(0, 8)} · модель {v.model}
                    {v.data_changed_since_build ? ' · дані змінилися' : ''}
                  </option>
                ))}
              </select>
              <Link to={`/scheduler/timetables/${selectedId}`}>Переглянути сітку</Link>
            </label>
          </Card>

          {selected?.data_changed_since_build && (
            <Notice tone="warn">
              <p>
                Дані закладу змінилися після побудови. Під час публікації версію перевірять на
                свіжих даних; якщо вона їх порушує, опублікувати її не вийде — доведеться
                перебудувати. Навантаження нижче пораховано за даними на момент побудови.
              </p>
            </Notice>
          )}

          {selected && (
            <ChangesVsCurrent
              key={selected.timetable_id}
              id={selected.timetable_id}
              currentId={current?.timetable_id}
              changed={!!selected.data_changed_since_build}
            />
          )}

          {selected && (
            <Card>
              <h2>Погодити й опублікувати</h2>
              <PublishForm
                key={selected.timetable_id}
                timetableId={selected.timetable_id}
                onPublished={(res, from) => setPublished({ res, from })}
              />
            </Card>
          )}
        </Stack>
      )}
    </>
  );
}

/** Зміни формату днів класів відносно чинної версії — що відчують родини. */
function ChangesVsCurrent({
  id,
  currentId,
  changed,
}: {
  id: string;
  currentId?: string;
  /** дані закладу змінилися після побудови — ліміти в піку застарілі */
  changed: boolean;
}) {
  const next = useQuery({ queryKey: ['timetable', id], queryFn: () => timetableApi.get(id) });
  const cur = useQuery({
    queryKey: ['timetable', currentId],
    queryFn: () => timetableApi.get(currentId!),
    enabled: !!currentId,
  });
  const load = useQuery({
    queryKey: ['timetable', id, 'load'],
    queryFn: () => timetableApi.load(id),
  });

  if (next.isPending || (currentId && cur.isPending)) return <Spinner />;
  if (next.error) return <ProblemNotice error={next.error} />;

  const rows = cur.data ? formatChanges(cur.data, next.data) : [];
  const without = (load.data?.summary.classes_without_in_person_days ?? []).map(
    (cid) => next.data.classes.find((c) => c.class_id === cid)?.name ?? cid.slice(0, 8),
  );

  return (
    <Card>
      <h2>
        {cur.data ? `Зміни відносно чинної · ${rows.length} днів класів` : 'Чинної версії ще немає'}
      </h2>
      {load.data && (
        <p className="muted">
          Дистанційних класо-днів: {load.data.summary.remote_class_days} · пік навантаження:{' '}
          {peaksText(load.data)}
          {changed && ' (ліміт на момент побудови)'} · класів без очних днів: {without.length}
        </p>
      )}
      {without.length > 0 && (
        <Notice tone="warn">
          <p>Класи без жодного очного дня на тижні: {sortByLabel(without, (x) => x).join(', ')}.</p>
        </Notice>
      )}
      {cur.data &&
        (rows.length === 0 ? (
          <p className="muted">Формати днів не змінюються.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Клас</th>
                <th>День</th>
                <th>Було</th>
                <th>Стане</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.class_id}-${r.day}`}>
                  <td>{r.className}</td>
                  <td>{DAY_SHORT[r.day]}</td>
                  <td>{r.was ? <FormatBadge format={r.was} /> : '—'}</td>
                  <td>
                    <FormatBadge format={r.now} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </Card>
  );
}

function formatChanges(cur: TimetableDetail, next: TimetableDetail) {
  const rows = next.day_formats
    .map((f) => {
      const was = cur.day_formats.find((x) => x.class_id === f.class_id && x.day === f.day)?.format;
      return {
        class_id: f.class_id,
        day: f.day,
        className: next.classes.find((c) => c.class_id === f.class_id)?.name ?? '',
        was,
        now: f.format,
      };
    })
    .filter((r) => r.was !== r.now);
  // клас за класом (1-А, 2-А … 10-А), у межах класу — за днями
  return rows.sort((a, b) => compareLabels(a.className, b.className) || a.day - b.day);
}
