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

  it('GET /jobs/{id} упав — кнопку побудови знову можна натиснути, є «Оновити стан»', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    let jobCalls = 0;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path.startsWith('/api/v1/timetable/jobs/')) {
        jobCalls++;
        return Response.json({ status: 503, title: 'Service Unavailable' }, { status: 503 });
      }
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    const { user } = renderPage(<ScenariosPage />);
    const build = await screen.findByRole('button', { name: /Побудувати план тривог/ });
    await user.click(build);
    expect(await screen.findByRole('button', { name: 'Оновити стан' })).toBeInTheDocument();
    expect(build).toBeEnabled();
    const calls = jobCalls;
    await new Promise((r) => setTimeout(r, 1700)); // довше за інтервал опитування
    expect(jobCalls).toBe(calls); // після помилки не опитуємо
  });
});
