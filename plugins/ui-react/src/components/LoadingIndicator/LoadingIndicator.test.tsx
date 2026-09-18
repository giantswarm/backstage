import { render, screen } from '@testing-library/react';
import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  // The point of the delay: a region whose fetch resolves from cache should
  // show nothing at all, rather than a bare label with no bar under it.
  it('holds the label back for as long as the bar', () => {
    render(<LoadingIndicator label="Discovering skills…" />);

    expect(screen.queryByText('Discovering skills…')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('progressbar', { name: 'Discovering skills…' }),
    ).not.toBeInTheDocument();
  });

  it('shows the bar and its label once the delay is over', async () => {
    render(<LoadingIndicator label="Discovering skills…" />);

    expect(
      await screen.findByRole('progressbar', { name: 'Discovering skills…' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Discovering skills…')).toBeInTheDocument();
  });
});
