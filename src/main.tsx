import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiError } from '@/api/http';
import { router } from '@/app/router';
import '@/ui/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx не повторюємо: 404 за QR, 403, 409 — це відповідь, а не збій мережі.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
