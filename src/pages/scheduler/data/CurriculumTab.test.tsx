import { screen, within } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { CurriculumTab } from './CurriculumTab';

async function setup() {
  await startMockBackend();
  const view = renderPage(<CurriculumTab />, { path: '/scheduler/data/curriculum' });
  await screen.findByRole('navigation', { name: 'Класи' });
  // перший предмет класу: у мок-плані в нього є години й вчитель
  const select = (await screen.findAllByRole('combobox'))[0] as HTMLSelectElement;
  const subject = select.getAttribute('aria-label')!.replace('Вчитель для ', '');
  return { ...view, subject, select };
}

describe('Дані закладу · Навчальний план', () => {
  it('години без вчителя не зберігає; з вчителем — один PUT і посилання на побудову', async () => {
    const { user, subject, select } = await setup();
    const className = within(screen.getByRole('navigation', { name: 'Класи' }))
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-current') === 'true')!
      .querySelector('span')!.textContent;

    const teacher = select.value;
    await user.selectOptions(select, '');
    expect(screen.getByText('План змінено.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти план' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Призначте вчителя: ${className} · ${subject}.`,
    );

    await user.selectOptions(select, teacher);
    await user.click(screen.getByRole('button', { name: `Більше годин: ${subject}` }));
    await user.click(screen.getByRole('button', { name: 'Зберегти план' }));
    expect(await screen.findByText('План збережено.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Побудувати чернетку →' })).toHaveAttribute(
      'href',
      '/scheduler/timetables',
    );
  });

  it('незбережені зміни: перехід з вкладки питає підтвердження', async () => {
    const { user, subject, router } = await setup();
    await user.click(screen.getByRole('button', { name: `Більше годин: ${subject}` }));

    void router.navigate('/scheduler/timetables');
    const dialog = within(await screen.findByRole('dialog', { name: 'Зміни плану не збережено' }));
    await user.click(dialog.getByRole('button', { name: 'Залишитися' }));
    expect(router.state.location.pathname).toBe('/scheduler/data/curriculum');

    void router.navigate('/scheduler/timetables');
    const again = within(await screen.findByRole('dialog', { name: 'Зміни плану не збережено' }));
    await user.click(again.getByRole('button', { name: 'Не зберігати' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/scheduler/timetables'));
  });
});
