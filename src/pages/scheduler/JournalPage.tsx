import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { schoolApi } from '@/api/endpoints';
import { addDaysIso, todayKyiv } from '@/lib/time';
import { Card, Field, PageHeader, ProblemNotice, Spinner } from '@/ui';

const timeFmt = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Журнал дій закладу: GET /audit?from=&to=&target= (період обов'язковий).
 * Без прізвищ — «Вчитель #N»; зберігається 1 рік.
 */
export function JournalPage() {
  const [from, setFrom] = useState(addDaysIso(todayKyiv(), -30));
  const [to, setTo] = useState(todayKyiv());
  const audit = useQuery({
    queryKey: ['audit', from, to],
    queryFn: () => schoolApi.audit({ from, to }),
  });

  return (
    <>
      <PageHeader title="Журнал" />
      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <Field label="З">
            {(id) => (
              <input
                id={id}
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </Field>
          <Field label="По">
            {(id) => (
              <input
                id={id}
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </Field>
        </div>
        {audit.isPending && <Spinner />}
        {audit.error && <ProblemNotice error={audit.error} />}
        {audit.data && (
          <table>
            <thead>
              <tr>
                <th>Час</th>
                <th>Хто</th>
                <th>Дія</th>
                <th>Над ким</th>
                <th>Деталі</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((e) => (
                <tr key={e.entry_id}>
                  <td className="mono">{timeFmt.format(new Date(e.at))}</td>
                  <td>{e.actor}</td>
                  <td>{e.action}</td>
                  <td>{e.target ?? '—'}</td>
                  <td className="muted">
                    {Object.entries(e.details)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(', ')}
                  </td>
                </tr>
              ))}
              {audit.data.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    За цей період записів немає
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
