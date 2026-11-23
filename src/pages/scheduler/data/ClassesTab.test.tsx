import { screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { ClassesTab } from './ClassesTab';

async function setup() {
  await startMockBackend();
  const view = renderPage(<ClassesTab />);
  await screen.findByRole('cell', { name: /^5-А/ });
  return view;
}

describe('Дані закладу · Класи', () => {
  it('додає клас; назва обов’язкова й унікальна серед активних', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: /Додати клас/ }));
    const form = within(screen.getByRole('dialog', { name: 'Новий клас або група' }));
    const save = form.getByRole('button', { name: 'Створити' });

    // порожню назву не пропускає браузер (required)
    expect(form.getByLabelText('Назва')).toBeInvalid();
    await user.type(form.getByLabelText('Назва'), '5-А');
    await user.click(save);
    expect(form.getByRole('alert')).toHaveTextContent('5-А уже існує');

    await user.clear(form.getByLabelText('Назва'));
    await user.type(form.getByLabelText('Назва'), '8-В');
    await user.clear(form.getByLabelText('Кількість учнів'));
    await user.type(form.getByLabelText('Кількість учнів'), '27');
    await user.click(save);
    const row = (await screen.findByRole('cell', { name: /^8-В/ })).closest('tr')!;
    expect(within(row).getByText('27')).toBeInTheDocument();
  });

  it('введене у формі не губиться: Esc, «Скасувати» і «Назад» спершу питають', async () => {
    await startMockBackend();
    const { user, router } = renderPage(<ClassesTab />, { path: '/data/classes' });
    await screen.findByRole('cell', { name: /^5-А/ });

    // без змін «Скасувати» закриває одразу
    await user.click(screen.getByRole('button', { name: /Додати клас/ }));
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('dialog', { name: 'Новий клас або група' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Додати клас/ }));
    const dialog = screen.getByRole('dialog', { name: 'Новий клас або група' });
    await user.type(within(dialog).getByLabelText('Назва'), '9-Б');

    const esc = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    const ask = await within(dialog).findByRole('alert');
    expect(ask).toHaveTextContent('Введене не збережено');
    await user.click(within(ask).getByRole('button', { name: 'Повернутися до форми' }));
    expect(within(dialog).getByLabelText('Назва')).toHaveValue('9-Б');

    // «Назад» / перехід — спільне вікно незбережених змін
    void router.navigate('/data/subjects');
    const prompt = within(await screen.findByRole('dialog', { name: 'Клас не збережено' }));
    await user.click(prompt.getByRole('button', { name: 'Залишитися' }));
    expect(router.state.location.pathname).toBe('/data/classes');
    expect(within(dialog).getByLabelText('Назва')).toHaveValue('9-Б');

    await user.click(within(dialog).getByRole('button', { name: 'Скасувати' }));
    await user.click(within(dialog).getByRole('button', { name: 'Не зберігати' }));
    expect(screen.queryByRole('dialog', { name: 'Новий клас або група' })).not.toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: /^9-Б/ })).not.toBeInTheDocument();
  });

  it('архівує клас', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Архівувати 5-А' }));
    const ask = within(screen.getByRole('dialog', { name: /Архівувати «5-А»/ }));
    await user.click(ask.getByRole('button', { name: 'Архівувати' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('cell', { name: /^5-А/ })).not.toBeInTheDocument(),
    );
  });
});
