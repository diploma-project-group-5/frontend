import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { publicApi } from '@/api/endpoints';
import { isApiError } from '@/api/http';
import type { PublicDay, PublicTimetable } from '@/api/types';
import { readTokenFromHash } from '@/lib/qrToken';
import { formatDate, formatDayHeading } from '@/lib/time';
import { Badge, FormatBadge, Notice, Spinner } from '@/ui';
import s from './PublicTimetablePage.module.css';

/**
 * Сторінки за QR (розділ 11): /c#токен — клас (за предметами), /t#токен — вчитель (за класами).
 * Токен — у фрагменті URL: не потрапляє в логи шлюзу, Referer і прев'ю месенджерів.
 * Тут не показуємо назву закладу, прізвища вчителів на сторінці класу, місткість, історію.
 */
export function ClassTimetablePage() {
  return <PublicTimetablePage scope="class" />;
}

export function TeacherTimetablePage() {
  return <PublicTimetablePage scope="teacher" />;
}

const INVALID_TEXT = 'Посилання недійсне. Зверніться до закладу.';

type Scope = 'class' | 'teacher';

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

/**
 * Фрагмент URL з підпискою на зміни: перехід за іншим QR у тій самій вкладці (чи «Назад») міняє
 * лише #токен, сторінка не перезавантажується — без підписки лишався розклад попереднього класу.
 */
function useLocationHash() {
  return useSyncExternalStore(subscribeHash, () => window.location.hash);
}

/**
 * Чий розклад віддав сервер. Шлях (/c чи /t) обирає людина, а сервер рендерить за token.scope:
 * токен класу на /t давав «Розклад вчителя 1-А» з порожніми рядками. Сервер повідомляє scope —
 * беремо його; старіший сервер без поля — визначаємо за полями уроків (subject — клас,
 * class_name — вчитель). null — не визначити (уроків немає): тоді тип сторінці не приписуємо.
 */
function responseScope(data: PublicTimetable): Scope | null {
  const declared: unknown = data.scope;
  if (declared === 'class' || declared === 'teacher') return declared;
  for (const w of data.weeks)
    for (const d of w.days)
      for (const l of d.lessons) {
        if ('subject' in l && !('class_name' in l)) return 'class';
        if ('class_name' in l && !('subject' in l)) return 'teacher';
      }
  return null;
}

function PublicTimetablePage({ scope }: { scope: Scope }) {
  const token = readTokenFromHash(useLocationHash());

  useEffect(() => {
    document.title = 'Розклад занять';
  }, []);

  const q = useQuery({
    queryKey: ['public-timetable', token],
    queryFn: ({ signal }) => publicApi.timetable(token!, signal),
    enabled: !!token,
    // gcTime 0: відповідь не лишається в пам'яті після виходу зі сторінки
    gcTime: 0,
  });

  const actual = q.data ? responseScope(q.data) : null;
  const wrongScope = actual !== null && actual !== scope;

  let body;
  if (!token || (isApiError(q.error) && q.error.status === 404) || wrongScope) {
    body = (
      <Notice tone="warn">
        <p>{INVALID_TEXT}</p>
      </Notice>
    );
  } else if (q.isPending) {
    body = <Spinner />;
  } else if (q.error) {
    body = (
      <Notice tone="bad">
        <p>Не вдалося завантажити розклад. Спробуйте оновити сторінку пізніше.</p>
      </Notice>
    );
  } else {
    // тип невідомий (сервер без scope, уроків немає) — нейтральний заголовок, а не «вчителя» для класу
    body = <TimetableView data={q.data} scope={actual} />;
  }

  return (
    <main className={s.page}>
      {body}
      <footer className={s.footer}>
        Розклад відкрито за QR-кодом. Персональні дані учнів і батьків не збираються.
      </footer>
    </main>
  );
}

const KIND: Record<Scope | 'unknown', { caption: string; noun: string; whose: string }> = {
  class: { caption: 'Розклад класу', noun: 'Клас', whose: 'Цього класу' },
  teacher: { caption: 'Розклад вчителя', noun: 'Вчитель', whose: 'Цього вчителя' },
  unknown: { caption: 'Розклад занять', noun: 'Розклад', whose: 'Цього розкладу' },
};

function TimetableView({ data, scope }: { data: PublicTimetable; scope: Scope | null }) {
  // назва береться з опублікованих версій: класу, доданого після побудови, у них ще немає
  const unnamed = !data.target_label.trim();
  const kind = KIND[scope ?? 'unknown'];
  return (
    <>
      <header className={s.header}>
        <div className="muted">{kind.caption}</div>
        <h1>{unnamed ? kind.noun : data.target_label}</h1>
      </header>

      {unnamed && data.state === 'published' && (
        <Notice tone="info">
          <p>{kind.whose} ще немає в опублікованому розкладі. Зверніться до закладу.</p>
        </Notice>
      )}

      {data.upcoming_change && (
        <Notice tone="info">
          <p>{data.upcoming_change}</p>
        </Notice>
      )}

      {unnamed && data.state === 'published' ? null : data.state === 'not_published' ? (
        <Notice tone="info">
          <p>Розклад ще не опубліковано.</p>
        </Notice>
      ) : (
        data.weeks.map((w, i) => (
          <section key={w.week} className={s.week}>
            <h2>{i === 0 ? 'Цей тиждень' : 'Наступний тиждень'}</h2>
            {w.days.map((d) => (
              <DayCard key={d.date} day={d} scope={scope} />
            ))}
          </section>
        ))
      )}
    </>
  );
}

function DayCard({ day, scope }: { day: PublicDay; scope: Scope | null }) {
  if (day.holiday) {
    return (
      <article className={s.day}>
        <h3>{formatDayHeading(day.date)}</h3>
        <p className="muted">
          {/* фіксований текст: поле з вільним текстом від закладу не показуємо ніколи */}
          Канікули
          {day.holiday_from && day.holiday_to
            ? ` з ${formatDate(day.holiday_from)} по ${formatDate(day.holiday_to)}`
            : ''}
        </p>
      </article>
    );
  }
  return (
    <article className={s.day}>
      <div className={s.dayHead}>
        <h3>{formatDayHeading(day.date)}</h3>
        {day.format && day.lessons.length > 0 && <FormatBadge format={day.format} />}
      </div>
      {day.lessons.length === 0 ? (
        <p className="muted">
          {/* у класу формат є в кожен день чинного розкладу; null — розклад на цю дату ще не діє */}
          {scope === 'class' && day.format === null ? 'Розклад ще не діє' : 'Уроків немає'}
        </p>
      ) : (
        <ol className={s.lessons}>
          {day.lessons.map((l) => (
            <li key={l.lesson_no}>
              <span className={s.no}>{l.lesson_no}</span>
              <span className={s.time}>
                {l.start}–{l.end}
              </span>
              <span className={s.what}>{scope === 'class' ? l.subject : l.class_name}</span>
              {l.substitution && <Badge tone="sub">Заміна</Badge>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
