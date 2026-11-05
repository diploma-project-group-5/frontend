import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { PublicTimetable } from '@/api/types';
import { readTokenFromHash } from '@/lib/qrToken';
import { ClassTimetablePage } from './PublicTimetablePage';

function renderAt(hash: string) {
  window.location.hash = hash;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClassTimetablePage />
    </QueryClientProvider>,
  );
}

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const sample: PublicTimetable = {
  state: 'published',
  target_label: '7-А',
  published_at: '2026-10-12T09:00:00Z',
  upcoming_change: 'З 16.11 діє новий розклад',
  weeks: [
    {
      week: '2026-W45',
      days: [
        {
          date: '2026-11-05',
          format: 'in_person',
          lessons: [
            {
              lesson_no: 1,
              start: '08:30',
              end: '09:15',
              subject: 'Математика',
              substitution: false,
            },
            { lesson_no: 2, start: '09:25', end: '10:10', subject: 'Історія', substitution: true },
          ],
        },
      ],
    },
    { week: '2026-W46', days: [] },
  ],
};

describe('readTokenFromHash', () => {
  it('бере токен із фрагмента', () => {
    expect(readTokenFromHash('#abc.def.ghi')).toBe('abc.def.ghi');
    expect(readTokenFromHash('')).toBeNull();
    expect(readTokenFromHash('#')).toBeNull();
  });
});

describe('сторінка класу за QR', () => {
  it('без токена — «Посилання недійсне», запиту немає', () => {
    const fetchMock = mockFetch(200, sample);
    renderAt('');
    expect(screen.getByText(/Посилання недійсне/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 від сервера — той самий текст', async () => {
    mockFetch(404, { title: 'Not Found', status: 404 });
    renderAt('#bad.token.mac');
    expect(await screen.findByText(/Посилання недійсне/)).toBeInTheDocument();
  });

  it('показує уроки, формат дня, банер і позначку «Заміна»', async () => {
    const fetchMock = mockFetch(200, sample);
    renderAt('#good.token.mac');

    expect(await screen.findByRole('heading', { name: '7-А' })).toBeInTheDocument();
    expect(screen.getByText('Математика')).toBeInTheDocument();
    expect(screen.getByText('Очно')).toBeInTheDocument();
    expect(screen.getByText('Заміна')).toBeInTheDocument();
    expect(screen.getByText('З 16.11 діє новий розклад')).toBeInTheDocument();

    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    expect(String(url)).toMatch(/\/api\/v1\/public\/timetable$/);
    expect((init.headers as Record<string, string>)['X-Access-Token']).toBe('good.token.mac');
  });

  it('до першої публікації — «ще не опубліковано»', async () => {
    mockFetch(200, { ...sample, state: 'not_published', weeks: [] });
    renderAt('#good.token.mac');
    expect(await screen.findByText(/ще не опубліковано/)).toBeInTheDocument();
  });
});
