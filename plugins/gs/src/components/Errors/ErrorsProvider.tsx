import { createContext, ReactNode, useRef, useState } from 'react';
import { Errors } from './Errors';
import { Box } from '@material-ui/core';

export type ErrorItem = {
  id: number;
  error: Error;
  occurrances: number;
  message?: string;
  queryKey?: string;
  retry?: VoidFunction;
};

type ErrorsStatus = {
  errorsRef: React.MutableRefObject<ErrorItem[]>;
  setUpdatedAt: (date: Date) => void;
};

export const ErrorsContext = createContext<ErrorsStatus | null>(null);

export function assertErrorsContext(value: any): asserts value is ErrorsStatus {
  if (value === null) {
    throw new Error('ErrorsContext not found');
  }
}

export interface ErrorsProviderProps {
  children: ReactNode;
}

export const ErrorsProvider = ({ children }: ErrorsProviderProps) => {
  const errorsRef = useRef<ErrorItem[]>([]);
  const [_updatedAt, setUpdatedAt] = useState(new Date());
  const errors = errorsRef.current;

  const handleRetry = (errorItemId: number) => {
    const errorItem = errors.find(e => e.id === errorItemId);
    if (!errorItem) return;

    const errorsToRetry = errors.filter(e => e.queryKey === errorItem.queryKey);
    const retryFn = errorsToRetry.find(({ retry }) => !!retry)?.retry;

    const filteredErrors = errors.filter(
      e => e.queryKey !== errorItem.queryKey,
    );
    errorsRef.current = filteredErrors;
    setUpdatedAt(new Date());

    if (retryFn) {
      retryFn();
    }
  };

  const handleDismiss = (errorItemId: number) => {
    const errorItem = errors.find(e => e.id === errorItemId);
    if (!errorItem) return;

    const filteredErrors = errors.filter(e => e.id !== errorItemId);
    errorsRef.current = filteredErrors;
    setUpdatedAt(new Date());
  };

  return (
    <ErrorsContext.Provider value={{ errorsRef, setUpdatedAt }}>
      {errors.length > 0 ? (
        <Box marginBottom={2}>
          <Errors
            errors={errors}
            onRetry={handleRetry}
            onDismiss={handleDismiss}
          />
        </Box>
      ) : null}
      {children}
    </ErrorsContext.Provider>
  );
};
