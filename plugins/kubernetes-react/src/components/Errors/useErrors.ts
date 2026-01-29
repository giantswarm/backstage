import { useContext, useEffect, useMemo, useRef } from 'react';
import { assertErrorsContext, ErrorsContext } from './ErrorsProvider';
import { generateUID } from '../../utils/generateUID';

import useDebounce from 'react-use/esm/useDebounce';
import { ErrorInfoUnion } from '../../hooks/utils/queries';
import { getIncompatibilityMessage } from '../../lib/k8s/errorMessages';

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
        errors: ErrorInfoUnion | ErrorInfoUnion[],
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
        newErrors.forEach(errorInfo => {
          const id = updatedErrors.length
            ? Math.max(...updatedErrors.map(e => e.id)) + 1
            : 1;

          if (errorInfo.type === 'incompatibility') {
            // Handle incompatibility errors
            updatedErrors.push({
              id,
              type: 'incompatibility',
              incompatibility: errorInfo.incompatibility,
              cluster: errorInfo.cluster,
              sourceId: options.sourceId,
              message:
                options.message ??
                getIncompatibilityMessage(errorInfo.incompatibility),
            });
          } else {
            // Handle regular errors (type is 'error' or undefined)
            updatedErrors.push({
              id,
              type: 'error',
              error: errorInfo.error,
              retry: errorInfo.retry,
              cluster: errorInfo.cluster,
              sourceId: options.sourceId,
              message: options.message,
            });
          }
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
  errors: ErrorInfoUnion | ErrorInfoUnion[] | null,
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
