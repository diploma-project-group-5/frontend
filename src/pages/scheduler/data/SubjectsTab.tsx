import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { schoolApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { EducationArea, Subject, SubjectInput } from '@/api/types';
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
import { IconEdit, IconPlus, IconTrash } from '@/ui/icons';
import s from './DataPages.module.css';

/** 9 освітніх галузей; перші чотири — пріоритетні для очного навчання (рекомендація МОН). */
const AREAS: [EducationArea, string][] = [
  ['math', 'Математична'],
  ['science', 'Природнича'],
  ['language_literature', 'Мовно-літературна'],
  ['civic_history', 'Громадянська та історична'],
  ['informatics', 'Інформатична'],
  ['arts', 'Мистецька'],
  ['technology', 'Технологічна'],
  ['social_health', 'Соціальна та здоров’язбережувальна'],
  ['physical', 'Фізкультурна'],
];
const PRIORITY = new Set<EducationArea>([
  'math',
  'science',
  'language_literature',
  'civic_history',
]);

/**
 * Предмети (прототип): Предмет · Скорочення · В укритті · Хто веде · редагувати / архівувати.
 * API: GET/POST /subjects, PUT/DEL /subjects/{id} (DEL = архівування, 409 — якщо предмет у плані).
 * «Хто веде» — з навчального плану: у API вчитель не має власного списку предметів.
 */
export function SubjectsTab() {
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: schoolApi.listSubjects });
  const plan = useQuery({ queryKey: ['curriculum'], queryFn: schoolApi.getCurriculum });
  const [edit, setEdit] = useState<Subject | 'new' | null>(null);
  const [archive, setArchive] = useState<Subject | null>(null);

  if (subjects.isPending) return <Spinner />;
  if (subjects.error) return <ProblemNotice error={subjects.error} />;

  const teachersOf = (id: string) =>
    new Set((plan.data ?? []).filter((r) => r.subject_id === id).map((r) => r.teacher_id)).size;

  return (
    <>
      <Toolbar>
        <Button size="sm" variant="primary" onClick={() => setEdit('new')}>
          <IconPlus width={14} height={14} />
          Додати предмет
        </Button>
      </Toolbar>

      <Card>
        <table>
          <thead>
            <tr>
              <th>Предмет</th>
              <th>Скорочення</th>
              <th>В укритті</th>
              <th>Хто веде</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {subjects.data
              .filter((x) => !x.archived_at)
              .map((x) => (
                <tr key={x.subject_id}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td>{x.short_name}</td>
                  <td>
                    {x.not_in_shelter ? (
                      <Chip tone="warn">не проводиться</Chip>
                    ) : (
                      <span className="muted">можна</span>
                    )}
                  </td>
                  <td className="muted">{plural(teachersOf(x.subject_id))}</td>
                  <td>
                    <RowActions>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Редагувати ${x.name}`}
                        onClick={() => setEdit(x)}
                      >
                        <IconEdit width={15} height={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Архівувати ${x.name}`}
                        onClick={() => setArchive(x)}
                      >
                        <IconTrash width={15} height={15} />
                      </Button>
                    </RowActions>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && edit !== 'new' ? 'Редагувати предмет' : 'Новий предмет'}
      >
        {edit && (
          <SubjectForm
            key={edit === 'new' ? 'new' : edit.subject_id}
            editing={edit === 'new' ? null : edit}
            onClose={() => setEdit(null)}
          />
        )}
      </Modal>
      <ArchiveSubject target={archive} onClose={() => setArchive(null)} />
    </>
  );
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  const word =
    m10 === 1 && m100 !== 11
      ? 'вчитель'
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)
        ? 'вчителі'
        : 'вчителів';
  return `${n} ${word}`;
}

function SubjectForm({ editing, onClose }: { editing: Subject | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SubjectInput>({
    name: editing?.name ?? '',
    short_name: editing?.short_name ?? '',
    education_area: editing?.education_area ?? 'math',
    not_in_shelter: editing?.not_in_shelter ?? false,
  });
  const save = useMutation({
    mutationFn: (b: SubjectInput) =>
      editing ? schoolApi.updateSubject(editing.subject_id, b) : schoolApi.createSubject(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ ...form, name: form.name.trim(), short_name: form.short_name.trim() });
  };

  return (
    <form onSubmit={submit} className={s.formStack}>
      <Field label="Назва">
        {(id) => (
          <input
            id={id}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
      </Field>
      <Field label="Скорочення в сітці">
        {(id) => (
          <input
            id={id}
            required
            maxLength={5}
            value={form.short_name}
            onChange={(e) => setForm({ ...form, short_name: e.target.value })}
          />
        )}
      </Field>
      <Field
        label="Освітня галузь"
        hint="Уроки пріоритетних галузей солвер ставить в очні дні насамперед"
      >
        {(id) => (
          <select
            id={id}
            value={form.education_area}
            onChange={(e) => setForm({ ...form, education_area: e.target.value as EducationArea })}
          >
            {AREAS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
                {PRIORITY.has(k) ? ' · пріоритетна' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={form.not_in_shelter}
          onChange={(e) => setForm({ ...form, not_in_shelter: e.target.checked })}
        />
        <span>
          Не проводиться в укритті
          <br />
          <small className="muted">
            Діє лише в розкладі тривог (модель 1.2): урок іде на дистанційний день класу.
          </small>
        </span>
      </label>
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

function ArchiveSubject({ target, onClose }: { target: Subject | null; onClose: () => void }) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (x: Subject) => schoolApi.archiveSubject(x.subject_id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      void qc.invalidateQueries({ queryKey: ['timetables'] });
      onClose();
    },
  });
  const close = () => {
    archive.reset();
    onClose();
  };
  // 409 — предмет у навчальному плані: як у прототипі, «ще використовується»
  const inUse = isApiError(archive.error) && archive.error.status === 409;

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={
        target
          ? inUse
            ? `«${target.name}» ще використовується`
            : `Архівувати «${target.name}»?`
          : ''
      }
    >
      {inUse ? (
        <>
          <p>Спершу приберіть години цього предмета з навчального плану.</p>
          <ModalActions>
            <Button onClick={close}>Зрозуміло</Button>
          </ModalActions>
        </>
      ) : (
        <>
          <p>
            Запис зникне зі списків і з наступної побудови. Чинний розклад зміниться лише після
            побудови й публікації.
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
        </>
      )}
    </Modal>
  );
}
