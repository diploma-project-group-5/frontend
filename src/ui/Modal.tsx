import { useEffect, useRef, type ReactNode } from 'react';
import s from './ui.module.css';

/** Модальне вікно на нативному <dialog>: фокус, Esc і затемнення — від браузера. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={s.modal} onClose={onClose} aria-labelledby="modal-title">
      {open && (
        <>
          <h2 id="modal-title">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className={s.modalActions}>{children}</div>;
}
