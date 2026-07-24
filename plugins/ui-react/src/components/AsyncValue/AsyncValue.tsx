import { ReactNode } from 'react';
import { Skeleton } from '@backstage/ui';
import { ErrorStatus } from '../ErrorStatus';
import { NotAvailable } from '../NotAvailable';

const defaultRenderErrorFn = (errorMessage: string) => (
  <ErrorStatus errorMessage={errorMessage} />
);
export interface AsyncValueProps<T> {
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
      {isLoading && <Skeleton height={height} />}

      {!isLoading && !errorMessage && renderValue()}

      {errorMessage && renderError(errorMessage)}
    </>
  );
};
