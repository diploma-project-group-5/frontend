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
});
