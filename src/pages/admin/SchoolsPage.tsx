import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { tenantApi } from '@/api/endpoints';
import type { SchoolRegistered } from '@/api/types';
import { formatDateTime } from '@/lib/time';
import { Button, Card, Field, Notice, PageHeader, ProblemNotice, Spinner, Stack } from '@/ui';

export function SchoolsPage() {
  const qc = useQueryClient();
  const schools = useQuery({ queryKey: ['schools'], queryFn: tenantApi.listSchools });

  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [created, setCreated] = useState<SchoolRegistered | null>(null);

  const register = useMutation({
    mutationFn: tenantApi.registerSchool,
    onSuccess: (res) => {
      setCreated(res);
      setName('');
      setLogin('');
      void qc.invalidateQueries({ queryKey: ['schools'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCreated(null);
    register.mutate({ name: name.trim(), login: login.trim() });
  };

  return (
    <>
      <PageHeader title="Заклади" />
      <Stack>
        <Card>
          <h2>Зареєструвати заклад</h2>
          <p className="muted">
            Разом із закладом створюється єдиний укладач розкладу з тимчасовим паролем. Під час
            першого входу Keycloak вимагатиме його змінити.
          </p>
          <form onSubmit={submit}>
            <Stack>
              <Field label="Назва закладу">
                {(id) => (
                  <input
                    id={id}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ліцей № 17"
                  />
                )}
              </Field>
              <Field label="Логін укладача розкладу">
                {(id) => (
                  <input
                    id={id}
                    required
                    autoComplete="off"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                )}
              </Field>
              {register.error && <ProblemNotice error={register.error} />}
              <div>
                <Button type="submit" variant="primary" disabled={register.isPending}>
                  {register.isPending ? 'Реєструємо…' : 'Зареєструвати'}
                </Button>
              </div>
            </Stack>
          </form>
        </Card>

        {created && <TemporaryPassword data={created} onDone={() => setCreated(null)} />}

        <Card>
          <h2>Зареєстровані заклади</h2>
          {schools.isPending && <Spinner />}
          {schools.error && <ProblemNotice error={schools.error} />}
          {schools.data && (
            <table>
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Логін укладача</th>
                  <th>Створено</th>
                </tr>
              </thead>
              <tbody>
                {schools.data.map((s) => (
                  <tr key={s.school_id}>
                    <td>{s.name}</td>
                    <td className="mono">{s.login}</td>
                    <td>{formatDateTime(s.created_at)}</td>
                  </tr>
                ))}
                {schools.data.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      Закладів ще немає
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      </Stack>
    </>
  );
}

/** Тимчасовий пароль показується один раз: сервер його не зберігає. Живе лише в стані сторінки. */
function TemporaryPassword({ data, onDone }: { data: SchoolRegistered; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Notice tone="warn">
      <Stack>
        <p>
          <b>Заклад зареєстровано.</b> Передайте логін і тимчасовий пароль укладачу особисто. Пароль
          показується лише зараз — після закриття його не можна буде переглянути.
        </p>
        <p>
          Логін: <code>{data.login}</code>
          <br />
          Тимчасовий пароль: <code>{data.temporary_password}</code>
        </p>
        <div>
          <Button
            onClick={() =>
              navigator.clipboard.writeText(data.temporary_password).then(() => setCopied(true))
            }
          >
            {copied ? 'Скопійовано' : 'Копіювати пароль'}
          </Button>{' '}
          <Button variant="primary" onClick={onDone}>
            Я передав пароль
          </Button>
        </div>
      </Stack>
    </Notice>
  );
}
