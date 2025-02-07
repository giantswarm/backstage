import * as React from 'react';
import { Progress, StatusError } from '@backstage/core-components';

import { NotAvailable } from '../NotAvailable';
import { Box, Tooltip } from '@material-ui/core';

const progressHeight = 4;

const defaultRenderErrorFn = (errorMessage: string) => (
  <Box display="flex">
    <NotAvailable />
    <Tooltip title={errorMessage}>
      <Box marginLeft={1}>
        <StatusError />
      </Box>
    </Tooltip>
  </Box>
);
interface AsyncValueProps<T> {
  children?: (value: T) => React.ReactNode;
  renderError?: (message: string) => React.ReactNode;
  value?: T;
  isLoading: boolean;
  error?: Error | null;
  errorMessage?: string;
  height?: number;
}

export const AsyncValue = <T extends React.ReactNode>({
  value,
  children,
  isLoading,
  error,
  errorMessage,
  height = 24,
  renderError = defaultRenderErrorFn,
}: AsyncValueProps<T>) => {
  return (
    <>
      {isLoading && (
        <Box
          paddingTop={`${(height - progressHeight) / 2}px`}
          height={`${height}px`}
        >
          <Progress />
        </Box>
      )}

      {value && (children ? children(value) : value)}

      {error && renderError(errorMessage || error.message)}
    </>
  );
};
