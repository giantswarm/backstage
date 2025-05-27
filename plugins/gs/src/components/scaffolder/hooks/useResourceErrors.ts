import { useEffect } from 'react';
import { useErrors } from '../../Errors';

export function useResourceErrors(
  error: Error | undefined,
  options: {
    message?: string | undefined;
    retry?: VoidFunction | undefined;
  } = {},
) {
  const { showError } = useErrors();

  useEffect(() => {
    if (!error) return;
    showError(error, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
}
