import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionsMigrationNotice } from './SessionsMigrationNotice';

beforeEach(() => {
  window.localStorage.clear();
});

describe('SessionsMigrationNotice', () => {
  it('tells the person plainly that earlier conversations are gone', () => {
    render(<SessionsMigrationNotice />);

    expect(
      screen.getByText('Earlier conversations are not shown here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /conversations from before the move were not carried over/i,
      ),
    ).toBeInTheDocument();
  });

  it('stays dismissed once dismissed, across renders', async () => {
    const { unmount } = render(<SessionsMigrationNotice />);

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(
      screen.queryByText('Earlier conversations are not shown here'),
    ).not.toBeInTheDocument();

    unmount();
    render(<SessionsMigrationNotice />);
    expect(
      screen.queryByText('Earlier conversations are not shown here'),
    ).not.toBeInTheDocument();
  });
});
