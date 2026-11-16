import { ApiError, isApiError, request, setTokenProvider } from './http';

function mockFetch(status: number, body: unknown, contentType = 'application/json') {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': contentType },
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setTokenProvider(async () => undefined);
});

describe('request', () => {
  it('розбирає problem+json у ApiError з code і conflicts', async () => {
    mockFetch(
      409,
      {
        type: 'about:blank',
        title: 'Дані змінилися',
        status: 409,
        code: 'stale',
        conflicts: [
          { rule: 'capacity_exceeded', day: 2, condition: 'seats', value: 160, limit: 150 },
        ],
      },
      'application/problem+json',
    );

    const err = await request('/timetable/timetables/x:publish', { method: 'POST' }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(isApiError(err, 'stale')).toBe(true);
    expect((err as ApiError).conflicts).toHaveLength(1);
    expect((err as ApiError).status).toBe(409);
  });

  it('додає Bearer-токен для кабінету', async () => {
    const fetchMock = mockFetch(200, []);
    setTokenProvider(async () => 'jwt-123');
    await request('/school/classes');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
  });

  it('публічний запит іде без JWT і без токена в URL', async () => {
    const fetchMock = mockFetch(200, { state: 'not_published' });
    setTokenProvider(async () => 'jwt-123');
    await request('/public/timetable', {
      anonymous: true,
      headers: { 'X-Access-Token': 'secret.token.mac' },
    });
    const [url, init] = fetchMock.mock.calls[0]! as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Access-Token']).toBe('secret.token.mac');
    expect(String(url)).not.toContain('secret');
    expect(init.referrerPolicy).toBe('no-referrer');
  });

  it('повертає статус 202 для довгих операцій', async () => {
    mockFetch(202, { job_id: 'j1' });
    const res = await request<{ job_id: string }>('/timetable/timetables:build', {
      method: 'POST',
    });
    expect(res.status).toBe(202);
    expect(res.data.job_id).toBe('j1');
  });

  it('query-параметри: undefined пропускає, решту кодує', async () => {
    const fetchMock = mockFetch(200, []);
    await request('/school/audit', { query: { from: '2026-11-01', to: undefined, n: 3 } });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/v1/school/audit');
    expect(url.searchParams.get('from')).toBe('2026-11-01');
    expect(url.searchParams.has('to')).toBe(false);
    expect(url.searchParams.get('n')).toBe('3');
  });

  it('помилка не в JSON (напр. від шлюзу): текст іде в title, code немає', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    const err = (await request('/school/classes').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.title).toBe('Bad Gateway');
    expect(err.code).toBeUndefined();
    expect(err.conflicts).toEqual([]);
    expect(isApiError(err, 'stale')).toBe(false);
  });

  it('порожня відповідь (204) — data undefined, без помилки розбору', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const res = await request('/school/teachers/t9', { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(res.data).toBeUndefined();
  });

  it('тіло запиту — JSON із Content-Type', async () => {
    const fetchMock = mockFetch(200, {});
    await request('/school/bells', { method: 'PUT', body: [{ lesson_no: 1 }] });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe('[{"lesson_no":1}]');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.credentials).toBe('omit');
  });
});
