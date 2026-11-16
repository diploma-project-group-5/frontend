import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { AuthContext, type AuthValue } from '@/auth/AuthContext';
import type { Role } from '@/auth/keycloak';

/**
 * Мок-бекенд src/mocks (той самий, що й у `npm run dev:mock`) у пам'яті, без затримки мережі.
 * vi.resetModules() дає свіжий стан даних для кожного тесту.
 */
export async function startMockBackend() {
  vi.resetModules();
  const server = await import('@/mocks/server');
  const data = await import('@/mocks/data');
  const stop = server.installMockServer({ latency: 0, quiet: true });
  onTestFinished(stop);
  return data;
}

/** Куди перейшов роутер: рендериться на будь-якому іншому шляху. */
function Elsewhere() {
  const loc = useLocation();
  return <p data-testid="location">{loc.pathname + loc.search}</p>;
}

/**
 * Сторінка кабінету з QueryClient, роутером у пам'яті й входом із потрібною роллю
 * (без Keycloak, як у мок-режимі).
 */
export function renderPage(
  ui: ReactElement,
  { path = '/', url = path, role = 'scheduler' }: { path?: string; url?: string; role?: Role } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path, element: ui },
      { path: '*', element: <Elsewhere /> },
    ],
    { initialEntries: [url] },
  );
  const auth: AuthValue = {
    username: 'test',
    roles: [role],
    schoolId: role === 'scheduler' ? 'sch1' : null,
    logout: vi.fn(),
  };
  const user = userEvent.setup();
  const view = render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { ...view, user, router, qc };
}
