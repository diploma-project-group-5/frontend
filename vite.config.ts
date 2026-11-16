/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// У проді web, /idp і /api/v1/* віддає один шлюз Traefik (одне походження).
// Локально dev-сервер проксює /idp і /api на стенд platform (docker compose).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.DEV_PROXY_TARGET || 'http://localhost';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/idp': { target, changeOrigin: true },
      },
    },
    build: {
      sourcemap: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Мок-бекенд не потрапляє в збірку (у нього свої тести контракту); keycloak.ts — тонка
        // обгортка keycloak-js, її перевіряє вхід на стенді platform.
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/mocks/**',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/auth/keycloak.ts',
        ],
        reporter: ['text', 'text-summary'],
        // Як у сервісах (vitest + coverage-v8): CI не пропустить нижче. Інтерфейс поки не дотягує
        // до 90 % сервісів — пороги трохи нижчі за поточне покриття; чисті функції src/lib — строгіше.
        thresholds: {
          lines: 80,
          statements: 80,
          functions: 75,
          branches: 70,
          'src/lib/**': { lines: 95, statements: 95, functions: 90, branches: 90 },
        },
      },
    },
  };
});
