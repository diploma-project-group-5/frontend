import { screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { SubjectsTab } from './SubjectsTab';

async function setup() {
  await startMockBackend();
  const view = renderPage(<SubjectsTab />);
  await screen.findByRole('cell', { name: 'Математика' });
  return view;
}

describe('Дані закладу · Предмети', () => {
  it('додає предмет із галуззю й позначкою «не в укритті»', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: /Додати предмет/ }));
    const form = within(screen.getByRole('dialog', { name: 'Новий предмет' }));
    await user.type(form.getByLabelText('Назва'), 'Хореографія');
    await user.type(form.getByLabelText('Скорочення в сітці'), 'Хор');
    await user.selectOptions(form.getByLabelText('Освітня галузь'), 'arts');
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Додати' }));
    const row = (await screen.findByRole('cell', { name: 'Хореографія' })).closest('tr')!;
    expect(within(row).getByText('Хор')).toBeInTheDocument();
    expect(within(row).getByText('не проводиться')).toBeInTheDocument();
    // галузь зберігається в API
    await user.click(screen.getByRole('button', { name: 'Редагувати Хореографія' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Редагувати предмет' })).getByLabelText(
        'Освітня галузь',
      ),
    ).toHaveValue('arts');
  });

  it('предмет із плану не архівує: 409 → «ще використовується»', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Архівувати Математика' }));
    const ask = within(screen.getByRole('dialog', { name: 'Архівувати «Математика»?' }));
    await user.click(ask.getByRole('button', { name: 'Архівувати' }));
    expect(
      await screen.findByRole('dialog', { name: '«Математика» ще використовується' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Спершу приберіть години цього предмета з навчального плану.'),
    ).toBeVisible();
  });

  it('архівує предмет без годин у плані', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: /Додати предмет/ }));
    const form = within(screen.getByRole('dialog', { name: 'Новий предмет' }));
    await user.type(form.getByLabelText('Назва'), 'Етика');
    await user.type(form.getByLabelText('Скорочення в сітці'), 'Ет');
    await user.click(form.getByRole('button', { name: 'Додати' }));
    await screen.findByRole('cell', { name: 'Етика' });

    await user.click(screen.getByRole('button', { name: 'Архівувати Етика' }));
    const ask = within(screen.getByRole('dialog', { name: 'Архівувати «Етика»?' }));
    await user.click(ask.getByRole('button', { name: 'Архівувати' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('cell', { name: 'Етика' })).not.toBeInTheDocument(),
    );
  });
});
