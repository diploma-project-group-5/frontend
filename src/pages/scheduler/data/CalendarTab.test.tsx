import { fireEvent, screen } from '@testing-library/react';
import { renderPage, startMockBackend } from '@/test/render';
import { CalendarTab } from './CalendarTab';

describe('Дані закладу · Канікули', () => {
  it('перевіряє пару дат, замінює й прибирає канікули', async () => {
    await startMockBackend();
    const { user } = renderPage(<CalendarTab />);
    // у моку вже задано зимові канікули
    expect(await screen.findByText('28.12.2026 – 10.01.2027')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('З'), { target: { value: '2027-03-29' } });
    fireEvent.change(screen.getByLabelText('По'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Замінити канікули' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Вкажіть обидві дати.');

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2027-03-20' } });
    await user.click(screen.getByRole('button', { name: 'Замінити канікули' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Дата «по» раніша за «з».');

    fireEvent.change(screen.getByLabelText('По'), { target: { value: '2027-04-04' } });
    await user.click(screen.getByRole('button', { name: 'Замінити канікули' }));
    expect(await screen.findByText('29.03.2027 – 04.04.2027')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Прибрати канікули/ }));
    expect(await screen.findByText('Канікул не задано')).toBeInTheDocument();
  });
});
