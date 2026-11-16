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
