import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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

function PublicTimetablePage({ scope }: { scope: 'class' | 'teacher' }) {
  const token = readTokenFromHash(window.location.hash);

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

  let body;
  if (!token || (isApiError(q.error) && q.error.status === 404)) {
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
    body = <TimetableView data={q.data} scope={scope} />;
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

function TimetableView({ data, scope }: { data: PublicTimetable; scope: 'class' | 'teacher' }) {
  return (
    <>
      <header className={s.header}>
        <div className="muted">{scope === 'class' ? 'Розклад класу' : 'Розклад вчителя'}</div>
        <h1>{data.target_label}</h1>
      </header>

      {data.upcoming_change && (
        <Notice tone="info">
          <p>{data.upcoming_change}</p>
        </Notice>
      )}

      {data.state === 'not_published' ? (
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

function DayCard({ day, scope }: { day: PublicDay; scope: 'class' | 'teacher' }) {
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
        {day.lessons.length > 0 && <FormatBadge format={day.format} />}
      </div>
      {day.lessons.length === 0 ? (
        <p className="muted">Уроків немає</p>
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
