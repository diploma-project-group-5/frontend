import { useEffect, useSyncExternalStore } from 'react';

/**
 * Незбережені зміни на сторінці. React Router враховує лише останній зареєстрований useBlocker,
 * тож дві форми на одній вкладці («Заклад»: профіль і дзвінки) зі своїми блокерами вимикали одна
 * одну. Тому форми лише повідомляють сюди про зміни, а блокер один — UnsavedChangesPrompt.
 */
export interface UnsavedEntry {
  title: string;
  text: string;
}

const DEFAULT: UnsavedEntry = {
  title: 'Зміни не збережено',
  text: 'Якщо піти зі сторінки, внесені зміни буде втрачено.',
};

const entries = new Map<number, UnsavedEntry>();
const listeners = new Set<() => void>();
let current: UnsavedEntry | null = null;
let seq = 0;

function emit() {
  current = [...entries.values()].at(-1) ?? null;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Форма має незбережені зміни, поки when = true. */
export function useUnsavedChanges(when: boolean, entry: Partial<UnsavedEntry> = {}) {
  const title = entry.title ?? DEFAULT.title;
  const text = entry.text ?? DEFAULT.text;
  useEffect(() => {
    if (!when) return;
    const id = ++seq;
    entries.set(id, { title, text });
    emit();
    return () => {
      entries.delete(id);
      emit();
    };
  }, [when, title, text]);
}

/** Остання форма з незбереженими змінами або null. */
export function useUnsavedEntry(): UnsavedEntry | null {
  return useSyncExternalStore(subscribe, () => current);
}
