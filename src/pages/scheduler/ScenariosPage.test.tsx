import { fireEvent, screen, within } from '@testing-library/react';
import { addDaysIso, formatDate, todayKyiv } from '@/lib/time';
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

  it('дзвінки тривог: додати урок, зберегти — план повертається в чернетку', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    await screen.findByRole('heading', { name: 'Дзвінки тривог' });
    expect(screen.getByText('погоджено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Додати урок' }));
    fireEvent.change(screen.getByLabelText('Початок уроку 7'), { target: { value: '13:10' } });
    fireEvent.change(screen.getByLabelText('Кінець уроку 7'), { target: { value: '13:45' } });
    await user.click(screen.getByRole('button', { name: 'Зберегти дзвінки тривог' }));

    expect(await screen.findByText(/Дзвінки тривог збережено/)).toBeInTheDocument();
    expect(await screen.findByText('08:30–13:45, 7 уроків')).toBeInTheDocument();
    expect(screen.getByText('не погоджено')).toBeInTheDocument();
  });

  it('побудова rejected: видно причину (alert_plan_locked) і конфлікти', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path.startsWith('/api/v1/timetable/jobs/')) {
        return Response.json({
          job_id: 'j1',
          kind: 'build_alert',
          state: 'rejected',
          snapshot_version: 1,
          created_at: new Date().toISOString(),
          started_at: null,
          error: 'alert_plan_locked',
          conflicts: [
            { rule: 'capacity_exceeded', day: 2, condition: 'seats', value: 90, limit: 60 },
          ],
        });
      }
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    const { user } = renderPage(<ScenariosPage />);
    await user.click(await screen.findByRole('button', { name: /Побудувати план тривог/ }));
    expect(await screen.findByText(/План тривог уже погоджено або активовано/)).toBeInTheDocument();
    expect(
      screen.getByText('Укриття переповнене (вівторок): 90 при ліміті 60 (навчальні місця).'),
    ).toBeInTheDocument();
  });

  it('409 stale на активації: показує, яку умову ліміту 1.2 порушено', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/v1/timetable/alert-plan:activate') {
        return Response.json(
          {
            status: 409,
            title: 'Дані закладу змінилися',
            code: 'stale',
            conflicts: [
              { rule: 'capacity_exceeded', day: 1, condition: 'passport', value: 400, limit: 300 },
            ],
          },
          { status: 409 },
        );
      }
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    const { user } = renderPage(<ScenariosPage />);
    await user.click(await screen.findByRole('button', { name: 'Активувати' }));
    expect(await screen.findByText(/план тривог їм уже не відповідає/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Укриття переповнене (понеділок): 400 при ліміті 300 (паспортна місткість).',
      ),
    ).toBeInTheDocument();
  });

  it('запланованій активації можна задати дату повернення (:end до її початку)', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    const tomorrow = addDaysIso(todayKyiv(), 1);
    const back = addDaysIso(todayKyiv(), 3);
    await screen.findByRole('heading', { name: 'Тривоги' });
    fireEvent.change(screen.getByLabelText('З дати'), { target: { value: tomorrow } });
    await user.click(screen.getByRole('button', { name: 'Активувати' }));
    expect(await screen.findByText('запланована')).toBeInTheDocument();

    const form = within(
      screen
        .getByRole('heading', {
          name: `Повернення звичайного для активації з ${formatDate(tomorrow)}`,
        })
        .closest('form')!,
    );
    const input = form.getByLabelText('Звичайний розклад з');
    expect(input).toHaveAttribute('min', addDaysIso(tomorrow, 1));
    fireEvent.change(input, { target: { value: back } });
    await user.click(form.getByRole('button', { name: 'Повернути звичайний розклад' }));

    expect(
      await screen.findByText(`з ${formatDate(tomorrow)} по ${formatDate(back)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('запланована')).toBeInTheDocument(); // активація лишається, коротша
  });

  it('подвійний клік «Повернути звичайний розклад» — один запит :end', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    let endCalls = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith(':end')) endCalls++;
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    const { user } = renderPage(<ScenariosPage />);
    await screen.findByRole('heading', { name: 'Тривоги' });
    fireEvent.change(screen.getByLabelText('З дати'), { target: { value: todayKyiv() } });
    await user.click(screen.getByRole('button', { name: 'Активувати' }));
    const back = await screen.findByRole('button', { name: 'Повернути звичайний розклад' });
    await user.dblClick(back);
    await screen.findByText(new RegExp(`з ${formatDate(todayKyiv())} по `));
    expect(endCalls).toBe(1);
  });
});
