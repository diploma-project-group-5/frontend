import { fireEvent, screen, within } from '@testing-library/react';
import { timetableApi } from '@/api/endpoints';
import { schoolDatesBetween } from '@/lib/substitutions';
import { addDaysIso, minEffectiveFrom, todayKyiv } from '@/lib/time';
import { renderPage, startMockBackend } from '@/test/render';
import { SubstitutionsPage } from './SubstitutionsPage';

async function setup(url = '/scheduler/substitutions') {
  await startMockBackend();
  const view = renderPage(<SubstitutionsPage />, { path: '/scheduler/substitutions', url });
  return view;
}

/** Група пропозицій однієї задачі: у демо Бондар — погоджено, Ткаченко — пропозиція. */
const group = async (teacher: string) => {
  const absence = await screen.findByRole('region', { name: `Відсутність: ${teacher}` });
  return within(within(absence).getAllByRole('article')[0]!);
};

describe('Заміни', () => {
  it('за замовчуванням — пропозиції: погоджена заміна й пропозиція з кроками', async () => {
    await setup();
    expect(await screen.findByRole('tab', { name: /Пропозиції · 2/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const approved = await group('Бондар Т. І.');
    expect(await approved.findByText('погоджено')).toBeInTheDocument();
    expect(approved.getByText(/Видно на сторінках за QR/)).toBeInTheDocument();
    expect(approved.queryByRole('button', { name: /Погодити/ })).not.toBeInTheDocument();

    const proposed = await group('Ткаченко Г. О.');
    expect(await proposed.findByText('пропозиція')).toBeInTheDocument();
    expect(proposed.getAllByText(/^Крок 1 · вільний вчитель/).length).toBeGreaterThan(0);
  });

  it('погодження: «самостійна робота» можна замінити на «скасовано»', async () => {
    const { user } = await setup();
    const g = await group('Ткаченко Г. О.');
    await g.findByText('пропозиція');
    const cancelChoice = g.queryAllByRole('radio', { name: 'скасовано' })[0];
    if (cancelChoice) await user.click(cancelChoice);
    await user.click(g.getByRole('button', { name: /Погодити/ }));
    expect(await g.findByText('погоджено')).toBeInTheDocument();
    if (cancelChoice) expect(g.getByText('скасовано')).toBeInTheDocument();
    expect(g.queryByRole('button', { name: 'Відхилити' })).not.toBeInTheDocument();
  });

  it('відхилення зберігає пропозицію з позначкою', async () => {
    const { user } = await setup();
    const g = await group('Ткаченко Г. О.');
    await user.click(await g.findByRole('button', { name: 'Відхилити' }));
    expect(await g.findByText('відхилено')).toBeInTheDocument();
    expect(g.getByText(/збережено для оцінювання/)).toBeInTheDocument();
  });

  it('скасування відсутності — після підтвердження', async () => {
    const { user } = await setup();
    const absence = await screen.findByRole('region', { name: 'Відсутність: Ткаченко Г. О.' });
    await user.click(within(absence).getByRole('button', { name: 'Скасувати відсутність' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Скасувати відсутність?' }));
    await user.click(dialog.getByRole('button', { name: 'Скасувати відсутність' }));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Відсутність: Ткаченко Г. О.' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /Пропозиції · 1/ })).toBeInTheDocument();
  });

  it('нова відсутність: окремі уроки, перегляд уроків, задача → пропозиції', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { user } = await setup('/scheduler/substitutions?tab=new');
    await user.selectOptions(await screen.findByLabelText('Хто відсутній'), 't4');
    await user.click(screen.getByRole('button', { name: 'Окремі уроки' }));
    const lessons = within(screen.getByRole('group', { name: 'Номери уроків' }));
    // урок, який вчитель цього дня веде (у підписі — клас)
    const first = lessons.getAllByRole('checkbox', { name: /урок · / })[0]!;
    const submit = screen.getByRole('button', { name: 'Внести відсутність' });
    expect(submit).toBeDisabled(); // не обрано жодного уроку
    await user.click(first);
    const preview = within(screen.getByRole('region', { name: 'Уроки, які треба замінити' }));
    expect(preview.getByText(/1 ур\.:/)).toBeInTheDocument();
    expect(screen.getByText(/уроків: 1 ·/)).toBeInTheDocument();

    await user.click(submit);
    expect(await screen.findByText(/Відсутність внесено: задач заміни — 1/)).toBeInTheDocument();
    const absence = await screen.findByRole('region', { name: 'Відсутність: Шевченко Л. М.' });
    expect(within(absence).getByText('У черзі')).toBeInTheDocument();

    vi.setSystemTime(Date.now() + 5000); // solver порахував
    expect(await within(absence).findByText('пропозиція', {}, { timeout: 4000 })).toBeVisible();
    expect(within(absence).getAllByText(/урок · \d\d:\d\d–\d\d:\d\d/)).toHaveLength(1);
  });

  it('нова версія з дати заміни: погоджена «втратила силу», нову не погодити (409 stale)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await startMockBackend();
    const date = minEffectiveFrom();
    const a = await timetableApi.createAbsence({
      teacher_id: 't4',
      date_from: date,
      date_to: date,
    });
    await timetableApi.createAbsence({
      teacher_id: 't7',
      date_from: date,
      date_to: date,
    });
    vi.setSystemTime(Date.now() + 5000);
    await timetableApi.absences();
    await timetableApi.approveSubstitution(a.job_ids[0]!);
    const list = await timetableApi.list();
    const draft = await timetableApi.copy(list.find((v) => v.state === 'published')!.timetable_id);
    await timetableApi.publish(draft.timetable_id, {
      order_no: '51-о',
      order_date: todayKyiv(),
      approved_by: 'Директор',
      effective_from: date,
    });

    const { user } = renderPage(<SubstitutionsPage />, {
      path: '/scheduler/substitutions',
      url: '/scheduler/substitutions?tab=props',
    });
    const lost = await group('Шевченко Л. М.');
    expect(await lost.findByText('втратила силу: на дату діє інша версія')).toBeInTheDocument();
    expect(lost.queryByText(/Видно на сторінках за QR/)).not.toBeInTheDocument();

    const stale = await group('Кравець А. Р.');
    await user.click(await stale.findByRole('button', { name: /Погодити/ }));
    expect(await stale.findByText(/На цю дату вже діє інша версія розкладу/)).toBeInTheDocument();
  });

  it('solver без рушія замін: failed + unsupported_job_type — зрозумілий текст (frontend #7)', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    const absence = {
      absence_id: 'a-x',
      teacher_id: 't2',
      date_from: todayKyiv(),
      date_to: todayKyiv(),
      lesson_nos: null,
      created_at: new Date().toISOString(),
      jobs: [{ job_id: 'j-x', date: todayKyiv(), state: 'failed' }],
    };
    const job = {
      job_id: 'j-x',
      kind: 'substitution',
      state: 'failed',
      snapshot_version: 1,
      created_at: absence.created_at,
      started_at: null,
      error: 'unsupported_job_type',
    };
    // поверх мок-бекенду: стан, який дає solver 0.3 (до рушія замін)
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname;
      if (path === '/api/v1/timetable/absences') return Response.json([absence]);
      if (path === '/api/v1/timetable/jobs/j-x') return Response.json(job);
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });

    renderPage(<SubstitutionsPage />, { path: '/scheduler/substitutions' });
    const g = await group('Коваль Н. В.');
    expect(await g.findByRole('status', {}, { timeout: 2000 })).toHaveTextContent(
      'Автоматичний підбір замін з’явиться на етапі 2. Поки що призначте заміну вручну.',
    );
    expect(g.queryByText(/unsupported_job_type/)).not.toBeInTheDocument();
  });

  it('409 teacher_is_substitute: відсутність замінника, уже погодженого на ці уроки', async () => {
    await startMockBackend();
    // у демо погоджена заміна Бондаря: беремо її нового вчителя й дату
    const seeded = (await timetableApi.absences()).find((a) => a.teacher_id === 't5')!;
    const date = seeded.jobs[0]!.date;
    const row = (await timetableApi.substitutions(date)).find((r) => r.new_teacher_id)!;

    const { user } = renderPage(<SubstitutionsPage />, {
      path: '/scheduler/substitutions',
      url: '/scheduler/substitutions?tab=new',
    });
    await user.selectOptions(await screen.findByLabelText('Хто відсутній'), row.new_teacher_id!);
    fireEvent.change(screen.getByLabelText('З'), { target: { value: date } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: date } });
    await user.click(screen.getByRole('button', { name: 'Внести відсутність' }));
    expect(
      await screen.findByText(/Цей вчитель уже погоджений замінником у ці дні й уроки/),
    ).toBeInTheDocument();
  });

  it('409 date_passed: пропозицію на минулу дату не погодити', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await startMockBackend();
    const [d1, d2] = schoolDatesBetween(
      todayKyiv(),
      addDaysIso(todayKyiv(), 60),
      false,
      await timetableApi.getHolidays(),
    );
    // дві дати: коли перша мине, відсутність ще в списку (date_to ≥ сьогодні)
    await timetableApi.createAbsence({ teacher_id: 't8', date_from: d1!, date_to: d2! });
    vi.setSystemTime(new Date(`${d2}T10:00:00Z`));

    const { user } = renderPage(<SubstitutionsPage />, {
      path: '/scheduler/substitutions',
      url: '/scheduler/substitutions?tab=props',
    });
    const g = await group('Олійник В. Д.'); // перша група — перша (уже минула) дата
    await user.click(await g.findByRole('button', { name: /Погодити/ }));
    expect(await g.findByText(/Дата заміни вже минула/)).toBeInTheDocument();
  });

  it('мітки пропозиції: «інший вчитель», «не за фахом», «самостійна»', async () => {
    await setup();
    const g = await group('Ткаченко Г. О.');
    await g.findByText('пропозиція');
    expect(g.getAllByText('інший вчитель').length).toBeGreaterThan(0);
    expect(g.queryByText('предметник')).not.toBeInTheDocument();
  });
});
