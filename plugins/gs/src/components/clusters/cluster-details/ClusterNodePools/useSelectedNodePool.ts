import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const PARAM_KEY = 'name';

export function useSelectedNodePool() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedNodePool = searchParams.get(PARAM_KEY);

  const setSelectedNodePool = useCallback(
    (name: string) => {
      setSearchParams(
        params => {
          params.set(PARAM_KEY, name);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearSelectedNodePool = useCallback(() => {
    setSearchParams(
      params => {
        params.delete(PARAM_KEY);
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { selectedNodePool, setSelectedNodePool, clearSelectedNodePool };
}
