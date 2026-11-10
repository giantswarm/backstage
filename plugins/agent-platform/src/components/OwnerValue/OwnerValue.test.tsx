import { renderInTestApp } from '@backstage/frontend-test-utils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellScopeProvider } from '@giantswarm/backstage-plugin-ui-react';

import { organizationsRouteRef } from '../../routes';
import { OwnerValue } from './OwnerValue';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

describe('OwnerValue', () => {
  it('names an organization by its plain name, with no hint', () => {
    render(<OwnerValue namespace="org-acme" />);

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("links an agent's organization to the organization's page", async () => {
    await renderInTestApp(
      <OwnerValue namespace="org-acme" installation="gazelle" />,
      { mountedRoutes: { '/organizations': organizationsRouteRef } },
    );

    expect(screen.getByRole('link', { name: 'acme' })).toHaveAttribute(
      'href',
      '/organizations/gazelle/org-parent/acme',
    );
  });

  it('says Platform for the platform, with a hint the keyboard reaches', async () => {
    const user = userEvent.setup();
    render(<OwnerValue namespace="kagent" />, {
      wrapper: ShellScopeProvider,
    });

    expect(screen.getByText(/^Platform/)).toBeInTheDocument();
    expect(screen.queryByText(/None/)).toBeNull();
    const hint = screen.getByRole('button', { name: 'What Platform means' });
    await user.tab();
    expect(hint).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Available to all organizations',
    );

    // A press (Enter here) opens the same text as a dialog named by the
    // hint, which a screen reader reads; Escape gives the focus back.
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('dialog', { name: 'What Platform means' }),
    ).toHaveTextContent('Available to all organizations');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'What Platform means' }),
    ).toBeNull();
  });
});
