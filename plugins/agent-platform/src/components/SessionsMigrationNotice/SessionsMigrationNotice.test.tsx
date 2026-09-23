import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionsMigrationNotice } from './SessionsMigrationNotice';

beforeEach(() => {
  window.localStorage.clear();
});

describe('SessionsMigrationNotice', () => {
  it('tells the person plainly that earlier sessions are gone', () => {
    render(<SessionsMigrationNotice />);

    expect(
      screen.getByText('Earlier sessions are not shown here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sessions from before .* are no longer available/i),
    ).toBeInTheDocument();
  });

  it('stays dismissed once dismissed, across renders', async () => {
    const { unmount } = render(<SessionsMigrationNotice />);

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(
      screen.queryByText('Earlier sessions are not shown here'),
    ).not.toBeInTheDocument();

    unmount();
    render(<SessionsMigrationNotice />);
    expect(
      screen.queryByText('Earlier sessions are not shown here'),
    ).not.toBeInTheDocument();
  });
});
