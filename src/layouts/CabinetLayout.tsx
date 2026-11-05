import { NavLink, Outlet } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import s from './CabinetLayout.module.css';

const SCHEDULER_NAV: { group: string; items: [string, string][] }[] = [
  {
    group: 'Розклад',
    items: [
      ['/scheduler/timetables', 'Версії розкладу'],
      ['/scheduler/alert-plan', 'Розклад тривог'],
      ['/scheduler/qr', 'QR-коди'],
    ],
  },
  {
    group: 'Дані закладу',
    items: [
      ['/scheduler/school', 'Профіль закладу'],
      ['/scheduler/bells', 'Дзвінки'],
      ['/scheduler/classes', 'Класи'],
      ['/scheduler/subjects', 'Предмети'],
      ['/scheduler/teachers', 'Вчителі'],
      ['/scheduler/curriculum', 'Навчальний план'],
    ],
  },
  { group: 'Інше', items: [['/scheduler/audit', 'Журнал дій']] },
];

const ADMIN_NAV = [{ group: 'Адміністрування', items: [['/admin/schools', 'Заклади']] }] as const;

export function CabinetLayout() {
  const { roles, username, logout } = useAuth();
  const nav = roles.includes('sysadmin') ? ADMIN_NAV : SCHEDULER_NAV;
  const roleLabel = roles.includes('sysadmin') ? 'Системний адмін' : 'Укладач розкладу';

  return (
    <div className={s.shell}>
      <aside className={`${s.side} no-print`}>
        <div className={s.brand}>
          <span className={s.logo} aria-hidden>
            Л
          </span>
          <div>
            <b>Лад</b>
            <div className="muted">{roleLabel}</div>
          </div>
        </div>
        <nav aria-label="Розділи">
          {nav.map((g) => (
            <div key={g.group} className={s.group}>
              <div className={s.groupTitle}>{g.group}</div>
              {g.items.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => (isActive ? `${s.link} ${s.active}` : s.link)}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className={s.user}>
          <span className="muted">{username}</span>
          <button type="button" className={s.logout} onClick={logout}>
            Вийти
          </button>
        </div>
      </aside>
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
