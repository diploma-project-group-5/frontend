import { useUnsavedChanges } from '@/lib/unsaved';
import { renderPage } from '@/test/render';

function Dirty({ when }: { when: boolean }) {
  useUnsavedChanges(when);
  return <p>форма</p>;
}

const beforeUnload = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
};

it('незбережені зміни — браузер питає перед закриттям чи оновленням вкладки', () => {
  const view = renderPage(<Dirty when />);
  expect(beforeUnload().defaultPrevented).toBe(true);
  view.unmount();
  expect(beforeUnload().defaultPrevented).toBe(false);
});

it('без змін — закриття вкладки не зупиняємо', () => {
  renderPage(<Dirty when={false} />);
  expect(beforeUnload().defaultPrevented).toBe(false);
});
