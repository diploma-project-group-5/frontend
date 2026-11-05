import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { schoolApi, timetableApi } from '@/api/endpoints';
import type { AccessToken, ClassInput, SchoolClass } from '@/api/types';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  ModalActions,
  ProblemNotice,
  RowActions,
  Spinner,
  Toolbar,
} from '@/ui';
import { IconEdit, IconPlus, IconQr, IconTrash } from '@/ui/icons';
import { QrDialog } from './QrDialog';
import s from './DataPages.module.css';

/**
 * Класи (прототип): рядок — QR, редагувати, архівувати; над таблицею — QR усіх класів і «Додати клас».
 * API: GET/POST /classes, PUT/DEL /classes/{id} (DEL = архівування), GET /access-tokens?type=class.
 */
export function ClassesTab() {
  const classes = useQuery({ queryKey: ['classes'], queryFn: schoolApi.listClasses });
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });
  const tokens = useQuery({
    queryKey: ['access-tokens', 'class'],
    queryFn: () => timetableApi.accessTokens('class'),
    gcTime: 0, // посилання з токенами не тримаємо в кеші довше, ніж відкрита сторінка
  });

  const [qr, setQr] = useState<AccessToken | null>(null);
  const [edit, setEdit] = useState<SchoolClass | 'new' | null>(null);
  const [archive, setArchive] = useState<SchoolClass | null>(null);

  if (classes.isPending) return <Spinner />;
  if (classes.error) return <ProblemNotice error={classes.error} />;

  const days = profile.data ? (profile.data.saturday ? 6 : 5) : 5;
  const cap = days * (profile.data?.lessons_per_day ?? 0);
  const lessonsOf = (id: string) =>
    (plan.data ?? []).filter((r) => r.class_id === id).reduce((n, r) => n + r.hours_per_week, 0);
  const tokenOf = (id: string) => tokens.data?.find((t) => t.target_id === id) ?? null;

  return (
    <>
      <Toolbar>
        <Button
          size="sm"
          onClick={() => window.open('/scheduler/print/qr/class', '_blank', 'noopener')}
        >
          <IconQr width={14} height={14} />
          QR усіх класів
        </Button>
        <Button size="sm" variant="primary" onClick={() => setEdit('new')}>
          <IconPlus width={14} height={14} />
          Додати клас
        </Button>
      </Toolbar>

      <Card>
        <table>
          <thead>
            <tr>
              <th>Клас або група</th>
              <th>Учнів</th>
              <th>Пріоритет очного</th>
              <th>Уроків на тиждень</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {classes.data
              .filter((c) => !c.archived_at)
              .map((c) => {
                const n = lessonsOf(c.class_id);
                return (
                  <tr key={c.class_id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td className={s.num}>{c.students}</td>
                    <td>
                      {c.in_person_priority ? (
                        <Chip tone="in">так</Chip>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className={`${s.num} ${cap && n > cap ? s.over : ''}`}>
                      {n} / {cap || '—'}
                    </td>
                    <td>
                      <RowActions>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!tokenOf(c.class_id)}
                          onClick={() => setQr(tokenOf(c.class_id))}
                        >
                          <IconQr width={15} height={15} />
                          QR
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Редагувати ${c.name}`}
                          onClick={() => setEdit(c)}
                        >
                          <IconEdit width={15} height={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Архівувати ${c.name}`}
                          onClick={() => setArchive(c)}
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
      <ClassForm target={edit} onClose={() => setEdit(null)} existing={classes.data} />
      <ArchiveClass target={archive} onClose={() => setArchive(null)} />
    </>
  );
}

function ClassForm({
  target,
  onClose,
  existing,
}: {
  target: SchoolClass | 'new' | null;
  onClose: () => void;
  existing: SchoolClass[];
}) {
  const editing = target && target !== 'new' ? target : null;
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={editing ? 'Редагувати клас' : 'Новий клас або група'}
    >
      {target && (
        <ClassFormBody
          key={editing?.class_id ?? 'new'}
          editing={editing}
          onClose={onClose}
          existing={existing}
        />
      )}
    </Modal>
  );
}

function ClassFormBody({
  editing,
  onClose,
  existing,
}: {
  editing: SchoolClass | null;
  onClose: () => void;
  existing: SchoolClass[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ClassInput>({
    name: editing?.name ?? '',
    students: editing?.students ?? 28,
    in_person_priority: editing?.in_person_priority ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: ClassInput) =>
      editing ? schoolApi.updateClass(editing.class_id, b) : schoolApi.createClass(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['access-tokens', 'class'] }); // новий клас отримує QR
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return setError('Вкажіть назву');
    if (existing.some((c) => !c.archived_at && c.name === name && c.class_id !== editing?.class_id))
      return setError(`${name} уже існує`);
    setError(null);
    save.mutate({ ...form, name });
  };

  return (
    <form onSubmit={submit} className={s.formStack}>
      <Field label="Назва">
        {(id) => (
          <input
            id={id}
            required
            placeholder="7-В"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
      </Field>
      <Field label="Кількість учнів">
        {(id) => (
          <input
            id={id}
            type="number"
            min={1}
            max={45}
            value={form.students}
            onChange={(e) => setForm({ ...form, students: Number(e.target.value) })}
          />
        )}
      </Field>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={form.in_person_priority}
          onChange={(e) => setForm({ ...form, in_person_priority: e.target.checked })}
        />
        <span>
          Пріоритет очного навчання
          <br />
          <small className="muted">
            Клас переходить на дистанційне останнім. Списків учнів система не веде.
          </small>
        </span>
      </label>
      {error && (
        <p className={s.err} role="alert">
          {error}
        </p>
      )}
      {save.error && <ProblemNotice error={save.error} />}
      <ModalActions>
        <Button onClick={onClose}>Скасувати</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {editing ? 'Зберегти' : 'Створити'}
        </Button>
      </ModalActions>
    </form>
  );
}

function ArchiveClass({ target, onClose }: { target: SchoolClass | null; onClose: () => void }) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (c: SchoolClass) => schoolApi.archiveClass(c.class_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['access-tokens', 'class'] });
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
    },
  });
  const close = () => {
    archive.reset();
    onClose();
  };
  return (
    <Modal open={!!target} onClose={close} title={target ? `Архівувати «${target.name}»?` : ''}>
      <p>
        Клас зникне зі списків і з наступної побудови, а його QR-код перестане працювати. Чинний
        розклад зміниться лише після побудови й публікації.
      </p>
      {archive.error && <ProblemNotice error={archive.error} />}
      <ModalActions>
        <Button onClick={close}>Скасувати</Button>
        <Button
          variant="danger"
          disabled={archive.isPending}
          onClick={() => target && archive.mutate(target)}
        >
          Архівувати
        </Button>
      </ModalActions>
    </Modal>
  );
}
