import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModalGuardContext } from './modalGuard';
import s from './ui.module.css';

/**
 * Модальне вікно на нативному <dialog>: фокус, Esc і затемнення — від браузера.
 * dismissible={false} — Esc вікно не закриває (лише кнопки всередині), для вмісту, який після
 * закриття не повернути (тимчасовий пароль показується один раз).
 * Форма всередині повідомляє про незбережене введення через useModalForm (modalGuard.ts): тоді Esc і «Скасувати»
 * спершу питають, чи закрити без збереження, а «Назад» у браузері зупиняє UnsavedChangesPrompt.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // свій id у кожного вікна: інакше два відкриті вікна (форма → QR) ділять один заголовок
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // закрите вікно відкривається знову без питання «Закрити без збереження?»
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setConfirming(false);
  }

  useEffect(() => {
    if (confirming) stayRef.current?.focus();
  }, [confirming]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);
  const guard = useMemo(() => ({ setDirty, requestClose }), [requestClose]);
  const holdOpen = !dismissible || dirty;

  return (
    <dialog
      ref={ref}
      className={s.modal}
      onCancel={(e) => {
        if (!holdOpen) return;
        e.preventDefault();
        if (dirty) setConfirming(true);
      }}
      onClose={() => {
        // браузер може закрити вікно й попри preventDefault (повторний Esc) — відкриваємо знову
        if (holdOpen && open) {
          ref.current?.showModal();
          if (dirty) setConfirming(true);
        } else onClose();
      }}
      aria-labelledby={titleId}
    >
      {open && (
        <ModalGuardContext.Provider value={guard}>
          <h2 id={titleId}>{title}</h2>
          {/* форму лише ховаємо, а не розмонтовуємо — «Повернутися» лишає введене */}
          <div hidden={confirming}>{children}</div>
          {confirming && (
            <div role="alert">
              <p>Введене не збережено. Закрити вікно без збереження?</p>
              <div className={s.modalActions}>
                <button
                  ref={stayRef}
                  type="button"
                  className={s.btn}
                  onClick={() => setConfirming(false)}
                >
                  Повернутися до форми
                </button>
                <button type="button" className={`${s.btn} ${s.danger}`} onClick={onClose}>
                  Не зберігати
                </button>
              </div>
            </div>
          )}
        </ModalGuardContext.Provider>
      )}
    </dialog>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className={s.modalActions}>{children}</div>;
}
