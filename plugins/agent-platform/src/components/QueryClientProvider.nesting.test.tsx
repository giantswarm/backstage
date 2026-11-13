import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from './QueryClientProvider';

const mockPersistMounts = jest.fn();

jest.mock('@tanstack/react-query-persist-client', () => {
  const actual = jest.requireActual<
    typeof import('@tanstack/react-query-persist-client')
  >('@tanstack/react-query-persist-client');
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const ActualProvider = actual.PersistQueryClientProvider;
  return {
    ...actual,
    PersistQueryClientProvider: (
      props: Parameters<typeof ActualProvider>[0],
    ) => {
      useEffect(() => {
        mockPersistMounts();
      }, []);
      return <ActualProvider {...props} />;
    },
  };
});

const ClientReader = () => {
  useQueryClient();
  return <div>child</div>;
};

describe('QueryClientProvider', () => {
  beforeEach(() => {
    mockPersistMounts.mockClear();
  });

  it('mounts one PersistQueryClientProvider under nested providers', () => {
    render(
      <QueryClientProvider>
        <QueryClientProvider>
          <QueryClientProvider>
            <ClientReader />
          </QueryClientProvider>
        </QueryClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('child')).toBeInTheDocument();
    expect(mockPersistMounts).toHaveBeenCalledTimes(1);
  });

  it('mounts its own PersistQueryClientProvider when mounted alone', () => {
    render(
      <QueryClientProvider>
        <ClientReader />
      </QueryClientProvider>,
    );

    expect(screen.getByText('child')).toBeInTheDocument();
    expect(mockPersistMounts).toHaveBeenCalledTimes(1);
  });
});
