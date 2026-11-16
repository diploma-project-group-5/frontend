import { fireEvent, screen } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { BellsCard } from './BellsCard';

describe('Дані закладу · Дзвінки', () => {
  it('не зберігає урок, що закінчується раніше за початок; правильні — зберігає', async () => {
    await startMockBackend();
    const { user } = renderPage(<BellsCard />);
    const end1 = await screen.findByLabelText('Кінець уроку 1');
    const start1 = screen.getByLabelText('Початок уроку 1');
    const save = screen.getByRole('button', { name: 'Зберегти дзвінки' });
    expect(save).toBeDisabled(); // нічого не змінено

    fireEvent.change(end1, { target: { value: '07:00' } });
    await user.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent('Виправте час уроків: 1.');

    fireEvent.change(start1, { target: { value: '08:00' } });
    fireEvent.change(end1, { target: { value: '08:45' } });
    await user.click(save);
    expect(
      await screen.findByText('Збережено. Сторінки за QR показують час за чинними дзвінками.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Початок уроку 1')).toHaveValue('08:00');
  });

  it('«Скасувати» повертає збережені значення', async () => {
    await startMockBackend();
    const { user } = renderPage(<BellsCard />);
    const start1 = await screen.findByLabelText('Початок уроку 1');
    const initial = (start1 as HTMLInputElement).value;
    fireEvent.change(start1, { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.getByLabelText('Початок уроку 1')).toHaveValue(initial);
  });
});
