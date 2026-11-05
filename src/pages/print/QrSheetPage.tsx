import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'react-router';
import { schoolApi, timetableApi } from '@/api/endpoints';
import type { TokenScope } from '@/api/types';
import { Button, ProblemNotice, Spinner } from '@/ui';
import s from './QrSheetPage.module.css';

/**
 * Аркуші для друку (HTML + print-CSS, без серверних PDF — розділ 15).
 * Токени відтворюються сервером з HMAC, тож аркуш можна друкувати повторно.
 *  - class: аркуш QR класів з контактом закладу й рядком про ПД учнів і батьків;
 *  - teacher: аркуш кожному вчителю з повідомленням про обробку ПД (ст. 12).
 */
export function QrSheetPage() {
  const { scope: raw } = useParams();
  const scope: TokenScope = raw === 'teacher' ? 'teacher' : 'class';
  const tokens = useQuery({
    queryKey: ['access-tokens', scope],
    queryFn: () => timetableApi.accessTokens(scope),
    gcTime: 0,
  });
  const profile = useQuery({ queryKey: ['profile'], queryFn: schoolApi.getProfile });

  if (tokens.isPending || profile.isPending) return <Spinner />;
  if (tokens.error) return <ProblemNotice error={tokens.error} />;

  const school = profile.data?.name ?? '';

  return (
    <div className={s.sheet}>
      <div className={`${s.toolbar} no-print`}>
        <Button variant="primary" onClick={() => window.print()}>
          Друкувати
        </Button>
      </div>

      {scope === 'class' ? (
        <div className={s.classGrid}>
          {tokens.data.map((t) => (
            <figure key={t.token_id} className={s.card}>
              <QRCodeSVG value={t.url} size={160} level="M" marginSize={2} />
              <figcaption>
                <b>{t.target_label}</b>
                <span>Розклад класу</span>
              </figcaption>
            </figure>
          ))}
          <p className={s.footnote}>
            {school}. Розклад відкривається без реєстрації. Персональні дані учнів і батьків не
            збираються. Питання щодо розкладу — до адміністрації закладу.
          </p>
        </div>
      ) : (
        tokens.data.map((t) => (
          <section key={t.token_id} className={s.teacherPage}>
            <h1>{t.target_label}</h1>
            <p>Ваш персональний розклад за класами — на поточний і наступний тиждень.</p>
            <QRCodeSVG value={t.url} size={220} level="M" marginSize={2} />
            <h2>Повідомлення про обробку персональних даних</h2>
            <p>
              {school} обробляє ваш підпис у розкладі, тижневе навантаження й дні, коли ви не можете
              вести уроки, — лише для складання розкладу. Учні й батьки вашого підпису не бачать. Ви
              можете отримати всі дані про себе або попросити їх видалити, звернувшись до укладача
              розкладу закладу.
            </p>
            <p className="muted">Не передавайте цей QR-код іншим: він відкриває ваш розклад.</p>
          </section>
        ))
      )}
    </div>
  );
}
