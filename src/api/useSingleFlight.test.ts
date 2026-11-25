import type { UseMutationResult } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useSingleFlight } from './useSingleFlight';

type M = UseMutationResult<unknown, unknown, string, unknown>;

it('другий виклик до завершення першого не шле запит, навіть без перерендеру', () => {
  let settle: (() => void) | undefined;
  const mutate = vi.fn((_v: string, opts?: { onSettled?: () => void }) => {
    settle = opts?.onSettled;
  });
  const { result } = renderHook(() => useSingleFlight({ mutate } as unknown as M));
  // обидва кліки в одному тіку: isPending ще false, захищає лише ref
  result.current('a');
  result.current('b');
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith('a', expect.anything());

  settle?.();
  result.current('c');
  expect(mutate).toHaveBeenCalledTimes(2);
});
