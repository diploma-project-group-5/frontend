import { screen } from '@testing-library/react';
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
