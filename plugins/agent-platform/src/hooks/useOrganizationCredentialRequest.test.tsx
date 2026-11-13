import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import {
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
} from '../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../routes';
import { useOrganizationCredentialRequest } from './useOrganizationCredentialRequest';

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

/** Asks for a new value of one Secret's key on each click. */
function Replace() {
  const request = useOrganizationCredentialRequest('gazelle', PAYMENTS);
  return (
    <>
      {request.error ? <p>{request.error.message}</p> : null}
      <button
        onClick={() =>
          request.mutate({
            kind: 'credential',
            secret: 'tenant-credential-jira',
            key: 'token',
          })
        }
      >
        Replace
      </button>
    </>
  );
}

describe('useOrganizationCredentialRequest', () => {
  // A replacement agent-manager refused at its save (its consumers changed)
  // is started again from the tab: with the same requestId agent-manager
  // would answer the old, stale operation, so every request has its own.
  it('sends a fresh requestId with each request', async () => {
    const user = userEvent.setup();
    const { api, callTool } = fakeOrganizationsMuster({});
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [musterApiRef, api],
          [kubernetesApiRef, fakeOrganizationAccess()],
          [analyticsApiRef, mockApis.analytics.mock()],
        ]}
      >
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { mutations: { retry: false } } })
          }
        >
          <Replace />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/organizations': organizationsRouteRef } },
    );

    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(
        toolCalls(callTool, 'replace_organization_credential'),
      ).toHaveLength(1),
    );
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await waitFor(() =>
      expect(
        toolCalls(callTool, 'replace_organization_credential'),
      ).toHaveLength(2),
    );

    const [first, second] = toolCalls(
      callTool,
      'replace_organization_credential',
    ).map(args => args.requestId);
    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(first);
    // Answered with the request's id, not a page to open: nothing failed.
    expect(screen.queryByText(/credential UI/)).toBeNull();
  });
});
