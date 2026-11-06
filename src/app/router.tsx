import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { NotFoundPage, RouteErrorPage } from '@/pages/ErrorPages';

/**
 * Усі сторінки — ліниві чанки. Важливо: keycloak-js імпортує лише модуль auth,
 * тож сторінки за QR (/c, /t) не завантажують ні його, ні код кабінету.
 *
 * Розділи кабінету укладача — як у прототипі (Дані закладу, Розклад, Погодження,
 * Заміни, Сценарії, Журнал); вміст — за API специфікації v24.
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

/** Лінивий маршрут з іменованого експорту модуля. */
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  return async () => ({ Component: pick(await load()) });
}

const data = () => import('@/pages/scheduler/data/DataPages');

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      // ── Публічні сторінки за QR: без акаунта, токен у фрагменті URL ──
      {
        path: '/c',
        lazy: page(
          () => import('@/pages/public/PublicTimetablePage'),
          (m) => m.ClassTimetablePage,
        ),
      },
      {
        path: '/t',
        lazy: page(
          () => import('@/pages/public/PublicTimetablePage'),
          (m) => m.TeacherTimetablePage,
        ),
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
                    lazy: page(
                      () => import('@/pages/admin/SchoolsPage'),
                      (m) => m.SchoolsPage,
                    ),
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
                  // Дані закладу — вкладки як у прототипі
                  {
                    path: 'data',
                    lazy: page(data, (m) => m.DataLayout),
                    children: [
                      { index: true, element: <Navigate to="school" replace /> },
                      { path: 'school', lazy: page(data, (m) => m.SchoolTab) },
                      { path: 'calendar', lazy: page(data, (m) => m.CalendarTab) },
                      { path: 'classes', lazy: page(data, (m) => m.ClassesTab) },
                      { path: 'teachers', lazy: page(data, (m) => m.TeachersTab) },
                      { path: 'subjects', lazy: page(data, (m) => m.SubjectsTab) },
                      { path: 'curriculum', lazy: page(data, (m) => m.CurriculumTab) },
                    ],
                  },
                  // Розклад
                  {
                    path: 'timetables',
                    lazy: page(
                      () => import('@/pages/scheduler/TimetablesPage'),
                      (m) => m.TimetablesPage,
                    ),
                  },
                  {
                    path: 'timetables/:id',
                    lazy: page(
                      () => import('@/pages/scheduler/TimetablesPage'),
                      (m) => m.TimetablesPage,
                    ),
                  },
                  {
                    path: 'approval',
                    lazy: page(
                      () => import('@/pages/scheduler/ApprovalPage'),
                      (m) => m.ApprovalPage,
                    ),
                  },
                  {
                    path: 'substitutions',
                    lazy: page(
                      () => import('@/pages/scheduler/SubstitutionsPage'),
                      (m) => m.SubstitutionsPage,
                    ),
                  },
                  {
                    path: 'scenarios',
                    lazy: page(
                      () => import('@/pages/scheduler/ScenariosPage'),
                      (m) => m.ScenariosPage,
                    ),
                  },
                  {
                    path: 'journal',
                    lazy: page(
                      () => import('@/pages/scheduler/JournalPage'),
                      (m) => m.JournalPage,
                    ),
                  },
                ],
              },
              {
                // Аркуші для друку — без меню кабінету, print-CSS
                path: 'print/qr/:scope',
                lazy: page(
                  () => import('@/pages/print/QrSheetPage'),
                  (m) => m.QrSheetPage,
                ),
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
