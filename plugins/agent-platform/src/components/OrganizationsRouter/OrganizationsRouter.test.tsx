import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { ResponseError } from '@backstage/errors';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Organization requests use the Muster API.
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationsRouter } from './OrganizationsRouter';
import {
  agentManagerCredentialsApiRef,
  type AgentManagerCredentialsApi,
} from '../../apis';
import type { CredentialOperationRead } from '../../lib/credentialOperations';

jest.mock('../QueryClientProvider', () => {
  const { QueryClient, QueryClientProvider } = jest.requireActual(
    '@tanstack/react-query',
  );
  const { useState } = jest.requireActual('react');
  return {
    QueryClientProvider: ({ children }: { children: ReactNode }) => {
      const [client] = useState(
        () =>
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          }),
      );
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
    },
  };
});

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
  it.each(['pending', 'saved', 'cancelled', 'stale'] as const)(
    'keeps %s credential state with its request when another organization opens',
    async state => {
      const user = userEvent.setup();
      const firstOperation = 'a1'.repeat(24);
      const nextOperation = 'b2'.repeat(24);
      const credentialsApi = {
        getOperation: jest.fn(
          async (
            _installation: string,
            operation: string,
          ): Promise<CredentialOperationRead> => ({
            etag: '"3"',
            operation: {
              id: operation,
              version: '3',
              state: 'pending',
              mode: 'apply',
              organization: {
                parent: 'org-acme',
                organization:
                  operation === firstOperation ? 'payments' : 'billing',
              },
              result: {
                kind: 'credential',
                credentials: [
                  {
                    secret: 'tenant-credential-shared',
                    key: 'token',
                    state: 'replace',
                  },
                ],
              },
            },
          }),
        ),
        saveOperation: jest.fn(async () => ({
          kind: 'credential' as const,
          name: 'tenant-credential-shared',
        })),
        cancelOperation: jest.fn(async () => undefined),
      } satisfies AgentManagerCredentialsApi;
      if (state === 'stale') {
        credentialsApi.saveOperation.mockRejectedValueOnce(
          await ResponseError.fromResponse(
            new Response(
              JSON.stringify({
                error: {
                  name: 'AgentManagerError',
                  code: 'credential_consumers_changed',
                  message: 'changed',
                },
                request: { method: 'POST', url: '/' },
                response: { statusCode: 409 },
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } },
            ),
          ),
        );
      }
      const { api } = fakeOrganizationsMuster({});
      await renderInTestApp(
        <TestApiProvider
          apis={[
            [musterApiRef, api],
            [kubernetesApiRef, fakeOrganizationAccess()],
            [agentManagerCredentialsApiRef, credentialsApi],
            [analyticsApiRef, mockApis.analytics.mock()],
            [
              externalUrlConsentApiRef,
              new ExternalUrlConsentManager(jest.fn()),
            ],
          ]}
        >
          <Routes>
            <Route
              path="/organizations/*"
              element={
                <>
                  <OrganizationsRouter />
                  <RouterLink
                    to={`/organizations/gazelle/org-acme/billing/credentials/${nextOperation}`}
                  >
                    Open next request
                  </RouterLink>
                </>
              }
            />
          </Routes>
        </TestApiProvider>,
        {
          initialRouteEntries: [
            `/organizations/gazelle/org-acme/payments/credentials/${firstOperation}`,
          ],
          mountedRoutes: { '/organizations': organizationsRouteRef },
        },
      );
      await user.type(
        await screen.findByLabelText(/^Value/),
        'synthetic-credential',
      );
      if (state === 'saved' || state === 'stale') {
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await screen.findByText(
          state === 'saved'
            ? 'Credential saved'
            : 'The objects that use this credential changed',
        );
      } else if (state === 'cancelled') {
        await user.click(
          screen.getByRole('button', { name: 'Cancel request' }),
        );
        await screen.findByText('Request cancelled');
      }
      await user.click(screen.getByRole('link', { name: 'Open next request' }));
      expect(await screen.findByLabelText(/^Value/)).toHaveValue('');
      expect(credentialsApi.getOperation).toHaveBeenLastCalledWith(
        'gazelle',
        nextOperation,
      );
      expect(screen.queryByText('Credential saved')).toBeNull();
      expect(screen.queryByText('Request cancelled')).toBeNull();
      expect(
        screen.queryByText('The objects that use this credential changed'),
      ).toBeNull();
    },
  );

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
