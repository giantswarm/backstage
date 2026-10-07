import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HiveSourceState } from './HiveSourceState';

describe('HiveSourceState', () => {
  const gatewayError = new Error(
    'The portal backend did not answer (status 503); it may be restarting.',
  );

  it('shows a failed source as a readable error with "Try again"', async () => {
    const onRetry = jest.fn();
    await renderInTestApp(
      <HiveSourceState
        isLoading={false}
        error={gatewayError}
        what="what moved"
        onRetry={onRetry}
        isFetching={false}
      />,
    );

    expect(screen.getByText('Failed to load what moved')).toBeInTheDocument();
    expect(screen.getByText(gatewayError.message)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('holds "Try again" while the retry runs', async () => {
    await renderInTestApp(
      <HiveSourceState
        isLoading={false}
        error={gatewayError}
        what="what moved"
        onRetry={jest.fn()}
        isFetching
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Trying again…' }),
    ).toBeDisabled();
  });
});
