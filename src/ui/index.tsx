import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { NavLink } from 'react-router';
import { ApiError } from '@/api/http';
import type { DayFormat } from '@/api/types';
import { describeConflict, useCachedConflictNames } from '@/lib/conflicts';
import { fieldLabel, humanizeFields } from '@/lib/fields';
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
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        s.btn,
        variant === 'primary' && s.primary,
        variant === 'danger' && s.danger,
        variant === 'ghost' && s.ghost,
        size === 'sm' && s.small,
        className,
      )}
      {...rest}
    />
  );
}

/** Кнопки дій у рядку таблиці. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className={s.acts}>{children}</div>;
}

/** Кнопки над таблицею вкладки (праворуч), як у прототипі. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
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
  alert_plan_locked: 'План тривог погоджено або активовано — змінити його зараз не можна.',
  alert_plan_missing: 'Шаблону розкладу тривог ще немає. Спершу побудуйте план.',
  alert_plan_not_approved: 'План тривог не погоджено. Спершу погодьте його наказом.',
  activation_overlap: 'На ці дати вже є інша активація розкладу тривог.',
  activation_ended: 'Ця активація розкладу тривог уже завершилась.',
  teacher_is_substitute:
    'Цей вчитель уже погоджений замінником у ці дні й уроки. Спершу скасуйте ті заміни.',
  date_passed: 'Дата заміни вже минула — погодити її не можна.',
};

const VALIDATION_FALLBACK =
  'Сервер не прийняв дані. Перевірте значення полів: можливо, число завелике або поле порожнє.';

/**
 * Текст для 400 validation_failed: власні перевірки сервісів пишуть detail українською, а помилки
 * схеми (fastify/AJV) — англійською з шляхами body/…; такий машинний текст укладачу не показуємо.
 */
function validationText(detail: string | undefined) {
  return detail && /[а-яіїєґ]/i.test(detail) ? humanizeFields(detail) : VALIDATION_FALLBACK;
}

/**
 * 422 profile_incomplete: які саме поля заповнити (fields у тілі відповіді). Дзвінки тривог — не
 * частина профілю: їх задають у «Сценаріях», тож про них окреме речення.
 */
function incompleteText(fields: unknown) {
  const list = Array.isArray(fields) ? fields.filter((f) => typeof f === 'string') : [];
  const bells = list.includes('alert_bells');
  const profile = list.filter((f) => f !== 'alert_bells');
  const parts = [
    profile.length
      ? `${CODE_TEXT.profile_incomplete} Заповніть: ${profile.map(fieldLabel).join(', ')}.`
      : !bells
        ? CODE_TEXT.profile_incomplete
        : '',
    bells ? 'Дзвінки тривог не задано: задайте їх у блоці «Дзвінки тривог» і побудуйте план.' : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Відповідь без problem+json — від шлюзу, а не від сервісу (Traefik: 502/503/504, 429, 404 page not
 * found) або не той формат. Тексти — за статусом.
 */
function gatewayText(error: ApiError) {
  if (error.status === 429) return 'Забагато запитів. Зачекайте хвилину й повторіть.';
  if (error.status >= 502 && error.status <= 504 && !error.body.unexpected)
    return 'Сервіс тимчасово недоступний (можливо, його перезапускають). Спробуйте за хвилину.';
  if (error.body.unexpected)
    return 'Сервер відповів у неочікуваному форматі. Оновіть сторінку; якщо не допоможе — зверніться до адміністратора.';
  return `Запит не виконано (код ${error.status}). Спробуйте ще раз.`;
}

export function ProblemNotice({ error }: { error: unknown }) {
  const names = useCachedConflictNames();
  if (!error) return null;
  if (error instanceof ApiError) {
    // без code: сторінка шлюзу чи не JSON; problem+json сервісу без code показує свій title
    const gateway =
      !!error.body.unexpected ||
      (!error.code &&
        (typeof error.body.title !== 'string' || [429, 502, 503, 504].includes(error.status)));
    const text = gateway
      ? gatewayText(error)
      : error.code === 'validation_failed'
        ? validationText(error.detail)
        : error.code === 'profile_incomplete'
          ? incompleteText(error.body.fields)
          : (error.code && CODE_TEXT[error.code]) || error.detail || error.title;
    return (
      <Notice tone="bad">
        <p>{text}</p>
        {error.conflicts.length > 0 && (
          <ul>
            {error.conflicts.map((c, i) => (
              <li key={i}>{describeConflict(c, names)}</li>
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

export { Modal, ModalActions } from './Modal';
export { UnsavedChangesPrompt } from './UnsavedChangesPrompt';
