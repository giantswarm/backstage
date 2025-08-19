import { createContext, ReactNode, useRef, useState } from 'react';
import { Errors } from './Errors';
import { Box } from '@material-ui/core';

export type ErrorItem = {
  id: number;
  error: Error;
  cluster?: string;
  sourceId?: string;
  message?: string;
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
    if (!errorItem || !errorItem.retry) return;

    const filteredErrors = errors.filter(e => e.id !== errorItem.id);
    errorsRef.current = filteredErrors;
    setUpdatedAt(new Date());

    errorItem.retry();
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
