import { createContext, useContext, useEffect } from 'react';
import { useUnsavedChanges, type UnsavedEntry } from '@/lib/unsaved';

export interface ModalGuard {
  setDirty: (dirty: boolean) => void;
  requestClose: () => void;
}

export const ModalGuardContext = createContext<ModalGuard | null>(null);

/**
 * Форма у Modal: dirty — є незбережене введення. Повертає close для кнопки «Скасувати» (з
 * підтвердженням, якщо введене не збережено; поза Modal — undefined). Перехід сторінкою «Назад»
 * зупиняє спільний UnsavedChangesPrompt.
 */
export function useModalForm(dirty: boolean, entry?: Partial<UnsavedEntry>) {
  const guard = useContext(ModalGuardContext);
  const setDirty = guard?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [dirty, setDirty]);
  useUnsavedChanges(dirty, entry);
  return guard?.requestClose;
}
