import { useContext, useEffect, useMemo, useRef } from 'react';
import { assertErrorsContext, ErrorsContext } from './ErrorsProvider';
import { generateUID } from '../../utils/generateUID';

import useDebounce from 'react-use/esm/useDebounce';
import { ErrorInfo } from '../../hooks/utils/queries';

type showErrorOptions = {
  sourceId?: string;
  message?: string;
};

export function useErrors() {
  const context = useContext(ErrorsContext);
  assertErrorsContext(context);

  const memoized = useMemo(
    () => {
      const showErrors = (
        errors: ErrorInfo | ErrorInfo[],
        options: showErrorOptions = {},
      ) => {
        const { errorsRef, setUpdatedAt } = context;

        let updatedErrors = [...errorsRef.current];
        if (options.sourceId) {
          updatedErrors = updatedErrors.filter(
            e => e.sourceId !== options.sourceId,
          );
        }

        const newErrors = Array.isArray(errors) ? errors : [errors];
        newErrors.forEach(({ cluster, error, retry }) => {
          const id = updatedErrors.length
            ? Math.max(...updatedErrors.map(e => e.id)) + 1
            : 1;
          updatedErrors.push({
            id,
            error,
            retry,
            cluster,
            sourceId: options.sourceId,
            message: options.message,
          });
        });

        errorsRef.current = updatedErrors;
        setUpdatedAt(new Date());
      };

      return {
        showErrors,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return memoized;
}

export function useShowErrors(
  errors: ErrorInfo | ErrorInfo[] | null,
  options: {
    message?: string | undefined;
  } = {},
) {
  const sourceIdRef = useRef(generateUID(5));
  const { showErrors } = useErrors();

  useDebounce(
    () => {
      showErrors(errors ?? [], {
        sourceId: sourceIdRef.current,
        ...options,
      });
    },
    100,
    [errors],
  );

  useEffect(() => {
    const sourceId = sourceIdRef.current;

    return () => {
      showErrors([], {
        sourceId,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
