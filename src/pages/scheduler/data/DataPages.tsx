import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Outlet } from 'react-router';
import { schoolApi, timetableApi } from '@/api/endpoints';
import type { AccessToken, SchoolProfile } from '@/api/types';
import { DAY_SHORT } from '@/lib/time';
import {
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  ProblemNotice,
  Spinner,
  RowActions,
  Stack,
  TabLinks,
  Toolbar,
} from '@/ui';
import { IconQr } from '@/ui/icons';
import { QrDialog } from './QrDialog';
import s from './DataPages.module.css';

export { CalendarTab } from './CalendarTab';
export { ClassesTab } from './ClassesTab';
export { SubjectsTab } from './SubjectsTab';

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

// ───────────── Вчителі ─────────────

export function TeachersTab() {
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });
  const tokens = useQuery({
    queryKey: ['access-tokens', 'teacher'],
    queryFn: () => timetableApi.accessTokens('teacher'),
    gcTime: 0, // посилання з токенами не тримаємо в кеші довше, ніж відкрита сторінка
  });
  const [qr, setQr] = useState<AccessToken | null>(null);

  if (teachers.isPending) return <Spinner />;
  if (teachers.error) return <ProblemNotice error={teachers.error} />;
  const tokenOf = (id: string) => tokens.data?.find((t) => t.target_id === id) ?? null;

  return (
    <>
      <Toolbar>
        <Button
          size="sm"
          onClick={() => window.open('/scheduler/print/qr/teacher', '_blank', 'noopener')}
        >
          <IconQr width={14} height={14} />
          QR і повідомлення про ПД для всіх
        </Button>
      </Toolbar>
      <Card>
        <p className="muted">
          Система зберігає лише підпис, тижневий ліміт і недоступні дні. Повного імені, телефону й
          пошти немає. Учні й батьки підписів вчителів не бачать.
        </p>
        <table>
          <thead>
            <tr>
              <th>Підпис</th>
              <th>Ліміт, год/тиж</th>
              <th>Недоступні дні</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {teachers.data.map((t) => (
              <tr key={t.teacher_id}>
                <td>
                  <b>{t.label}</b> <span className="muted">#{t.teacher_no}</span>
                </td>
                <td>{t.weekly_hours_limit}</td>
                <td>
                  {t.unavailable_days.length
                    ? t.unavailable_days.map((d) => DAY_SHORT[d]).join(', ')
                    : '—'}
                </td>
                <td>
                  <RowActions>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!tokenOf(t.teacher_id)}
                      onClick={() => setQr(tokenOf(t.teacher_id))}
                    >
                      <IconQr width={15} height={15} />
                      QR
                    </Button>
                  </RowActions>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <QrDialog token={qr} onClose={() => setQr(null)} />
    </>
  );
}

// ───────────── Навчальний план ─────────────

export function CurriculumTab() {
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });

  const err = plan.error ?? classes.error ?? subjects.error ?? teachers.error;
  if (err) return <ProblemNotice error={err} />;
  if (!plan.data || !classes.data || !subjects.data || !teachers.data) return <Spinner />;

  const teacherHours = new Map<string, number>();
  for (const r of plan.data) {
    teacherHours.set(r.teacher_id, (teacherHours.get(r.teacher_id) ?? 0) + r.hours_per_week);
  }

  return (
    <Stack>
      {teachers.data
        .filter((t) => (teacherHours.get(t.teacher_id) ?? 0) > t.weekly_hours_limit)
        .map((t) => (
          <Notice key={t.teacher_id} tone="warn">
            <p>
              {t.label}: {teacherHours.get(t.teacher_id)} год при ліміті {t.weekly_hours_limit}
            </p>
          </Notice>
        ))}
      <div className={s.planGrid}>
        {classes.data
          .filter((c) => !c.archived_at)
          .map((c) => {
            const rows = plan.data.filter((r) => r.class_id === c.class_id);
            const total = rows.reduce((sum, r) => sum + r.hours_per_week, 0);
            return (
              <Card key={c.class_id}>
                <div className={s.cardHead}>
                  <h3>{c.name}</h3>
                  <span className="muted">{total} год/тиж</span>
                </div>
                <table>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.subject_id}>
                        <td>{subjects.data.find((x) => x.subject_id === r.subject_id)?.name}</td>
                        <td className="muted">
                          {teachers.data.find((t) => t.teacher_id === r.teacher_id)?.label}
                        </td>
                        <td>{r.hours_per_week}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
      </div>
    </Stack>
  );
}
