import { screen, within } from '@testing-library/react';
import { timetableApi } from '@/api/endpoints';
import { addDaysIso, formatDate, minEffectiveFrom, todayKyiv } from '@/lib/time';
import { renderPage, startMockBackend } from '@/test/render';
import { ApprovalPage } from './ApprovalPage';

/** Версія для погодження: копія чинної в стані validated. */
async function setup() {
  await startMockBackend();
  const list = await timetableApi.list();
  const draft = await timetableApi.copy(list.find((v) => v.state === 'published')!.timetable_id);
  const view = renderPage(<ApprovalPage />, { path: '/scheduler/approval' });
  await screen.findByRole('heading', { name: 'Погодження' });
  return { ...view, draft };
}

async function fill(user: ReturnType<typeof renderPage>['user'], orderNo: string) {
  await user.type(await screen.findByLabelText('Наказ №'), orderNo);
  await user.type(screen.getByLabelText('Затвердив'), 'Директорка Коваленко О. В.');
}

describe('Погодження й публікація', () => {
  it('публікує версію з реквізитами наказу', async () => {
    const { user, draft } = await setup();
    expect(screen.getByRole('combobox')).toHaveValue(draft.timetable_id);
    await fill(user, '41-о');
    expect(screen.getByLabelText('Діє з')).toHaveValue(minEffectiveFrom());
    await user.click(screen.getByRole('button', { name: 'Опублікувати' }));
    expect(
      await screen.findByText(`Розклад опубліковано, діє з ${formatDate(minEffectiveFrom())}.`),
    ).toBeInTheDocument();
    const after = await timetableApi.get(draft.timetable_id);
    expect(after.state).toBe('published');
  });

  it('409 stale: пояснення й текст конфлікту з contracts, без кодів', async () => {
    const { user } = await setup();
    await fill(user, 'stale-1');
    await user.click(screen.getByRole('button', { name: 'Опублікувати' }));
    const notice = (await screen.findByText(/Дані закладу змінилися/)).closest('div')!;
    expect(within(notice).getByRole('listitem')).toHaveTextContent(
      'Укриття переповнене (середа): 171 при ліміті 160 (паспортна місткість).',
    );
  });

  it('дату раніше ніж за 7 днів форма не відправляє (min у полі; сервер перевіряє сам — 422)', async () => {
    const { user, draft } = await setup();
    await fill(user, '42-о');
    const from = screen.getByLabelText('Діє з');
    expect(from).toHaveAttribute('min', minEffectiveFrom());
    await user.clear(from);
    await user.type(from, addDaysIso(todayKyiv(), 1));
    expect(from).toBeInvalid();
    await user.click(screen.getByRole('button', { name: 'Опублікувати' }));
    expect((await timetableApi.get(draft.timetable_id)).state).toBe('validated');
  });
});
