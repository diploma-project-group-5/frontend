import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Outlet } from 'react-router';
import { schoolApi } from '@/api/endpoints';
import type { SchoolProfile } from '@/api/types';
import {
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  ProblemNotice,
  Spinner,
  Stack,
  TabLinks,
} from '@/ui';
import s from './DataPages.module.css';

export { CalendarTab } from './CalendarTab';
export { ClassesTab } from './ClassesTab';
export { CurriculumTab } from './CurriculumTab';
export { SubjectsTab } from './SubjectsTab';
export { TeachersTab } from './TeachersTab';

/** «Дані закладу»: вкладки як у прототипі, дані — school-service (розділ 09). */
export function DataLayout() {
  return (
    <>
      <PageHeader title="Дані закладу" />
      <TabLinks
        tabs={[
          ['school', 'Заклад'],
          ['calendar', 'Календар'],
          ['classes', 'Класи'],
          ['teachers', 'Вчителі'],
          ['subjects', 'Предмети'],
          ['curriculum', 'Навчальний план'],
        ]}
      />
      <Outlet />
    </>
  );
}

// ───────────── Заклад: профіль і дзвінки ─────────────

const PROFILE_FIELDS: [keyof SchoolProfile, string, string?][] = [
  ['shelter_capacity', 'Паспортна місткість укриття, осіб'],
  ['non_teaching_staff', 'Непедагогічний персонал у будівлі', 'рахується в ліміт кожного дня'],
  [
    'shelter_seats',
    'Облаштовані навчальні місця в укритті',
    'ліміт учнів для розкладу тривог (1.2)',
  ],
  ['lessons_per_day', 'Уроків на день'],
];

export function SchoolTab() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  const bells = useQuery({ queryKey: ['bells'], queryFn: schoolApi.getBells });
  const [draft, setDraft] = useState<Partial<SchoolProfile> | null>(null);

  const save = useMutation({
    mutationFn: (p: Partial<SchoolProfile>) => schoolApi.putProfile(p),
    onSuccess: (p) => {
      qc.setQueryData(['profile'], p);
      void qc.invalidateQueries({ queryKey: ['timetables'] }); // «дані змінилися після побудови»
      setDraft(null);
    },
  });

  if (profile.isPending) return <Spinner />;
  if (profile.error) return <ProblemNotice error={profile.error} />;
  const p = { ...profile.data, ...draft };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft) save.mutate(draft);
  };

  return (
    <div className={s.cols}>
      <Card>
        <form onSubmit={submit}>
          <Stack>
            <h3>Укриття й навчальний тиждень · {profile.data.name}</h3>
            {PROFILE_FIELDS.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    value={(p[key] as number | null) ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [key]: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                )}
              </Field>
            ))}
            <label className="row">
              <input
                type="checkbox"
                checked={p.saturday}
                onChange={(e) => setDraft((d) => ({ ...d, saturday: e.target.checked }))}
              />
              Субота — навчальний день
            </label>
            {save.error && <ProblemNotice error={save.error} />}
            {save.isSuccess && !draft && (
              <Notice tone="ok">
                <p>Збережено. Чинні версії перевірять на нових даних під час публікації.</p>
              </Notice>
            )}
            <div>
              <Button type="submit" variant="primary" disabled={!draft || save.isPending}>
                Зберегти
              </Button>
            </div>
          </Stack>
        </form>
      </Card>

      <Card>
        <h3>Дзвінки</h3>
        {bells.isPending && <Spinner />}
        {bells.error && <ProblemNotice error={bells.error} />}
        {bells.data && (
          <table>
            <thead>
              <tr>
                <th>Урок</th>
                <th>Початок</th>
                <th>Кінець</th>
              </tr>
            </thead>
            <tbody>
              {bells.data.map((b) => (
                <tr key={b.lesson_no}>
                  <td>{b.lesson_no}</td>
                  <td className="mono">{b.start}</td>
                  <td className="mono">{b.end}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">Дзвінки розкладу тривог задаються окремо — у «Сценаріях».</p>
      </Card>
    </div>
  );
}
