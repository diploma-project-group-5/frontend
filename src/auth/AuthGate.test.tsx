import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AuthGate, HomeRedirect, RequireRole } from './AuthGate';
import type { Identity, Role } from './keycloak';

const kc = vi.hoisted(() => ({
  initKeycloak: vi.fn<() => Promise<void>>(),
  currentIdentity: vi.fn<() => Identity>(),
  logout: vi.fn(),
}));
vi.mock('./keycloak', () => kc);

function signedInAs(roles: Role[]) {
  kc.initKeycloak.mockResolvedValue();
  kc.currentIdentity.mockReturnValue({
    username: 'u',
    roles,
    schoolId: roles.includes('scheduler') ? 'sch1' : null,
  });
}

/** Ті самі гілки, що й у src/app/router.tsx: «/», /admin/* лише sysadmin, /scheduler/* лише scheduler. */
function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AuthGate />,
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            path: 'admin',
            element: <RequireRole role="sysadmin" />,
            children: [{ path: 'schools', element: <h1>Заклади</h1> }],
          },
          {
            path: 'scheduler',
            element: <RequireRole role="scheduler" />,
            children: [{ path: 'timetables', element: <h1>Розклад</h1> }],
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('вхід і ролі', () => {
  it('«/» веде адміна до закладів, укладача — до розкладу', async () => {
    signedInAs(['sysadmin']);
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Заклади' })).toBeInTheDocument();
  });

  it('укладач не відкриє розділ адміна: повертається на свій', async () => {
    signedInAs(['scheduler']);
    const router = renderAt('/admin/schools');
    expect(await screen.findByRole('heading', { name: 'Розклад' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/scheduler/timetables');
  });

  it('без ролей «Лад» — повідомлення й вихід', async () => {
    signedInAs([]);
    renderAt('/');
    expect(
      await screen.findByText('У вашого облікового запису немає доступу до кабінету «Лад».'),
    ).toBeInTheDocument();
    screen.getByRole('button', { name: 'Вийти' }).click();
    expect(kc.logout).toHaveBeenCalled();
  });

  it('Keycloak недоступний — зрозуміле повідомлення', async () => {
    kc.initKeycloak.mockRejectedValue(new Error('network'));
    renderAt('/');
    expect(
      await screen.findByText('Сервіс входу недоступний. Спробуйте оновити сторінку пізніше.'),
    ).toBeInTheDocument();
  });
});
