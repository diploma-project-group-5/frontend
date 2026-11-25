import { screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { SchoolsPage } from './SchoolsPage';

async function openRegister() {
  const view = renderPage(<SchoolsPage />, { role: 'sysadmin' });
  await screen.findByText(/зареєстровано: \d+/);
  await view.user.click(screen.getByRole('button', { name: /Зареєструвати заклад/ }));
  const dialog = screen.getByRole('dialog');
  return { ...view, dialog: within(dialog) };
}

describe('Заклади (системний адмін)', () => {
  beforeEach(async () => {
    await startMockBackend();
  });

  it('перевіряє форму до запиту: назва й логін Keycloak', async () => {
    const { user, dialog } = await openRegister();
    await user.click(dialog.getByRole('button', { name: 'Зареєструвати' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Вкажіть назву закладу.');

    await user.type(dialog.getByLabelText('Назва закладу'), 'Гімназія № 3');
    await user.type(dialog.getByLabelText('Логін укладача розкладу'), 'Ab');
    await user.click(dialog.getByRole('button', { name: 'Зареєструвати' }));
    expect(dialog.getByRole('alert')).toHaveTextContent(/Логін: 3–32 символи/);
  });

  it('409 login_taken — повідомлення біля поля', async () => {
    const { user, dialog } = await openRegister();
    await user.type(dialog.getByLabelText('Назва закладу'), 'Гімназія № 3');
    await user.type(dialog.getByLabelText('Логін укладача розкладу'), 'taken');
    await user.click(dialog.getByRole('button', { name: 'Зареєструвати' }));
    expect(await dialog.findByText('Логін «taken» уже зайнятий. Оберіть інший.')).toBeVisible();
    expect(dialog.getByLabelText('Логін укладача розкладу')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('реєстрація: тимчасовий пароль один раз, заклад у реєстрі, пошук', async () => {
    const { user, dialog } = await openRegister();
    await user.type(dialog.getByLabelText('Назва закладу'), 'Гімназія № 3');
    // логін приводиться до нижнього регістру
    await user.type(dialog.getByLabelText('Логін укладача розкладу'), 'Gymn3');
    await user.click(dialog.getByRole('button', { name: 'Зареєструвати' }));

    const done = within(await screen.findByRole('dialog', { name: 'Заклад зареєстровано' }));
    expect(done.getByLabelText('Логін')).toHaveValue('gymn3');
    expect((done.getByLabelText('Тимчасовий пароль') as HTMLInputElement).value).not.toBe('');
    // Esc не закриває вікно: пароль показується лише раз
    const esc = new Event('cancel', { cancelable: true });
    screen.getByRole('dialog', { name: 'Заклад зареєстровано' }).dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    await user.click(done.getByRole('button', { name: 'Готово' }));
    expect(screen.queryByLabelText('Тимчасовий пароль')).not.toBeInTheDocument();

    expect(await screen.findByRole('cell', { name: 'Гімназія № 3' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Пошук закладу' }), 'gymn3');
    expect(screen.getAllByRole('row')).toHaveLength(2); // заголовок + знайдений
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'немає такого');
    expect(screen.getByText('Нічого не знайдено')).toBeInTheDocument();
  });

  it('тимчасовий пароль: «Назад» і закриття вкладки спершу питають', async () => {
    const { user, dialog, router } = await openRegister();
    await user.type(dialog.getByLabelText('Назва закладу'), 'Гімназія № 4');
    await user.type(dialog.getByLabelText('Логін укладача розкладу'), 'gymn4');
    await user.click(dialog.getByRole('button', { name: 'Зареєструвати' }));
    const done = within(await screen.findByRole('dialog', { name: 'Заклад зареєстровано' }));

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const from = router.state.location.pathname;
    void router.navigate('/admin/elsewhere');
    const ask = within(
      await screen.findByRole('dialog', { name: 'Тимчасовий пароль показується лише раз' }),
    );
    await user.click(ask.getByRole('button', { name: 'Залишитися' }));
    expect(router.state.location.pathname).toBe(from);
    expect((done.getByLabelText('Тимчасовий пароль') as HTMLInputElement).value).not.toBe('');
  });
});
