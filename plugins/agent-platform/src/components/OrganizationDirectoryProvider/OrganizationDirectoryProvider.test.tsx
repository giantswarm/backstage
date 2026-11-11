import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import {
  OrganizationDirectoryProvider,
  organizationsUndecided,
  useOrganizationDirectory,
} from './OrganizationDirectoryProvider';

const INSTALLATIONS = ['gazelle', 'golem', 'ozone'];

/** What the directory can tell about each installation, once read. */
function Probe() {
  const value = useOrganizationDirectory();
  if (value.isLoading) {
    return <p>reading</p>;
  }
  return (
    <ul>
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
    await renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, api]]}>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <OrganizationDirectoryProvider>
            <Probe />
          </OrganizationDirectoryProvider>
        </QueryClientProvider>
      </TestApiProvider>,
    );

    expect(await screen.findByText('gazelle: decided')).toBeInTheDocument();
    expect(
      screen.getByText(
        'golem: golem needs a per-user connector sign-in to read organizations.',
      ),
    ).toBeInTheDocument();
    // golem's failure says nothing about ozone, known to run no agent-manager.
    expect(screen.getByText('ozone: decided')).toBeInTheDocument();
  });
});
