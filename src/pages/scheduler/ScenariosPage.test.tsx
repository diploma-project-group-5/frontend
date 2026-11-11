import { fireEvent, screen } from '@testing-library/react';
import { formatDate, todayKyiv } from '@/lib/time';
import { renderPage, startMockBackend } from '@/test/render';
import { ScenariosPage } from './ScenariosPage';

describe('Сценарії: розклад тривог', () => {
  it('активація з сьогодні й повернення звичайного розкладу', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    expect(await screen.findByRole('heading', { name: 'Тривоги' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('З дати'), { target: { value: todayKyiv() } });
    await user.click(screen.getByRole('button', { name: 'Активувати' }));
    expect(await screen.findByText(`з ${formatDate(todayKyiv())} — діє далі`)).toBeInTheDocument();
    // поки активація діє, план не перебудовують
    expect(
      screen.getByText(/перебудувати план і змінити дзвінки тривог не можна/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повернути звичайний розклад' }));
    expect(await screen.findByText(new RegExp(`з ${formatDate(todayKyiv())} по `))).toBeVisible();
  });

  it('облік тривог: хвилини за сьогодні з’являються на графіку', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    await screen.findByRole('heading', { name: /Облік тривог/ });
    fireEvent.change(screen.getByLabelText('Дата'), { target: { value: todayKyiv() } });
    await user.type(screen.getByLabelText('Тривалість, хв'), '300');
    await user.click(screen.getByRole('button', { name: 'Внести' }));
    expect(await screen.findByTitle(`${formatDate(todayKyiv())}: 300 хв`)).toBeInTheDocument();
  });
});
