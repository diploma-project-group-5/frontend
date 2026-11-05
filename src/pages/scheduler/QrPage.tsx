import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { timetableApi } from '@/api/endpoints';
import type { AccessToken, TokenScope } from '@/api/types';
import { Button, Card, Notice, PageHeader, ProblemNotice, Spinner, Stack } from '@/ui';

export function QrPage() {
  const [scope, setScope] = useState<TokenScope>('class');
  return (
    <>
      <PageHeader
        title="QR-коди"
        actions={
          <>
            <Link to="/scheduler/print/qr/class" target="_blank" rel="noopener">
              Друк аркуша класів
            </Link>
            <Link to="/scheduler/print/qr/teacher" target="_blank" rel="noopener">
              Друк аркушів вчителів
            </Link>
          </>
        }
      />
      <Stack>
        <div>
          <Button
            variant={scope === 'class' ? 'primary' : 'default'}
            onClick={() => setScope('class')}
          >
            Класи
          </Button>{' '}
          <Button
            variant={scope === 'teacher' ? 'primary' : 'default'}
            onClick={() => setScope('teacher')}
          >
            Вчителі
          </Button>
        </div>
        <TokenList scope={scope} />
      </Stack>
    </>
  );
}

function TokenList({ scope }: { scope: TokenScope }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['access-tokens', scope],
    queryFn: () => timetableApi.accessTokens(scope),
    gcTime: 0, // посилання з токенами не тримаємо в кеші довше, ніж відкрита сторінка
  });
  const rotate = useMutation({
    mutationFn: (t: AccessToken) => timetableApi.rotateToken(t.token_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-tokens', scope] }),
  });

  if (q.isPending) return <Spinner />;
  if (q.error) return <ProblemNotice error={q.error} />;

  return (
    <Card>
      {rotate.isSuccess && (
        <Notice tone="ok">
          <p>Код перевипущено. Старий більше не працює — роздрукуйте новий аркуш.</p>
        </Notice>
      )}
      {rotate.error && <ProblemNotice error={rotate.error} />}
      <table>
        <thead>
          <tr>
            <th>{scope === 'class' ? 'Клас' : 'Вчитель'}</th>
            <th>Покоління</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data.map((t) => (
            <tr key={t.token_id}>
              <td>{t.target_label}</td>
              <td className="mono">{t.generation}</td>
              <td>
                <Button
                  disabled={rotate.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Перевипустити QR для «${t.target_label}»? Старий код одразу перестане працювати.`,
                      )
                    )
                      rotate.mutate(t);
                  }}
                >
                  Перевипустити
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
