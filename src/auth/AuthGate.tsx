import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import { Notice, Spinner } from '@/ui';
import { AuthContext, useAuth, type AuthValue } from './AuthContext';
import { currentIdentity, initKeycloak, logout, type Role } from './keycloak';

/** Корінь кабінету: ініціалізує keycloak (редірект на /idp, якщо сесії немає). */
export function AuthGate({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; value: AuthValue } | { status: 'error' }
  >({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    initKeycloak()
      .then(() => {
        if (alive) setState({ status: 'ready', value: { ...currentIdentity(), logout } });
      })
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div style={{ padding: 32 }}>
        <Spinner label="Перевіряємо вхід…" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div style={{ padding: 32 }}>
        <Notice tone="bad">
          <p>Сервіс входу недоступний. Спробуйте оновити сторінку пізніше.</p>
        </Notice>
      </div>
    );
  }
  return <AuthContext.Provider value={state.value}>{children ?? <Outlet />}</AuthContext.Provider>;
}

/** school- і timetable-service приймають лише scheduler; tenant — лише sysadmin. */
export function RequireRole({ role }: { role: Role }) {
  const { roles } = useAuth();
  if (!roles.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** «/» кабінету: розводить за роллю. */
export function HomeRedirect() {
  const { roles, logout } = useAuth();
  if (roles.includes('sysadmin')) return <Navigate to="/admin/schools" replace />;
  if (roles.includes('scheduler')) return <Navigate to="/scheduler/timetables" replace />;
  return (
    <div style={{ padding: 32, maxWidth: 560 }}>
      <Notice tone="warn">
        <p>У вашого облікового запису немає доступу до кабінету «Лад».</p>
      </Notice>
      <p>
        <button type="button" onClick={logout}>
          Вийти
        </button>
      </p>
    </div>
  );
}
