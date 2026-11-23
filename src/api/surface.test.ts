import solveStatus from '@lad/contracts/schemas/events/solve.status.v1.json';
import mockSource from '@/mocks/server.ts?raw';
import { startMockBackend } from '@/test/render';
import { publicApi, schoolApi, tenantApi, timetableApi } from './endpoints';
import { ApiError } from './http';
import surface from './surface.json';
import { jobErrorText } from './useJob';

/**
 * Звірка клієнта й мока з API сервісів. Знімок src/api/surface.json будує scripts/api-surface.mjs
 * з коду timetable/school/tenant-service (OpenAPI в contracts немає); CI окремо перевіряє, що
 * знімок відповідає develop сервісів (npm run api:surface:check).
 */

const API = '/api/v1';
const CLIENTS = { tenantApi, schoolApi, timetableApi, publicApi } as const;

/** Аргумент-заглушка: будь-яке поле й приведення до рядка дають «x». */
const any: unknown = new Proxy(
  {},
  {
    get: (_, key) => (key === Symbol.toPrimitive || key === 'toString' ? () => 'x' : 'x'),
  },
);

type Call = { name: string; method: string; path: string };

function routeRegex(route: string) {
  const [method, path] = route.split(' ') as [string, string];
  const re = path
    .split('{}')
    .map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
    .join('[^/]+?');
  return { method, re: new RegExp(`^${re}$`) };
}
const ROUTES = surface.routes.map(routeRegex);
const onServer = (c: Call) => ROUTES.some((r) => r.method === c.method && r.re.test(c.path));

/** Викликає кожен метод клієнта й записує, який запит він шле. */
async function clientCalls(): Promise<Call[]> {
  const calls: Call[] = [];
  let current = '';
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    calls.push({
      name: current,
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname.slice(url.pathname.indexOf(API) + API.length),
    });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    for (const [group, client] of Object.entries(CLIENTS)) {
      for (const [name, fn] of Object.entries(client)) {
        current = `${group}.${name}`;
        await (fn as (...a: unknown[]) => Promise<unknown>)(any, any, any).catch(() => {});
      }
    }
  } finally {
    globalThis.fetch = real;
  }
  return calls;
}

describe('клієнт і мок відповідають API сервісів (src/api/surface.json)', () => {
  it('кожен метод клієнта шле запит на маршрут, який є в сервісах', async () => {
    const calls = await clientCalls();
    const methods = Object.values(CLIENTS).reduce((n, c) => n + Object.keys(c).length, 0);
    expect(calls).toHaveLength(methods); // жоден метод не пропущено
    expect(
      calls.filter((c) => !onServer(c)).map((c) => `${c.name}: ${c.method} ${c.path}`),
    ).toEqual([]);
  });

  it('мок обробляє кожен запит клієнта', async () => {
    const calls = await clientCalls();
    await startMockBackend();
    const missing: string[] = [];
    const unhandled = async (method: string, path: string) => {
      let res: Response;
      try {
        res = await fetch(`${API}${path}`, {
          method,
          headers: { 'content-type': 'application/json', 'X-Access-Token': 'x' },
          body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
        });
      } catch {
        return false; // обробник знайшовся, але тіло-заглушка йому не підійшло
      }
      const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
      return typeof body?.title === 'string' && body.title.startsWith('Мок: немає обробника');
    };
    for (const c of calls) {
      // параметр шляху «x» мок може не впізнати за форматом (номер уроку, дата) — пробуємо типові
      const variants = ['x', '1', '2026-11-02'].map((v) =>
        c.path.replace(/(?<=\/)x(?=\/|:|$)/g, v),
      );
      let handled = false;
      for (const path of variants) if (!(await unhandled(c.method, path))) handled = true;
      if (!handled) missing.push(`${c.name}: ${c.method} ${c.path}`);
    }
    expect(missing).toEqual([]);
  });

  it('мок не відповідає на маршрути, яких немає в сервісах', () => {
    const literal = [...mockSource.matchAll(/path === '([^']+)' && method === '([A-Z]+)'/g)].map(
      (m) => ({ name: 'мок', method: m[2]!, path: m[1]! }),
    );
    expect(literal.length).toBeGreaterThan(20);
    expect(literal.filter((c) => !onServer(c)).map((c) => `${c.method} ${c.path}`)).toEqual([]);
  });

  it('мок відповідає лише тими кодами problem+json і статусами, що є в сервісах', () => {
    const codes = new Set(surface.problems);
    const used = [...mockSource.matchAll(/problem\(\s*(\d{3}),\s*'([a-z_]+)'/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(used.length).toBeGreaterThan(10);
    expect([...new Set(used)].filter((c) => !codes.has(c))).toEqual([]);
  });

  it('кожен код збою солвера з contracts (solve.status.v1) має людський текст', () => {
    // error.code у solve.status.v1: enum кодів збою солвера
    const codes = [
      ...JSON.stringify(solveStatus).matchAll(/"code":\{[^}]*?"enum":\[([^\]]+)\]/g),
    ].flatMap((m) => JSON.parse(`[${m[1]}]`) as string[]);
    expect(codes).toContain('unsupported_job_type');
    expect(codes.filter((c) => jobErrorText(c)!.startsWith('Код збою'))).toEqual([]);
  });

  it('ApiError розбирає problem+json мока так само, як від сервісів', async () => {
    await startMockBackend();
    const err = await timetableApi.getJob('no-such-job').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(surface.problems).toContain(`${(err as ApiError).status} ${(err as ApiError).code}`);
  });
});
