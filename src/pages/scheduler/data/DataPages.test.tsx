import { screen, within } from '@testing-library/react';
import { schoolApi } from '@/api/endpoints';
import { renderPage, startMockBackend } from '@/test/render';
import { SchoolTab } from './DataPages';

it('Заклад: зберігає змінені поля профілю', async () => {
  await startMockBackend();
  const { user } = renderPage(<SchoolTab />);
  const capacity = await screen.findByLabelText('Паспортна місткість укриття, осіб');
  await user.clear(capacity);
  await user.type(capacity, '175');
  await user.click(screen.getByRole('checkbox', { name: /субот/i }));
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(
    await screen.findByText(
      'Збережено. Чинні версії перевірять на нових даних під час публікації.',
    ),
  ).toBeInTheDocument();
  const p = await schoolApi.getProfile();
  expect(p.shelter_capacity).toBe(175);
  expect(p.saturday).toBe(true);
});

it('Заклад: заповнену місткість не можна очистити — форма не відправляється', async () => {
  await startMockBackend();
  const { user } = renderPage(<SchoolTab />);
  const capacity = await screen.findByLabelText('Паспортна місткість укриття, осіб');
  expect(capacity).toBeRequired();
  await user.clear(capacity);
  await user.click(screen.getByRole('button', { name: 'Зберегти' }));
  expect(screen.queryByText(/Збережено/)).not.toBeInTheDocument();
  expect((await schoolApi.getProfile()).shelter_capacity).not.toBeNull();
});

it('Заклад: незбережені зміни — попередження при переході, «Залишитися» лишає введене', async () => {
  await startMockBackend();
  const { user, router } = renderPage(<SchoolTab />, { path: '/data/school' });
  const capacity = await screen.findByLabelText('Паспортна місткість укриття, осіб');
  await user.clear(capacity);
  await user.type(capacity, '512');
  void router.navigate('/data/classes');
  const dialog = within(await screen.findByRole('dialog', { name: 'Дані закладу не збережено' }));
  await user.click(dialog.getByRole('button', { name: 'Залишитися' }));
  expect(router.state.location.pathname).toBe('/data/school');
  expect(screen.getByLabelText('Паспортна місткість укриття, осіб')).toHaveValue(512);
});
