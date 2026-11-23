import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** `?gateway=<namespace>/<name>`: the Gateway shown below the table. */
const GATEWAY_PARAM = 'gateway';

/**
 * The selected Gateway in the address, so a reload or a shared link shows
 * the same one. Replaced, not pushed: a selection is no page to go back to.
 */
export function useSelectedGateway(): [
  string | undefined,
  (key: string) => void,
] {
  const [params, setParams] = useSearchParams();
  const select = useCallback(
    (key: string) =>
      setParams(
        next => {
          next.set(GATEWAY_PARAM, key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [params.get(GATEWAY_PARAM) ?? undefined, select];
}
