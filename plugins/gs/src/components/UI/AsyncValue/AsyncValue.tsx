import { ReactNode } from 'react';
import { Progress } from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { ErrorStatus } from '../ErrorStatus/ErrorStatus';

const progressHeight = 4;

const defaultRenderErrorFn = (errorMessage: string) => (
  <ErrorStatus errorMessage={errorMessage} />
);
interface AsyncValueProps<T> {
  children?: (value: T) => ReactNode;
  renderError?: (message: string) => ReactNode;
  value?: T;
  isLoading: boolean;
  errorMessage?: string;
  height?: number;
}

export const AsyncValue = <T extends ReactNode>({
  value,
  children,
  isLoading,
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

      {errorMessage && renderError(errorMessage)}
    </>
  );
};
