import { screen } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { QrSheetPage } from './QrSheetPage';

describe('аркуші QR для друку', () => {
  it('класи: картка на кожен клас із рядком про ПД', async () => {
    await startMockBackend();
    renderPage(<QrSheetPage />, { path: '/print/qr/:scope', url: '/print/qr/class' });
    expect(await screen.findByText('5-А')).toBeInTheDocument();
    expect(screen.getAllByText('Розклад класу').length).toBeGreaterThan(1);
    expect(screen.getByText(/Персональні дані учнів і батьків не збираються/)).toBeVisible();
  });

  it('вчителі: окрема сторінка з повідомленням про обробку ПД', async () => {
    await startMockBackend();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { user } = renderPage(<QrSheetPage />, {
      path: '/print/qr/:scope',
      url: '/print/qr/teacher',
    });
    expect(await screen.findByRole('heading', { name: 'Іваненко О. П.' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { name: 'Повідомлення про обробку персональних даних' })
        .length,
    ).toBe(8);
    await user.click(screen.getByRole('button', { name: 'Друкувати' }));
    expect(print).toHaveBeenCalled();
  });

  it('класи йдуть за номером: 1-А, 2-А, 10-А, 11-А (а не як рядки)', async () => {
    await startMockBackend();
    const mockFetch = globalThis.fetch;
    const token = (label: string) => ({
      token_id: label,
      scope: 'class',
      target_id: label,
      target_label: label,
      generation: 1,
      url: `https://lad.example/c#${label}`,
    });
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/v1/timetable/access-tokens')
        return Response.json(['10-А', '1-А', '11-А', '2-А'].map(token));
      return mockFetch(input, init);
    };
    onTestFinished(() => {
      globalThis.fetch = mockFetch;
    });
    renderPage(<QrSheetPage />, { path: '/print/qr/:scope', url: '/print/qr/class' });
    await screen.findByText('10-А');
    const order = [...document.querySelectorAll('figcaption b')].map((b) => b.textContent);
    expect(order).toEqual(['1-А', '2-А', '10-А', '11-А']);
  });
});
