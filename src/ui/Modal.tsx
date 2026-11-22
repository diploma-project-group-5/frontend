import { useEffect, useId, useRef, type ReactNode } from 'react';
import s from './ui.module.css';

/**
 * Модальне вікно на нативному <dialog>: фокус, Esc і затемнення — від браузера.
 * dismissible={false} — Esc вікно не закриває (лише кнопки всередині), для вмісту, який після
 * закриття не повернути (тимчасовий пароль показується один раз).
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
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.modal}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClose={() => {
        // браузер може закрити вікно й попри preventDefault (повторний Esc) — відкриваємо знову
        if (!dismissible && open) ref.current?.showModal();
        else onClose();
      }}
      aria-labelledby={titleId}
    >
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className={s.modalActions}>{children}</div>;
}
