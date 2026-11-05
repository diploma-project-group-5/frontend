import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Notice } from '@/ui';

const wrap = { padding: 32, maxWidth: 560, margin: '0 auto' } as const;

export function NotFoundPage() {
  return (
    <main style={wrap}>
      <h1>Сторінку не знайдено</h1>
      <p>
        <Link to="/">На головну</Link>
      </p>
    </main>
  );
}

export function RouteErrorPage() {
  const err = useRouteError();
  const text = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : 'Щось пішло не так.';
  return (
    <main style={wrap}>
      <Notice tone="bad">
        <p>{text}</p>
      </Notice>
    </main>
  );
}
