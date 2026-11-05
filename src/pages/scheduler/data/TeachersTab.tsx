import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { schoolApi, timetableApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { AccessToken, CurriculumRow, Day, Teacher, TeacherInput } from '@/api/types';
import { DAY_SHORT } from '@/lib/time';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  ModalActions,
  Notice,
  ProblemNotice,
  RowActions,
  Spinner,
  Toolbar,
} from '@/ui';
import { IconCopy, IconEdit, IconPlus, IconQr, IconTrash } from '@/ui/icons';
import { QrDialog } from './QrDialog';
import s from './DataPages.module.css';

/**
 * Вчителі (прототип): Підпис · Предмети · Годин / ліміт · Недоступні дні · QR, редагувати,
 * експорт, видалити. API: GET/POST /teachers, PUT /teachers/{id}; етап 2 — DEL (ст. 15) і export (ст. 8).
 * «Предмети» й «Годин» — з навчального плану: у API вчитель має лише підпис, ліміт і недоступні дні.
 */
export function TeachersTab() {
  const teachers = useQuery({ queryKey: ['teachers'], queryFn: schoolApi.listTeachers });
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const tokens = useQuery({
    queryKey: ['access-tokens', 'teacher'],
    queryFn: () => timetableApi.accessTokens('teacher'),
    gcTime: 0, // посилання з токенами не тримаємо в кеші довше, ніж відкрита сторінка
  });
  const [qr, setQr] = useState<AccessToken | null>(null);
  const [edit, setEdit] = useState<Teacher | 'new' | null>(null);
  const [remove, setRemove] = useState<Teacher | null>(null);
  const [exp, setExp] = useState<Teacher | null>(null);

  if (teachers.isPending) return <Spinner />;
  if (teachers.error) return <ProblemNotice error={teachers.error} />;

  const rows = plan.data ?? [];
  const hoursOf = (id: string) =>
    rows.filter((r) => r.teacher_id === id).reduce((n, r) => n + r.hours_per_week, 0);
  const subjectsOf = (id: string) => [
    ...new Set(rows.filter((r) => r.teacher_id === id).map((r) => r.subject_id)),
  ];
  const short = (id: string) => subjects.data?.find((x) => x.subject_id === id)?.short_name ?? '…';
  const tokenOf = (id: string) => tokens.data?.find((t) => t.target_id === id) ?? null;
  const active = teachers.data.filter((t) => !t.deleted_at);

  // як у прототипі: новий вчитель одразу отримує QR з повідомленням про ПД
  const onCreated = (t: Teacher) =>
    void tokens
      .refetch()
      .then((r) => setQr(r.data?.find((x) => x.target_id === t.teacher_id) ?? null));

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
        <Button size="sm" variant="primary" onClick={() => setEdit('new')}>
          <IconPlus width={14} height={14} />
          Додати вчителя
        </Button>
      </Toolbar>

      <Card>
        <table>
          <thead>
            <tr>
              <th>Підпис</th>
              <th>Предмети</th>
              <th>Годин / ліміт</th>
              <th>Недоступні дні</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {active.map((t) => {
              const h = hoursOf(t.teacher_id);
              const subs = subjectsOf(t.teacher_id);
              return (
                <tr key={t.teacher_id}>
                  <td>
                    <b>{t.label}</b>
                  </td>
                  <td>
                    {subs.length ? (
                      <span className={s.chips}>
                        {subs.map((id) => (
                          <Chip key={id}>{short(id)}</Chip>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className={`${s.num} ${h > t.weekly_hours_limit ? s.over : ''}`}>
                    {h} / {t.weekly_hours_limit}
                  </td>
                  <td>
                    {t.unavailable_days.length ? (
                      t.unavailable_days.map((d) => DAY_SHORT[d]).join(', ')
                    ) : (
                      <span className="muted">—</span>
                    )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Редагувати ${t.label}`}
                        onClick={() => setEdit(t)}
                      >
                        <IconEdit width={15} height={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Експорт даних вчителя"
                        aria-label={`Експорт даних ${t.label}`}
                        onClick={() => setExp(t)}
                      >
                        <IconCopy width={15} height={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Видалити ${t.label}`}
                        onClick={() => setRemove(t)}
                      >
                        <IconTrash width={15} height={15} />
                      </Button>
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <QrDialog token={qr} onClose={() => setQr(null)} />
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && edit !== 'new' ? 'Редагувати вчителя' : 'Новий вчитель'}
      >
        {edit && (
          <TeacherForm
            key={edit === 'new' ? 'new' : edit.teacher_id}
            editing={edit === 'new' ? null : edit}
            existing={active}
            onClose={() => setEdit(null)}
            onCreated={onCreated}
          />
        )}
      </Modal>
      <DeleteTeacher target={remove} plan={rows} onClose={() => setRemove(null)} />
      <ExportTeacher target={exp} onClose={() => setExp(null)} />
    </>
  );
}

function TeacherForm({
  editing,
  existing,
  onClose,
  onCreated,
}: {
  editing: Teacher | null;
  existing: Teacher[];
  onClose: () => void;
  onCreated: (t: Teacher) => void;
}) {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  const days: Day[] = profile.data?.saturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const [form, setForm] = useState<TeacherInput>({
    label: editing?.label ?? '',
    weekly_hours_limit: editing?.weekly_hours_limit ?? 18,
    unavailable_days: editing?.unavailable_days ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: TeacherInput) =>
      editing ? schoolApi.updateTeacher(editing.teacher_id, b) : schoolApi.createTeacher(b),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['teachers'] });
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
      if (!editing) onCreated(t);
    },
  });

  const toggleDay = (d: Day) =>
    setForm((f) => ({
      ...f,
      unavailable_days: f.unavailable_days.includes(d)
        ? f.unavailable_days.filter((x) => x !== d)
        : [...f.unavailable_days, d].sort(),
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) return setError('Вкажіть підпис');
    if (existing.some((t) => t.label === label && t.teacher_id !== editing?.teacher_id))
      return setError('Підпис має бути унікальним');
    setError(null);
    save.mutate({ ...form, label });
  };

  return (
    <form onSubmit={submit} className={s.formStack}>
      <Field label="Підпис у розкладі" hint="Прізвище з ініціалами або «Математика-1»">
        {(id) => (
          <input
            id={id}
            required
            placeholder="Петренко О. І."
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        )}
      </Field>
      <Field label="Тижневий ліміт годин (ставка)">
        {(id) => (
          <input
            id={id}
            type="number"
            min={1}
            max={36}
            value={form.weekly_hours_limit}
            onChange={(e) => setForm({ ...form, weekly_hours_limit: Number(e.target.value) })}
          />
        )}
      </Field>
      <fieldset className={s.fieldset}>
        <legend>Постійно недоступні дні</legend>
        <div className={s.checks}>
          {days.map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={form.unavailable_days.includes(d)}
                onChange={() => toggleDay(d)}
              />
              {DAY_SHORT[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted">
        Предмети й години вчителя задаються в «Навчальному плані». Система зберігає лише підпис,
        ліміт і недоступні дні: повного імені, телефону й пошти немає, причини відсутності не
        зберігаються.
      </p>
      {error && (
        <p className={s.err} role="alert">
          {error}
        </p>
      )}
      {save.error && <ProblemNotice error={save.error} />}
      <ModalActions>
        <Button onClick={onClose}>Скасувати</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {editing ? 'Зберегти' : 'Додати'}
        </Button>
      </ModalActions>
    </form>
  );
}

function DeleteTeacher({
  target,
  plan,
  onClose,
}: {
  target: Teacher | null;
  plan: CurriculumRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const del = useMutation({
    mutationFn: (t: Teacher) => schoolApi.deleteTeacher(t.teacher_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teachers'] });
      void qc.invalidateQueries({ queryKey: ['access-tokens', 'teacher'] });
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
    },
  });
  const close = () => {
    del.reset();
    onClose();
  };

  // 409 від сервера або вже видно з плану: вчителя призначено в класах
  const usedIn = target
    ? [
        ...new Set(
          plan
            .filter((r) => r.teacher_id === target.teacher_id && r.hours_per_week > 0)
            .map((r) => classes.data?.find((c) => c.class_id === r.class_id)?.name ?? r.class_id),
        ),
      ]
    : [];
  const inUse = usedIn.length > 0 || (isApiError(del.error) && del.error.status === 409);

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={
        target
          ? inUse
            ? `«${target.label}» ще використовується`
            : `Видалити дані вчителя «${target.label}»?`
          : ''
      }
    >
      {target && inUse ? (
        <>
          <p>
            Спершу перепризначте уроки в навчальному плані
            {usedIn.length ? `: ${usedIn.join(', ')}` : ''}.
          </p>
          <ModalActions>
            <Button onClick={close}>Зрозуміло</Button>
          </ModalActions>
        </>
      ) : (
        target && (
          <>
            <p>
              Підпис і QR-код буде видалено. В історії розкладів і журналі залишиться «Вчитель #
              {target.teacher_no}» (ст. 15 Закону № 2297-VI).
            </p>
            {del.error && <ProblemNotice error={del.error} />}
            <ModalActions>
              <Button onClick={close}>Скасувати</Button>
              <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate(target)}>
                Видалити
              </Button>
            </ModalActions>
          </>
        )
      )}
    </Modal>
  );
}

/**
 * Експорт (ст. 8): web збирає частини school-service і timetable-service в один JSON (розділ 09).
 * Якщо маршрут timetable ще не готовий, показуємо частину school і пояснення (запасний варіант).
 */
function ExportTeacher({ target, onClose }: { target: Teacher | null; onClose: () => void }) {
  const data = useQuery({
    queryKey: ['teacher-export', target?.teacher_id],
    enabled: !!target,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const id = target!.teacher_id;
      const [school, timetable] = await Promise.allSettled([
        schoolApi.exportTeacher(id),
        timetableApi.exportTeacher(id),
      ]);
      if (school.status === 'rejected') throw school.reason;
      return {
        json: {
          school: school.value,
          ...(timetable.status === 'fulfilled' ? { timetable: timetable.value } : {}),
        },
        timetableMissing: timetable.status === 'rejected',
      };
    },
  });

  const download = () => {
    if (!data.data || !target) return;
    const blob = new Blob([JSON.stringify(data.data.json, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vchytel-${target.teacher_no}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Дані вчителя: ${target.label}` : ''}>
      <p className="muted">Усе, що система зберігає про цю людину (ст. 8 Закону № 2297-VI).</p>
      {data.isPending && <Spinner />}
      {data.error && <ProblemNotice error={data.error} />}
      {data.data && (
        <>
          <pre className={s.json}>{JSON.stringify(data.data.json, null, 2)}</pre>
          {data.data.timetableMissing && (
            <Notice tone="warn">
              <p>
                Частину з розкладу (уроки у версіях, відсутності, заміни) зараз не отримано. Її
                вивантажує адміністратор за описаною процедурою.
              </p>
            </Notice>
          )}
        </>
      )}
      <ModalActions>
        <Button onClick={download} disabled={!data.data}>
          Завантажити JSON
        </Button>
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
      </ModalActions>
    </Modal>
  );
}
