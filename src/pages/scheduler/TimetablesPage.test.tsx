import { fireEvent, screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { TimetablesPage } from './TimetablesPage';

/** Кнопки уроків (їх можна перетягувати) у рядку класу на вибраному дні. */
function lessons(className: string) {
  const row = screen.getByRole('rowheader', { name: new RegExp(`^${className}`) }).closest('tr')!;
  return [...row.querySelectorAll<HTMLButtonElement>('button[draggable="true"]')];
}
const text = (b: HTMLElement) => b.textContent;

async function openCopyOfCurrent() {
  const view = renderPage(<TimetablesPage />, {
    path: '/scheduler/timetables/:id?',
    url: '/scheduler/timetables',
  });
  const copy = await screen.findByRole('button', { name: 'Створити копію для правок' });
  expect(screen.getByRole('status')).toHaveTextContent('Опубліковану версію не правлять');
  expect(lessons('5-А')).toHaveLength(0); // опублікована — лише перегляд
  await view.user.click(copy);
  await vi.waitFor(() => expect(view.router.state.location.pathname).toMatch(/timetables\/.+/));
  await vi.waitFor(() => expect(lessons('5-А').length).toBeGreaterThan(0));
  return view;
}

describe('Розклад · редактор чернетки', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await startMockBackend();
  });

  it('копія опублікованої версії стає чернеткою, яку можна правити', async () => {
    const { router } = await openCopyOfCurrent();
    expect(screen.getByRole('button', { name: /^Чернетка / })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(router.state.location.pathname).not.toContain('7f3a1c20'); // не опублікована
  });

  it('клік «урок → урок» у рядку класу: сервер приймає обмін або відповідає 409, сітка не змінюється', async () => {
    const { user } = await openCopyOfCurrent();
    let saved = false;
    let rejected = false;
    const classes = screen
      .getAllByRole('rowheader')
      .map((h) => h.querySelector('span')!.textContent!);

    // мок-розклад щільний: шукаємо і прийнятий обмін, і відхилений
    for (const cls of classes) {
      for (let i = 0; i < 6 && !(saved && rejected); i++) {
        for (let j = i + 1; j < 6 && !(saved && rejected); j++) {
          const row = lessons(cls);
          const [a, b] = [row[i], row[j]];
          if (!a || !b) continue;
          const before = row.map(text);
          await user.click(a);
          expect(a).toHaveAttribute('aria-pressed', 'true');
          await user.click(b);
          const status = screen.getByRole('status');
          await vi.waitFor(() => expect(status).toHaveTextContent(/Збережено|недоступне/));

          if (status.textContent!.includes('Збережено в чернетці.')) {
            if (saved) continue;
            saved = true;
            const after = lessons(cls).map(text);
            expect(after[i]).toBe(before[j]);
            expect(after[j]).toBe(before[i]);
          } else if (!rejected) {
            rejected = true;
            // текст із conflicts[] (contracts): назва вчителя, день, урок — без ідентифікаторів
            expect(within(status).getAllByRole('listitem')[0]).toHaveTextContent(
              /^.+: накладка уроків \(понеділок, \d урок\)\.$/,
            );
            expect(lessons(cls).map(text)).toEqual(before);
          }
        }
      }
    }
    expect({ saved, rejected }).toEqual({ saved: true, rejected: true });
  });

  it('перетягування уроку на інший слот того ж класу — та сама правка', async () => {
    await openCopyOfCurrent();
    const row = lessons('5-А');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k),
      dropEffect: 'none',
      effectAllowed: 'all',
    };
    fireEvent.dragStart(row[0]!, { dataTransfer });
    const target = row[3]!.closest('td')!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Збережено в чернетці|недоступне/),
    );
  });

  it('Esc знімає вибір уроку', async () => {
    const { user } = await openCopyOfCurrent();
    await user.click(lessons('5-А')[0]!);
    expect(lessons('5-А')[0]).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Escape}');
    expect(lessons('5-А')[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
