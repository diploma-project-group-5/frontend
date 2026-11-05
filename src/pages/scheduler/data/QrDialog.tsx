import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { timetableApi } from '@/api/endpoints';
import type { AccessToken } from '@/api/types';
import { Button, Chip, Modal, ModalActions, ProblemNotice } from '@/ui';
import { IconCopy, IconRefresh } from '@/ui/icons';
import s from './DataPages.module.css';

/**
 * QR одного класу чи вчителя (прототип: qrDlg). Посилання відтворюється сервером
 * (GET /access-tokens), перевипуск — POST /access-tokens/{id}:rotate: старий код одразу недійсний.
 */
export function QrDialog({
  token: initial,
  onClose,
}: {
  token: AccessToken | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const rotate = useMutation({
    mutationFn: (t: AccessToken) => timetableApi.rotateToken(t.token_id),
    onSuccess: (t) => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['access-tokens', t.scope] });
    },
  });
  // після перевипуску показуємо новий токен (нове покоління й посилання)
  const token = initial && rotate.data?.token_id === initial.token_id ? rotate.data : initial;

  const close = () => {
    setConfirm(false);
    setCopied(false);
    rotate.reset();
    onClose();
  };

  return (
    <Modal open={!!token} onClose={close} title={token ? `QR · ${token.target_label}` : ''}>
      {token && (
        <>
          <div className={s.qrBig}>
            <QRCodeSVG value={token.url} size={160} level="M" marginSize={1} />
            <div className={s.qrMeta}>
              <Chip tone={token.scope === 'teacher' ? 'acc' : undefined}>
                {token.scope === 'teacher'
                  ? 'вчитель · розклад за класами'
                  : 'клас · розклад за предметами'}
              </Chip>
              <span className="muted">Безстроковий · покоління {token.generation}</span>
              {rotate.isSuccess && <span>Код перевипущено, старий більше не працює.</span>}
            </div>
          </div>
          {rotate.error && <ProblemNotice error={rotate.error} />}

          {confirm ? (
            <>
              <p className={s.warnBox}>
                Старий код перестане працювати. Роздрукований аркуш доведеться замінити.
              </p>
              <ModalActions>
                <Button onClick={() => setConfirm(false)}>Скасувати</Button>
                <Button
                  variant="danger"
                  disabled={rotate.isPending}
                  onClick={() => rotate.mutate(token)}
                >
                  Перегенерувати
                </Button>
              </ModalActions>
            </>
          ) : (
            <ModalActions>
              <Button
                onClick={() => navigator.clipboard.writeText(token.url).then(() => setCopied(true))}
              >
                <IconCopy width={14} height={14} />
                {copied ? 'Скопійовано' : 'Копіювати посилання'}
              </Button>
              <Button onClick={() => setConfirm(true)}>
                <IconRefresh width={14} height={14} />
                Перегенерувати…
              </Button>
              <Button variant="primary" onClick={close}>
                Готово
              </Button>
            </ModalActions>
          )}
        </>
      )}
    </Modal>
  );
}
