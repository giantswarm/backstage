import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Organization requests use the Muster API.
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

function AddModel() {
  const request = useOrganizationCredentialRequest('gazelle', PAYMENTS);
  return (
    <>
      <button
        onClick={() =>
          request.mutate({
            kind: 'model',
            name: 'claude',
            displayName: 'Claude',
            provider: 'Anthropic',
            model: 'claude-sonnet-4-6',
          })
        }
      >
        Add model
      </button>
      {request.isSuccess ? <p>Completed</p> : null}
      {request.error ? <p>{request.error.message}</p> : null}
    </>
  );
}

/** The `set_organization_model` schema of agent-manager, with or without `create`. */
function modelToolSchema(createOnly: boolean) {
  return {
    inputSchema: {
      properties: Object.fromEntries(
        [
          'projectID',
          'location',
          'endpoint',
          'displayName',
          'noCredential',
          ...(createOnly ? ['create'] : []),
        ].map(key => [key, {}]),
      ),
    },
  };
}

/** Adds a model once, on an agent-manager whose tool takes `create` or not. */
async function addModel(createOnly: boolean, answer: () => Promise<unknown>) {
  const user = userEvent.setup();
  const { api, callTool } = fakeOrganizationsMuster({});
  jest
    .mocked(api.describeTool)
    .mockResolvedValue(modelToolSchema(createOnly) as never);
  // get_info stays the fake's, which decides the write's mode: live.
  const fake = callTool.getMockImplementation()!;
  callTool.mockImplementation((name, ...rest) =>
    name === 'x_agent-manager_get_info' ? fake(name, ...rest) : answer(),
  );
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
        <AddModel />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Add model' }));
  return callTool;
}

describe('useOrganizationCredentialRequest', () => {
  it.each([true, false])(
    'tracks an immediate model write (created: %s)',
    async created => {
      const user = userEvent.setup();
      const { api, callTool } = fakeOrganizationsMuster({});
      callTool.mockResolvedValue({ kind: 'model', name: 'claude', created });
      const analyticsApi = mockApis.analytics.mock();
      await renderInTestApp(
        <TestApiProvider
          apis={[
            [musterApiRef, api],
            [kubernetesApiRef, fakeOrganizationAccess()],
            [analyticsApiRef, analyticsApi],
          ]}
        >
          <QueryClientProvider
            client={
              new QueryClient({
                defaultOptions: { mutations: { retry: false } },
              })
            }
          >
            <AddModel />
          </QueryClientProvider>
        </TestApiProvider>,
      );
      await user.click(screen.getByRole('button', { name: 'Add model' }));
      await screen.findByText('Completed');
      expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: created
            ? 'AgentPlatform.modelCreated'
            : 'AgentPlatform.modelUpdated',
          attributes: {},
        }),
      );
    },
  );

  it('adds a model with create, so a model of that name is refused, not changed', async () => {
    const callTool = await addModel(true, async () => ({
      kind: 'model',
      name: 'claude',
      created: true,
    }));
    await screen.findByText('Completed');
    expect(toolCalls(callTool, 'set_organization_model')).toEqual([
      expect.objectContaining({ name: 'claude', create: true }),
    ]);
  });

  it('leaves create out where the tool does not take it (agent-manager 2.24.0 and older)', async () => {
    const callTool = await addModel(false, async () => ({
      kind: 'model',
      name: 'claude',
      created: true,
    }));
    await screen.findByText('Completed');
    expect(toolCalls(callTool, 'set_organization_model')).toHaveLength(1);
    expect(toolCalls(callTool, 'set_organization_model')[0]).not.toHaveProperty(
      'create',
    );
  });

  it('says the name is taken when agent-manager answers already_exists', async () => {
    await addModel(true, async () => {
      throw new Error(
        `already_exists: ModelConfig ${PAYMENTS.namespace}/claude exists already: pick another name, or call without create to change or replace it`,
      );
    });
    expect(
      await screen.findByText(
        `The namespace ${PAYMENTS.namespace} already has a model named claude. Choose another name, or edit that model.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already_exists/)).not.toBeInTheDocument();
  });

  // A replacement agent-manager refused at its save (its consumers changed)
  // is started again from the tab: with the same requestId agent-manager
  // would answer the old, stale operation, so every request has its own.
  it.each([true, false])(
    'sends a fresh requestId with each request (form route bound: %s)',
    async mounted => {
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
              new QueryClient({
                defaultOptions: { mutations: { retry: false } },
              })
            }
          >
            <Replace />
          </QueryClientProvider>
        </TestApiProvider>,
        mounted
          ? { mountedRoutes: { '/organizations': organizationsRouteRef } }
          : {},
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
      await waitFor(() =>
        expect(
          Boolean(screen.queryByText(/The credential form is not configured/)),
        ).toBe(!mounted),
      );
    },
  );
});
