#!/usr/bin/env node
/**
 * Знімок API сервісів «Лад» для звірки клієнта й мока (src/api/surface.test.ts).
 *
 * OpenAPI у contracts немає, тож маршрути й коди problem+json беруться з коду сервісів:
 * app.ts (маршрути Fastify, дії «:дія») і src/** (fail/problem(статус, 'код')).
 *
 *   npm run api:surface                 — клонує develop timetable/school/tenant-service з GitHub
 *   npm run api:surface -- --dir ../    — бере локальні копії сервісів з теки (як є)
 *   npm run api:surface -- --check      — лише порівнює зі збереженим знімком (exit 1, якщо різниться)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'https://github.com/diploma-project-group-5';
const SERVICES = ['timetable-service', 'school-service', 'tenant-service'];
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'api', 'surface.json');
const API_ROOT = '/api/v1';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function git(cwd, ...a) {
  return execFileSync('git', a, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });
}

/** Шлях Fastify → шаблон знімка: «::» — буквальна двокрапка дії, «:param» — {}. */
function normalize(path) {
  return path
    .replaceAll('::', '\u0000')
    .replace(/:[A-Za-z_]\w*/g, '{}')
    .replaceAll('\u0000', ':');
}

function routesOf(appSource) {
  const consts = Object.fromEntries(
    [...appSource.matchAll(/export const (\w+_PREFIX) = '([^']+)'/g)].map((m) => [m[1], m[2]]),
  );
  const prefix = consts.API_PREFIX;
  const found = [];
  const re = /\b(app|t|r|typed)\.(get|post|put|patch|delete)\(\s*(['`])(.*?)\3/gs;
  const matches = [...appSource.matchAll(re)];
  matches.forEach((m, i) => {
    const [, receiver, method, , raw] = m;
    let path = raw.replace(/\$\{(\w+)\}/g, (_, name) => consts[name] ?? '');
    if (receiver !== 'app') path = prefix + path; // маршрути всередині app.register({ prefix })
    if (!path.startsWith(API_ROOT + '/')) return; // /health тощо
    path = normalize(path.slice(API_ROOT.length));
    const verb = method.toUpperCase();
    // «/{id}:{дія}» розбирає хелпер action(…, ['publish', 'copy']) у тілі обробника
    const body = appSource.slice(m.index, matches[i + 1]?.index ?? appSource.length);
    const actions = path.endsWith('/{}') && body.match(/action\([^,]+,\s*\[([^\]]+)\]\)/);
    if (actions) {
      for (const a of actions[1].matchAll(/'(\w+)'/g)) found.push(`${verb} ${path}:${a[1]}`);
    } else found.push(`${verb} ${path}`);
  });
  return found;
}

function problemsOf(srcDir) {
  const found = [];
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:fail|problem)\(\s*(\d{3}),\s*'([a-z_]+)'/g)) {
      found.push(`${m[1]} ${m[2]}`);
    }
  }
  return found;
}

function collect(root) {
  const services = {};
  const routes = new Set();
  const problems = new Set();
  for (const name of SERVICES) {
    const dir = join(root, name);
    if (!existsSync(join(dir, 'src', 'app.ts'))) throw new Error(`немає ${dir}/src/app.ts`);
    services[name] = git(dir, 'rev-parse', '--short', 'HEAD');
    routesOf(readFileSync(join(dir, 'src', 'app.ts'), 'utf8')).forEach((r) => routes.add(r));
    problemsOf(join(dir, 'src')).forEach((p) => problems.add(p));
  }
  return {
    $comment:
      'Згенеровано scripts/api-surface.mjs (npm run api:surface) з коду сервісів — не редагувати вручну.',
    services,
    routes: [...routes].sort(),
    problems: [...problems].sort(),
  };
}

const local = option('--dir');
let root = local;
let tmp;
if (!root) {
  const ref = option('--ref') ?? 'develop';
  tmp = mkdtempSync(join(tmpdir(), 'lad-api-surface-'));
  root = tmp;
  for (const name of SERVICES) {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', ref, `${ORG}/${name}.git`], {
      cwd: tmp,
      stdio: 'inherit',
    });
  }
}

try {
  const surface = collect(root);
  // ревізії сервісів не порівнюємо: важливо, чи змінився сам API
  const strip = ({ routes, problems }) => JSON.stringify({ routes, problems });
  const current = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  if (flag('--check')) {
    if (!current || strip(current) !== strip(surface)) {
      const before = new Set(current ? [...current.routes, ...current.problems] : []);
      const after = new Set([...surface.routes, ...surface.problems]);
      for (const x of after) if (!before.has(x)) console.error(`+ ${x}`);
      for (const x of before) if (!after.has(x)) console.error(`- ${x}`);
      console.error('API сервісів змінився: npm run api:surface, потім перевірте мок і клієнт.');
      process.exit(1);
    }
    console.log('Знімок API актуальний.');
  } else {
    writeFileSync(OUT, JSON.stringify(surface, null, 2) + '\n');
    console.log(
      `src/api/surface.json: ${surface.routes.length} маршрутів, ${surface.problems.length} кодів`,
    );
  }
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
