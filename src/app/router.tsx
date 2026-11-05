import { createBrowserRouter, type RouteObject } from 'react-router';
import { NotFoundPage, RouteErrorPage } from '@/pages/ErrorPages';

/**
 * Усі сторінки — ліниві чанки. Важливо: keycloak-js імпортує лише модуль auth,
 * тож сторінки за QR (/c, /t) не завантажують ні його, ні код кабінету.
 */
const auth = () => import('@/auth/AuthGate');

const authGate = async () => ({ Component: (await auth()).AuthGate });
const role = (r: 'sysadmin' | 'scheduler') => async () => {
  const { RequireRole } = await auth();
  return { Component: () => <RequireRole role={r} /> };
};
const layout = async () => ({
  Component: (await import('@/layouts/CabinetLayout')).CabinetLayout,
});

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      // ── Публічні сторінки за QR: без акаунта, токен у фрагменті URL ──
      {
        path: '/c',
        lazy: async () => ({
          Component: (await import('@/pages/public/PublicTimetablePage')).ClassTimetablePage,
        }),
      },
      {
        path: '/t',
        lazy: async () => ({
          Component: (await import('@/pages/public/PublicTimetablePage')).TeacherTimetablePage,
        }),
      },

      // ── Кабінети ──
      {
        lazy: authGate,
        children: [
          { index: true, lazy: async () => ({ Component: (await auth()).HomeRedirect }) },

          {
            path: 'admin',
            lazy: role('sysadmin'),
            children: [
              {
                lazy: layout,
                children: [
                  {
                    path: 'schools',
                    lazy: async () => ({
                      Component: (await import('@/pages/admin/SchoolsPage')).SchoolsPage,
                    }),
                  },
                ],
              },
            ],
          },

          {
            path: 'scheduler',
            lazy: role('scheduler'),
            children: [
              {
                lazy: layout,
                children: [
                  {
                    path: 'timetables',
                    lazy: async () => ({
                      Component: (await import('@/pages/scheduler/TimetablesPage')).TimetablesPage,
                    }),
                  },
                  {
                    path: 'timetables/:id',
                    lazy: async () => ({
                      Component: (await import('@/pages/scheduler/TimetablePage')).TimetablePage,
                    }),
                  },
                  {
                    path: 'qr',
                    lazy: async () => ({
                      Component: (await import('@/pages/scheduler/QrPage')).QrPage,
                    }),
                  },
                  // Розділи, які ще не реалізовано: заглушка з посиланням на специфікацію.
                  ...(
                    [
                      ['school', 'Профіль закладу', 'GET/PUT /school'],
                      ['bells', 'Дзвінки', 'GET/PUT /bells'],
                      ['classes', 'Класи', 'GET/POST /classes, PUT/DEL /classes/{id}'],
                      ['subjects', 'Предмети', 'GET/POST /subjects, PUT/DEL /subjects/{id}'],
                      ['teachers', 'Вчителі', 'GET/POST /teachers, PUT /teachers/{id}'],
                      ['curriculum', 'Навчальний план', 'GET/PUT /curriculum'],
                      ['alert-plan', 'Розклад тривог', '/alert-plan, /alert-hours'],
                      ['audit', 'Журнал дій', 'GET /audit?from=&to=&target='],
                    ] as const
                  ).map(([path, title, endpoints]) => ({
                    path,
                    lazy: async () => {
                      const { PlaceholderPage } = await import('@/pages/scheduler/PlaceholderPage');
                      return {
                        Component: () => <PlaceholderPage title={title} endpoints={endpoints} />,
                      };
                    },
                  })),
                ],
              },
              {
                // Аркуші для друку — без меню кабінету, print-CSS
                path: 'print/qr/:scope',
                lazy: async () => ({
                  Component: (await import('@/pages/print/QrSheetPage')).QrSheetPage,
                }),
              },
            ],
          },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
