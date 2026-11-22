import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@/api/http';
import { ProblemNotice } from './index';

function show(body: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProblemNotice error={new ApiError(400, body)} />
    </QueryClientProvider>,
  );
}

describe('ProblemNotice: 400 validation_failed', () => {
  it('англійський текст схеми (AJV) не показуємо — загальне пояснення українською', () => {
    show({
      code: 'validation_failed',
      title: 'Bad Request',
      detail: 'body/shelter_capacity must be <= 100000',
    });
    expect(screen.getByText(/Сервер не прийняв дані/)).toBeInTheDocument();
    expect(screen.queryByText(/must be/)).not.toBeInTheDocument();
  });

  it('власний detail сервісу українською — показуємо його', () => {
    show({
      code: 'validation_failed',
      title: 'Некоректні дзвінки',
      detail: 'Урок №2 вказано двічі',
    });
    expect(screen.getByText('Урок №2 вказано двічі')).toBeInTheDocument();
  });
});
