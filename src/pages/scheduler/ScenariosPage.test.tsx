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
    expect(
      await screen.findByText(`з ${formatDate(todayKyiv())}, без дати повернення`),
    ).toBeInTheDocument();
    // поки активація діє, план не перебудовують
    expect(
      screen.getByText(/перебудувати план і змінити дзвінки тривог не можна/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повернути звичайний розклад' }));
    // to — дата повернення (виключно): активація з сьогодні до завтра — один день тривог
    expect(
      await screen.findByText(
        `${formatDate(todayKyiv())} (один день), звичайний — з ${formatDate(addDaysIso(todayKyiv(), 1))}`,
      ),
    ).toBeVisible();
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

  it('підказка «Перебудуйте й погодьте» зникає, коли план погоджено', async () => {
    await startMockBackend();
    const sent: unknown[] = [];
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith(':approve')) sent.push(JSON.parse(String(init?.body)));
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    const { user } = renderPage(<ScenariosPage />);
    await screen.findByRole('heading', { name: 'Дзвінки тривог' });
    fireEvent.change(screen.getByLabelText('Кінець уроку 6'), { target: { value: '13:05' } });
    await user.click(screen.getByRole('button', { name: 'Зберегти дзвінки тривог' }));
    expect(await screen.findByText(/Дзвінки тривог збережено/)).toBeInTheDocument();

    // погодження: номер наказу з пробілами по краях іде на сервер обрізаним; подвійний клік — один запит
    await user.type(await screen.findByLabelText('Наказ №'), '  15-од  ');
    await user.type(screen.getByLabelText('Затвердив'), ' Директор ');
    await user.dblClick(screen.getByRole('button', { name: 'Погодити' }));
    expect(await screen.findByText('погоджено')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ order_no: '15-од', approved_by: 'Директор' });
    expect(screen.queryByText(/Дзвінки тривог збережено/)).not.toBeInTheDocument();
  });

  it('облік тривог: числа з правильними формами («5 днів», «1 год 30 хв»)', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (new URL(String(input), location.origin).pathname === '/api/v1/timetable/alert-hours')
        return Response.json({
          days: [],
          threshold_minutes: 90,
          threshold_days: 5,
          current_streak_days: 6,
          recommendation: true,
        });
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    renderPage(<ScenariosPage />);
    expect(
      await screen.findByText(/поріг: понад 1 год 30 хв за день, 5 днів поспіль/),
    ).toBeVisible();
    expect(screen.getByText(/Тривоги тривали понад 1 год 30 хв 6 днів поспіль/)).toBeVisible();
  });

  it('активація на неділю: підказка з найближчою навчальною датою', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    await screen.findByRole('heading', { name: 'Тривоги' });
    let sunday = addDaysIso(todayKyiv(), 1);
    while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = addDaysIso(sunday, 1);
    fireEvent.change(screen.getByLabelText('З дати'), { target: { value: sunday } });
    const hint = await screen.findByText(/не навчальний день/);
    await user.click(within(hint).getByRole('button'));
    expect(screen.getByLabelText('З дати')).toHaveValue(addDaysIso(sunday, 1)); // понеділок
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
      await screen.findByText(
        `з ${formatDate(tomorrow)} по ${formatDate(addDaysIso(back, -1))}, звичайний — з ${formatDate(back)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('запланована')).toBeInTheDocument(); // активація лишається, коротша
  });

  it('запланованої активації не скасувати повністю: :end з датою її початку — 422 від сервера', async () => {
    await startMockBackend();
    const { user } = renderPage(<ScenariosPage />);
    const tomorrow = addDaysIso(todayKyiv(), 1);
    await screen.findByRole('heading', { name: 'Тривоги' });
    fireEvent.change(screen.getByLabelText('З дати'), { target: { value: tomorrow } });
    await user.click(screen.getByRole('button', { name: 'Активувати' }));
    expect(await screen.findByText('запланована')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скасувати активацію' })).not.toBeInTheDocument();
    // правило 03: поки є майбутня активація, план не перебудовують і дзвінки тривог не змінюють
    expect(
      screen.queryByRole('button', { name: /Побудувати план тривог/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Дзвінки тривог' })).not.toBeInTheDocument();
    expect(screen.getByText(/повністю скасувати не можна/)).toBeInTheDocument();
    // мок, як сервер і специфікація: дата повернення має бути пізнішою за початок
    const { timetableApi } = await import('@/api/endpoints');
    const plan = await timetableApi.alertPlan();
    await expect(
      timetableApi.alertEnd(plan.activations[0]!.activation_id, tomorrow),
    ).rejects.toMatchObject({ status: 422, code: 'invalid_date' });
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
    await screen.findByText(new RegExp(`${formatDate(todayKyiv())} \\(один день\\)`));
    expect(endCalls).toBe(1);
  });
});
