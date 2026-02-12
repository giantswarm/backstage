import { ReactNode } from 'react';
import { Progress } from '@backstage/core-components';
import { Box } from '@material-ui/core';
import { ErrorStatus } from '../ErrorStatus';
import { NotAvailable } from '../NotAvailable';

const progressHeight = 4;

const defaultRenderErrorFn = (errorMessage: string) => (
  <ErrorStatus errorMessage={errorMessage} />
);
interface AsyncValueProps<T> {
  children?: (value: NonNullable<T>) => ReactNode;
  renderError?: (message: string) => ReactNode;
  renderNotAvailable?: ReactNode;
  value: T;
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
  renderNotAvailable = <NotAvailable />,
}: AsyncValueProps<T>) => {
  const renderValue = () => {
    if (value === null || value === undefined) {
      return renderNotAvailable;
    }

    return children ? children(value) : value;
  };

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

      {!isLoading && !errorMessage && renderValue()}

      {errorMessage && renderError(errorMessage)}
    </>
  );
};
