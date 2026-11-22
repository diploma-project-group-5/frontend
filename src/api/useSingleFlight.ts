import type { UseMutationResult } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

/**
 * mutate, що ігнорує повторні виклики, поки попередній запит не завершився.
 *
 * `disabled={m.isPending}` від подвійного кліку не рятує: react-query повідомляє компонент про
 * isPending через setTimeout(0), тож другий клік встигає раніше за перерендер. Для неідемпотентних
 * POST (:copy, :end) це давало дві копії версії й дублікати в журналі.
 */
export function useSingleFlight<TData, TError, TVars, TCtx>(
  m: UseMutationResult<TData, TError, TVars, TCtx>,
): (vars: TVars) => void {
  const busy = useRef(false);
  const { mutate } = m;
  return useCallback(
    (vars: TVars) => {
      if (busy.current) return;
      busy.current = true;
      mutate(vars, {
        onSettled: () => {
          busy.current = false;
        },
      });
    },
    [mutate],
  );
}
