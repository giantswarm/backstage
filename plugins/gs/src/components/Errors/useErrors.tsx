import { useContext, useMemo } from 'react';
import { assertErrorsContext, ErrorsContext } from './ErrorsProvider';

type showErrorOptions = {
  queryKey?: string;
  message?: string;
  retry?: VoidFunction;
};

export function useErrors() {
  const context = useContext(ErrorsContext);
  assertErrorsContext(context);

  const memoized = useMemo(
    () => ({
      showError: (error: Error, options: showErrorOptions = {}) => {
        const { errorsRef, setUpdatedAt } = context;
        const errors = errorsRef.current;

        const existingError = errors.find(
          e =>
            e.message === options.message &&
            e.queryKey === options.queryKey &&
            e.error.message === error.message &&
            e.error.name === error.name &&
            e.error.stack === error.stack,
        );

        let updatedErrors = [];
        if (existingError) {
          const existingErrorIndex = errors.indexOf(existingError);
          updatedErrors = [
            ...errors.slice(0, existingErrorIndex),
            {
              ...existingError,
              occurrances: existingError.occurrances + 1,
            },
            ...errors.slice(existingErrorIndex + 1),
          ];
        } else {
          const id = Math.max(0, ...errors.map(e => e.id)) + 1;
          updatedErrors = [
            ...errors,
            {
              id,
              error,
              message: options.message,
              retry: options.retry,
              queryKey: options.queryKey,
              occurrances: 1,
            },
          ];
        }

        errorsRef.current = updatedErrors;
        setUpdatedAt(new Date());
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return memoized;
}
