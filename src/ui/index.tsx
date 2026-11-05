import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { NavLink } from 'react-router';
import { ApiError } from '@/api/http';
import type { DayFormat } from '@/api/types';
import s from './ui.module.css';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'acc' | 'in' | 'out';
}) {
  return <span className={cx(s.chip, tone && s[`chip_${tone}`])}>{children}</span>;
}

/** Вкладки-«пігулки» з прототипу; кожна вкладка — маршрут. */
export function TabLinks({ tabs }: { tabs: [to: string, label: string][] }) {
  return (
    <nav className={s.tabs} aria-label="Вкладки">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => cx(s.tab, isActive && s.tabActive)}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx(s.card, className)}>{children}</section>;
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className={s.stack}>{children}</div>;
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={s.row}>{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger';
};

export function Button({ variant = 'default', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        s.btn,
        variant === 'primary' && s.primary,
        variant === 'danger' && s.danger,
        className,
      )}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className={s.hint}>{hint}</span>}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'bad';
  children: ReactNode;
}) {
  return (
    <div className={cx(s.notice, s[tone])} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      <h1>{title}</h1>
      {actions && <div className={s.row}>{actions}</div>}
    </header>
  );
}

export function Spinner({ label = 'Завантаження…' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite">
      <span className={s.spinner} aria-hidden /> <span className="muted">{label}</span>
    </span>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'in' | 'out' | 'sub' }) {
  return (
    <span
      className={cx(
        s.badge,
        tone === 'in' && s.badgeIn,
        tone === 'out' && s.badgeOut,
        tone === 'sub' && s.badgeSub,
      )}
    >
      {children}
    </span>
  );
}

export function FormatBadge({ format }: { format: DayFormat }) {
  return format === 'in_person' ? (
    <Badge tone="in">Очно</Badge>
  ) : (
    <Badge tone="out">Дистанційно</Badge>
  );
}

/** Людські тексти для відомих кодів problem+json. */
const CODE_TEXT: Record<string, string> = {
  stale:
    'Дані закладу змінилися після побудови, і версія їм уже не відповідає. Перебудуйте розклад.',
  login_taken: 'Такий логін уже зайнятий.',
  build_in_progress: 'Побудова вже триває. Дочекайтеся її завершення.',
  published_readonly: 'Опубліковану версію змінювати не можна.',
  profile_incomplete: 'Профіль закладу заповнено не повністю.',
  alert_plan_active: 'На ці дати діє розклад тривог.',
};

export function ProblemNotice({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    const text = (error.code && CODE_TEXT[error.code]) || error.detail || error.title;
    return (
      <Notice tone="bad">
        <p>{text}</p>
        {error.conflicts.length > 0 && (
          <ul>
            {error.conflicts.map((c, i) => (
              <li key={i}>
                {c.message ?? c.rule}
                {c.limit && ` (${c.limit === 'seats' ? 'навчальні місця' : 'паспортна місткість'})`}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }
  return (
    <Notice tone="bad">
      <p>Не вдалося виконати запит. Перевірте з’єднання й спробуйте ще раз.</p>
    </Notice>
  );
}
