import * as React from 'react';
import { Progress, StatusError } from '@backstage/core-components';

import { NotAvailable } from '../NotAvailable';
import { Box, Tooltip } from '@material-ui/core';

const progressHeight = 4;
interface AsyncValueProps<T> {
  children?: (value: T) => React.ReactNode;
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

      {error && (
        <Box display="flex">
          <NotAvailable />
          <Tooltip title={errorMessage ? errorMessage : error.message}>
            <Box marginLeft={1}>
              <StatusError />
            </Box>
          </Tooltip>
        </Box>
      )}
    </>
  );
};
