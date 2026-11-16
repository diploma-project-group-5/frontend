import { screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { TeachersTab } from './TeachersTab';

async function setup() {
  await startMockBackend();
  const view = renderPage(<TeachersTab />);
  await screen.findByRole('cell', { name: 'Іваненко О. П.' });
  return view;
}

const row = (label: string) => screen.getByRole('cell', { name: label }).closest('tr')!;

describe('Дані закладу · Вчителі', () => {
  it('додає вчителя: унікальний підпис, недоступні дні, одразу QR', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: /Додати вчителя/ }));
    const form = within(screen.getByRole('dialog', { name: 'Новий вчитель' }));

    await user.type(form.getByLabelText('Підпис у розкладі'), 'Іваненко О. П.');
    await user.click(form.getByRole('button', { name: 'Додати' }));
    expect(form.getByRole('alert')).toHaveTextContent('Підпис має бути унікальним');

    await user.clear(form.getByLabelText('Підпис у розкладі'));
    await user.type(form.getByLabelText('Підпис у розкладі'), 'Петренко О. І.');
    await user.click(form.getByRole('checkbox', { name: 'Пт' }));
    await user.click(form.getByRole('button', { name: 'Додати' }));

    const qr = within(await screen.findByRole('dialog', { name: 'QR · Петренко О. І.' }));
    expect(qr.getByText(/покоління 1/)).toBeVisible();
    // перевипуск: старий код одразу недійсний
    await user.click(qr.getByRole('button', { name: /Перегенерувати…/ }));
    await user.click(qr.getByRole('button', { name: 'Перегенерувати' }));
    expect(await qr.findByText('Код перевипущено, старий більше не працює.')).toBeVisible();
    expect(qr.getByText(/покоління 2/)).toBeVisible();
    await user.click(qr.getByRole('button', { name: 'Готово' }));
    expect(within(row('Петренко О. І.')).getByText('Пт')).toBeInTheDocument();
    expect(within(row('Петренко О. І.')).getByText('0 / 18')).toBeInTheDocument();
  });

  it('редагує тижневий ліміт', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Редагувати Коваль Н. В.' }));
    const form = within(screen.getByRole('dialog', { name: 'Редагувати вчителя' }));
    const limit = form.getByLabelText('Тижневий ліміт годин (ставка)');
    await user.clear(limit);
    await user.type(limit, '30');
    await user.click(form.getByRole('button', { name: 'Зберегти' }));
    expect(await within(row('Коваль Н. В.')).findByText(/\/ 30$/)).toBeInTheDocument();
  });

  it('вчителя з плану не видаляє: показує класи, де він веде уроки', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Видалити Іваненко О. П.' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: '«Іваненко О. П.» ще використовується' }),
    );
    expect(
      dialog.getByText(/Спершу перепризначте уроки в навчальному плані: \d+-[А-Я]/),
    ).toBeVisible();
    expect(dialog.queryByRole('button', { name: 'Видалити' })).not.toBeInTheDocument();
  });

  it('видаляє вчителя без уроків: лишається «Вчитель #N»', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: /Додати вчителя/ }));
    const form = within(screen.getByRole('dialog', { name: 'Новий вчитель' }));
    await user.type(form.getByLabelText('Підпис у розкладі'), 'Тимчасовий Т. Т.');
    await user.click(form.getByRole('button', { name: 'Додати' }));
    await screen.findByRole('cell', { name: 'Тимчасовий Т. Т.' });
    await user.click(
      within(await screen.findByRole('dialog', { name: /^QR/ })).getByRole('button', {
        name: 'Готово',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Видалити Тимчасовий Т. Т.' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Видалити дані вчителя «Тимчасовий Т. Т.»?' }),
    );
    expect(dialog.getByText(/залишиться «Вчитель #9»/)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Видалити' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('cell', { name: 'Тимчасовий Т. Т.' })).not.toBeInTheDocument(),
    );
  });
});
