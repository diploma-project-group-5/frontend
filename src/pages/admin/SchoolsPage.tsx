import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { tenantApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { SchoolListItem, SchoolRegistered } from '@/api/types';
import { formatDate, todayKyiv } from '@/lib/time';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  ModalActions,
  PageHeader,
  ProblemNotice,
  Spinner,
} from '@/ui';
import { IconCopy, IconPlus } from '@/ui/icons';
import s from './SchoolsPage.module.css';

/** Логін Keycloak: малі латинські літери, цифри, крапка, дефіс, підкреслення. */
const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;

/**
 * Заклади (прототип «Сис. адмін»): реєстр закладів, пошук, реєстрація у вікні.
 * API (розділ 08): лише GET/POST /tenant/schools. Запрошень, статусів, скидання пароля й
 * блокування в API немає: це адмін робить у консолі Keycloak (прийнятий ризик MVP).
 */
export function SchoolsPage() {
  const schools = useQuery({ queryKey: ['schools'], queryFn: tenantApi.listSchools });
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ name: string; data: SchoolRegistered } | null>(null);

  const needle = q.trim().toLowerCase();
  const list = (schools.data ?? []).filter(
    (x) => !needle || `${x.name} ${x.login}`.toLowerCase().includes(needle),
  );

  return (
    <>
      <PageHeader
        title="Заклади"
        actions={schools.data && <Chip tone="ok">зареєстровано: {schools.data.length}</Chip>}
      />
      <p className={s.summary}>
        Ви бачите лише реєстр закладів і логін укладача. Класи, вчителі, розклад і журнал закладу
        адміністратору недоступні. Скидання пароля, вимкнення укладача й блокування закладу — у
        консолі Keycloak.
      </p>

      <div className={s.bar}>
        <input
          className={s.search}
          type="search"
          placeholder="Пошук: назва або логін"
          aria-label="Пошук закладу"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <IconPlus width={14} height={14} />
          Зареєструвати заклад
        </Button>
      </div>

      <Card>
        {schools.isPending && <Spinner />}
        {schools.error && <ProblemNotice error={schools.error} />}
        {schools.data && (
          <table>
            <thead>
              <tr>
                <th>Заклад</th>
                <th>Укладач розкладу</th>
                <th>Зареєстровано</th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.school_id}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td className="mono muted">{x.login}</td>
                  <td className={s.num}>{formatDate(todayKyiv(new Date(x.created_at)))}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    {schools.data.length ? 'Нічого не знайдено' : 'Закладів ще немає'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Зареєструвати заклад">
        {adding && (
          <RegisterForm
            existing={schools.data ?? []}
            onClose={() => setAdding(false)}
            onCreated={(name, data) => {
              setAdding(false);
              setCreated({ name, data });
            }}
          />
        )}
      </Modal>
      <TemporaryPassword created={created} onDone={() => setCreated(null)} />
    </>
  );
}

function RegisterForm({
  existing,
  onClose,
  onCreated,
}: {
  existing: SchoolListItem[];
  onClose: () => void;
  onCreated: (name: string, data: SchoolRegistered) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: tenantApi.registerSchool,
    onSuccess: (res, vars) => {
      void qc.invalidateQueries({ queryKey: ['schools'] });
      onCreated(vars.name, res);
    },
  });
  const loginTaken = isApiError(register.error, 'login_taken');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const l = login.trim();
    if (!n) return setError('Вкажіть назву закладу.');
    if (!LOGIN_RE.test(l))
      return setError('Логін: 3–32 символи — малі латинські літери, цифри, крапка, дефіс або _.');
    if (existing.some((x) => x.name.toLowerCase() === n.toLowerCase()))
      return setError('Заклад із такою назвою вже зареєстровано.');
    setError(null);
    register.mutate({ name: n, login: l });
  };

  return (
    <form onSubmit={submit} noValidate className={s.form}>
      <p className="muted">
        Разом із закладом створюється єдиний укладач розкладу з тимчасовим паролем. Під час першого
        входу система попросить його змінити.
      </p>
      <Field label="Назва закладу">
        {(id) => (
          <input
            id={id}
            required
            placeholder="Гімназія № 12"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Логін укладача розкладу"
        hint="Для входу в систему. Не використовуйте прізвище чи особисту пошту."
      >
        {(id) => (
          <input
            id={id}
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="gymn12"
            aria-invalid={loginTaken}
            value={login}
            onChange={(e) => {
              register.reset();
              setLogin(e.target.value.toLowerCase());
            }}
          />
        )}
      </Field>
      {error && (
        <p className={s.err} role="alert">
          {error}
        </p>
      )}
      {loginTaken ? (
        <p className={s.err} role="alert">
          Логін «{login.trim()}» уже зайнятий. Оберіть інший.
        </p>
      ) : (
        register.error && <ProblemNotice error={register.error} />
      )}
      <ModalActions>
        <Button onClick={onClose}>Скасувати</Button>
        <Button type="submit" variant="primary" disabled={register.isPending}>
          {register.isPending ? 'Реєструємо…' : 'Зареєструвати'}
        </Button>
      </ModalActions>
    </form>
  );
}

/** Тимчасовий пароль показується один раз: сервер його не зберігає. Живе лише в стані сторінки. */
function TemporaryPassword({
  created,
  onDone,
}: {
  created: { name: string; data: SchoolRegistered } | null;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const done = () => {
    setCopied(false);
    onDone();
  };
  return (
    <Modal open={!!created} onClose={done} title="Заклад зареєстровано">
      {created && (
        <div className={s.form}>
          <p className="muted">
            Укладач розкладу закладу «{created.name}». Передайте логін і тимчасовий пароль захищеним
            каналом. Після закриття вікна пароль переглянути не можна.
          </p>
          <Field label="Логін">
            {(id) => <input id={id} readOnly className="mono" value={created.data.login} />}
          </Field>
          <Field label="Тимчасовий пароль">
            {(id) => (
              <input
                id={id}
                readOnly
                className="mono"
                value={created.data.temporary_password}
                onFocus={(e) => e.target.select()}
              />
            )}
          </Field>
          <ModalActions>
            <Button
              onClick={() =>
                navigator.clipboard
                  .writeText(created.data.temporary_password)
                  .then(() => setCopied(true))
              }
            >
              <IconCopy width={14} height={14} />
              {copied ? 'Скопійовано' : 'Копіювати пароль'}
            </Button>
            <Button variant="primary" onClick={done}>
              Готово
            </Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}
