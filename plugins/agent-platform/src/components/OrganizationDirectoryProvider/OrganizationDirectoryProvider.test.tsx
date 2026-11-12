import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';
import {
  musterApiRef,
  musterInstallationsQueryKey,
  MusterUnauthorizedError,
} from '@giantswarm/backstage-plugin-muster';

import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import {
  OrganizationDirectoryProvider,
  organizationsUndecided,
  useOrganizationDirectory,
} from './OrganizationDirectoryProvider';

const INSTALLATIONS = ['gazelle', 'golem', 'ozone', 'kestrel'];

/** What the directory can tell about each installation. */
function Probe() {
  const value = useOrganizationDirectory();
  const signIn = value.signInOf('gazelle');
  return (
    <ul>
      {signIn && (
        <li>
          {`gazelle sign-in: ${signIn.message}`}
          <button type="button" onClick={() => value.recheck('gazelle')}>
            Signed in
          </button>
        </li>
      )}
      {INSTALLATIONS.map(installation => (
        <li key={installation}>
          {`${installation}: ${
            organizationsUndecided(value, installation) ?? 'decided'
          }`}
        </li>
      ))}
    </ul>
  );
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderProbe(api: MusterApi, client = newQueryClient()) {
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={client}>
        <OrganizationDirectoryProvider>
          <Probe />
        </OrganizationDirectoryProvider>
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

const STILL_READING = 'The organizations are still being read.';

describe('OrganizationDirectoryProvider', () => {
  it("keeps each installation's discovery failure to that installation", async () => {
    // gazelle serves organizations, golem's muster has no per-user sign-in,
    // and ozone runs no agent-manager.
    const { api } = fakeOrganizationsMuster({ mine: { organizations: [] } });
    Object.assign(api, {
      listInstallations: jest.fn(async () => ({
        installations: [
          { name: 'gazelle', requiresAuth: true },
          { name: 'golem', requiresAuth: false },
          { name: 'ozone', requiresAuth: true },
        ],
      })),
      listServers: jest.fn(async (installation: string) => ({
        mcpServers: installation === 'ozone' ? [] : [{ name: 'agent-manager' }],
      })),
    });
    await renderProbe(api);

    expect(await screen.findByText('gazelle: decided')).toBeInTheDocument();
    expect(
      screen.getByText(
        'golem: golem needs a per-user connector sign-in to read organizations.',
      ),
    ).toBeInTheDocument();
    // golem's failure says nothing about ozone, known to run no agent-manager.
    expect(screen.getByText('ozone: decided')).toBeInTheDocument();
  });

  it('takes an installation muster does not list for unknown, not decided', async () => {
    const { api } = fakeOrganizationsMuster({ mine: { organizations: [] } });
    await renderProbe(api);

    expect(await screen.findByText('gazelle: decided')).toBeInTheDocument();
    expect(
      screen.getByText(
        'kestrel: muster does not list kestrel, so whether it serves organizations is unknown.',
      ),
    ).toBeInTheDocument();
  });

  it("waits only for an installation's own reads", async () => {
    // golem's server list never answers.
    const { api } = fakeOrganizationsMuster({ mine: { organizations: [] } });
    Object.assign(api, {
      listInstallations: jest.fn(async () => ({
        installations: [
          { name: 'gazelle', requiresAuth: true },
          { name: 'golem', requiresAuth: true },
        ],
      })),
      listServers: jest.fn((installation: string) =>
        installation === 'golem'
          ? new Promise(() => {})
          : Promise.resolve({ mcpServers: [{ name: 'agent-manager' }] }),
      ),
    });
    await renderProbe(api);

    expect(await screen.findByText('gazelle: decided')).toBeInTheDocument();
    expect(screen.getByText(`golem: ${STILL_READING}`)).toBeInTheDocument();
  });

  it("keeps deciding from muster's last list when a refetch of it fails", async () => {
    const { api } = fakeOrganizationsMuster({ mine: { organizations: [] } });
    const client = newQueryClient();
    // A list read long ago, so the mount reads it again, and that read
    // fails. ozone runs no agent-manager.
    client.setQueryData(
      musterInstallationsQueryKey(),
      {
        installations: [
          { name: 'gazelle', requiresAuth: true },
          { name: 'ozone', requiresAuth: true },
        ],
      },
      { updatedAt: 1 },
    );
    Object.assign(api, {
      listInstallations: jest.fn(async () => {
        throw new Error('muster did not answer');
      }),
      listServers: jest.fn(async (installation: string) => ({
        mcpServers: installation === 'ozone' ? [] : [{ name: 'agent-manager' }],
      })),
    });
    await renderProbe(api, client);

    await waitFor(() =>
      expect(client.getQueryState(musterInstallationsQueryKey())?.status).toBe(
        'error',
      ),
    );
    expect(await screen.findByText('ozone: decided')).toBeInTheDocument();
    expect(screen.getByText('gazelle: decided')).toBeInTheDocument();
  });

  it('tells a missing sign-in from a failure, and reads again once it is given', async () => {
    const { api, callTool } = fakeOrganizationsMuster({
      mine: { organizations: [] },
    });
    const SIGN_IN =
      "auth_required: server 'agent-manager' requires authentication; sign in to it to use its tools.";
    const answer = callTool.getMockImplementation()!;
    let signedIn = false;
    callTool.mockImplementation(async (name: string, ...rest: unknown[]) => {
      if (name === 'x_agent-manager_get_info' && !signedIn) {
        throw new MusterUnauthorizedError(
          SIGN_IN,
          'server_sign_in_required',
          'agent-manager',
          'gazelle',
        );
      }
      return (answer as (...args: unknown[]) => unknown)(name, ...rest);
    });
    await renderProbe(api);

    expect(
      await screen.findByText(`gazelle sign-in: ${SIGN_IN}`),
    ).toBeInTheDocument();

    signedIn = true;
    await userEvent.click(screen.getByRole('button', { name: 'Signed in' }));

    expect(await screen.findByText('gazelle: decided')).toBeInTheDocument();
    expect(screen.queryByText(/gazelle sign-in/)).toBeNull();
  });
});
