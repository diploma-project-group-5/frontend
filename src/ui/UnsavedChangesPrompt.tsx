import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { useUnsavedEntry } from '@/lib/unsaved';
import { Button } from './index';
import { Modal, ModalActions } from './Modal';

/**
 * Єдиний на роутер блокер переходу для форм з незбереженими змінами (useUnsavedChanges):
 * перехід усередині кабінету (вкладка, «Назад») зупиняє вікно, а закриття чи оновлення вкладки —
 * стандартне питання браузера (beforeunload).
 */
export function UnsavedChangesPrompt() {
  const entry = useUnsavedEntry();
  const blocker = useBlocker(entry !== null);

  useEffect(() => {
    if (!entry) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [entry]);

  return (
    <Modal
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title={entry?.title ?? ''}
    >
      <p>{entry?.text}</p>
      <ModalActions>
        <Button onClick={() => blocker.reset?.()}>Залишитися</Button>
        <Button variant="danger" onClick={() => blocker.proceed?.()}>
          Не зберігати
        </Button>
      </ModalActions>
    </Modal>
  );
}
