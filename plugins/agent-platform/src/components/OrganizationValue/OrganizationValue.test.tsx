import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellScopeProvider } from '@giantswarm/backstage-plugin-ui-react';

import { OrganizationValue } from './OrganizationValue';

describe('OrganizationValue', () => {
  it('names an organization by its plain name, with no hint', () => {
    render(<OrganizationValue namespace="org-acme" />);

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says None for the platform, with a hint the keyboard reaches', async () => {
    const user = userEvent.setup();
    render(<OrganizationValue namespace="kagent" />, {
      wrapper: ShellScopeProvider,
    });

    expect(screen.getByText(/^None/)).toBeInTheDocument();
    expect(screen.queryByText(/Platform/)).toBeNull();
    const hint = screen.getByRole('button', { name: 'What None means' });
    await user.tab();
    expect(hint).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Available to all organizations',
    );

    // A press (Enter here) opens the same text as a dialog named by the
    // hint, which a screen reader reads; Escape gives the focus back.
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('dialog', { name: 'What None means' }),
    ).toHaveTextContent('Available to all organizations');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'What None means' }),
    ).toBeNull();
  });
});
