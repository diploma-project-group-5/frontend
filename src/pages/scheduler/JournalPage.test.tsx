import { screen } from '@testing-library/react';
import { schoolApi } from '@/api/endpoints';
import { renderPage, startMockBackend } from '@/test/render';
import { JournalPage } from './JournalPage';

it('журнал показує дію над даними закладу за період', async () => {
  await startMockBackend();
  await schoolApi.createTeacher({
    label: 'Нова Н. Н.',
    weekly_hours_limit: 10,
    unavailable_days: [],
  });
  renderPage(<JournalPage />);
  expect(await screen.findByRole('heading', { name: 'Журнал' })).toBeInTheDocument();
  expect(await screen.findByRole('cell', { name: 'Додано вчителя' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Вчитель #9' })).toBeInTheDocument();
  // без прізвищ у журналі (лише ідентифікатори), як у school-service
  expect(screen.queryByText(/Нова Н\. Н\./)).not.toBeInTheDocument();
});

it('журнал не показує машинних кодів: дія й деталі українською', async () => {
  await startMockBackend();
  await schoolApi.putProfile({ shelter_capacity: 200 });
  renderPage(<JournalPage />);
  expect(await screen.findByRole('cell', { name: 'Змінено профіль закладу' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'поля: місткість укриття' })).toBeInTheDocument();
  expect(screen.queryByText(/profile_updated|shelter_capacity/)).not.toBeInTheDocument();
});
