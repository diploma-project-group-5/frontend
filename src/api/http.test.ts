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
        conflicts: [{ rule: 'capacity', day: 3, limit: 'passport' }],
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
});
