import type { ComponentType, SVGProps } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '@/auth/AuthContext';
import { IconCheck, IconDb, IconGrid, IconLayers, IconLog, IconSchool, IconSwap } from '@/ui/icons';
import { StatusChips } from './StatusChips';
import s from './CabinetLayout.module.css';

type NavItem = [to: string, label: string, icon: ComponentType<SVGProps<SVGSVGElement>>];

/** Розділи — як у прототипі; вміст сторінок — за API специфікації v24. */
const SCHEDULER_NAV: NavItem[] = [
  ['/scheduler/data', 'Дані закладу', IconDb],
  ['/scheduler/timetables', 'Розклад', IconGrid],
  ['/scheduler/approval', 'Погодження', IconCheck],
  ['/scheduler/substitutions', 'Заміни', IconSwap],
  ['/scheduler/scenarios', 'Сценарії', IconLayers],
  ['/scheduler/journal', 'Журнал', IconLog],
];

const ADMIN_NAV: NavItem[] = [['/admin/schools', 'Заклади', IconSchool]];

export function CabinetLayout() {
  const { roles, username, logout } = useAuth();
  const isAdmin = roles.includes('sysadmin');
  const nav = isAdmin ? ADMIN_NAV : SCHEDULER_NAV;

  return (
    <div className={s.shell}>
      <nav className={`${s.rail} no-print`} aria-label="Розділи">
        <div className={s.brand}>
          <span className={s.mark}>
            <IconSchool />
          </span>
          <span className={s.bn}>
            Лад<small>розклад з урахуванням укриття</small>
          </span>
        </div>
        {nav.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? `${s.link} ${s.active}` : s.link)}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
        <div className={s.sp} />
        <div className={s.who}>
          <span className={s.avatar}>{isAdmin ? 'СА' : 'УР'}</span>
          <span className={s.whoText}>
            {isAdmin ? 'Системний адмін' : 'Укладач розкладу'}
            <br />
            <span className="muted">{username}</span>
          </span>
        </div>
        <button type="button" className={s.logout} onClick={logout}>
          {import.meta.env.MODE === 'mock' ? 'Змінити роль' : 'Вийти'}
        </button>
      </nav>
      <main className={s.main}>
        {!isAdmin && <StatusChips />}
        <Outlet />
      </main>
    </div>
  );
}
