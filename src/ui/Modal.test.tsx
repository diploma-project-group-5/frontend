import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { Modal, ModalActions } from './Modal';
import { useModalForm } from './modalGuard';

function Form({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const cancel = useModalForm(name !== '') ?? onClose;
  return (
    <form>
      <label>
        Назва
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ModalActions>
        <button type="button" onClick={cancel}>
          Скасувати
        </button>
      </ModalActions>
    </form>
  );
}

function Host() {
  const [open, setOpen] = useState(true);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Форма">
      <Form onClose={() => setOpen(false)} />
    </Modal>
  );
}

const esc = (el: HTMLElement) => {
  const e = new Event('cancel', { cancelable: true });
  el.dispatchEvent(e);
  return e;
};

it('«Повернутися до форми» повертає фокус туди, де він був; Esc на питанні — те саме', async () => {
  const user = userEvent.setup();
  render(<Host />, { wrapper: MemoryRouter });
  const dialog = screen.getByRole('dialog', { name: 'Форма' });
  const input = within(dialog).getByLabelText('Назва');
  await user.type(input, 'abc');

  // Esc із поля → питання, фокус на «Повернутися»
  expect(esc(dialog).defaultPrevented).toBe(true);
  const back = await within(dialog).findByRole('button', { name: 'Повернутися до форми' });
  expect(back).toHaveFocus();
  await user.click(back);
  expect(input).toHaveFocus();
  expect(input).toHaveValue('abc');

  // «Скасувати» → питання → Esc повертає до форми, фокус — на «Скасувати»
  const cancel = within(dialog).getByRole('button', { name: 'Скасувати' });
  await user.click(cancel);
  expect(within(dialog).getByRole('button', { name: 'Повернутися до форми' })).toHaveFocus();
  esc(dialog);
  await vi.waitFor(() => expect(cancel).toHaveFocus());
  expect(within(dialog).queryByRole('button', { name: 'Повернутися до форми' })).toBeNull();
});

it('dismissible={false}: якщо браузер усе ж закрив вікно (подія close) — воно відкривається знову', () => {
  const onClose = vi.fn();
  render(
    <Modal open onClose={onClose} title="Пароль" dismissible={false}>
      <p>секрет</p>
    </Modal>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Пароль' }) as HTMLDialogElement;
  dialog.close();
  expect(dialog).toHaveAttribute('open');
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('секрет')).toBeVisible();
});
