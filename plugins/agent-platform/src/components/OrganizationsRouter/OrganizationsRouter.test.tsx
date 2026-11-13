import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import {
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationsRouter } from './OrganizationsRouter';

// An organization the person manages whose namespace the operator never
// created: its delete erases it at once, before the list is read again.
const PAYMENTS = {
  name: 'payments',
  parent: 'org-acme',
  displayName: 'Payments',
  harnesses: ['kagent'],
  workerReplicas: 0,
};

describe('OrganizationsRouter', () => {
  it('keeps a delete with its organization: another one opened next is not erased', async () => {
    const user = userEvent.setup();
    const scenario: OrganizationsScenario = {
      mine: { organizations: [] },
      organization: PAYMENTS,
    };
    const { api, callTool } = fakeOrganizationsMuster(scenario);
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [musterApiRef, api],
          [kubernetesApiRef, fakeOrganizationAccess()],
          [analyticsApiRef, mockApis.analytics.mock()],
        ]}
      >
        <Routes>
          <Route
            path="/organizations/*"
            element={
              <>
                <OrganizationsRouter />
                {/* Another organization the person is no member of, opened
                    in the same mounted router (a link, the history). */}
                <RouterLink to="/organizations/gazelle/org-acme/billing">
                  Open billing
                </RouterLink>
              </>
            }
          />
        </Routes>
      </TestApiProvider>,
      {
        initialRouteEntries: ['/organizations/gazelle/org-acme/payments'],
        mountedRoutes: { '/organizations': organizationsRouteRef },
      },
    );

    await user.click(
      await screen.findByRole('button', { name: 'Delete organization' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      await within(dialog).findByLabelText('Type org-acme/payments to confirm'),
      'org-acme/payments',
    );
    const confirm = within(dialog).getByRole('button', {
      name: 'Delete organization',
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    delete scenario.organization;
    await user.click(confirm);
    expect(await screen.findByText('payments is erased')).toBeInTheDocument();
    expect(toolCalls(callTool, 'delete_organization')).toHaveLength(1);

    await user.click(screen.getByRole('link', { name: 'Open billing' }));

    expect(
      await screen.findByText('You are not a member of billing'),
    ).toBeInTheDocument();
    expect(screen.queryByText('billing is erased')).toBeNull();
  });
});
