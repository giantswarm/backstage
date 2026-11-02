import { screen, within } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { AuthStatusResponse, MusterApi, musterApiRef } from '../../apis';
import { ProviderAppConnections } from './ProviderAppConnections';

function api(response: AuthStatusResponse) {
  return {
    getAuthStatus: jest.fn(() => Promise.resolve(response)),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  } as unknown as MusterApi;
}

describe('ProviderAppConnections', () => {
  it("lists every provider App with its state, inside the host's wrapper", async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[
          [
            musterApiRef,
            api({
              servers: [{ name: 'workspace-manager', status: 'auth_required' }],
              providerApps: [
                { name: 'github', status: 'auth_required' },
                { name: 'chatgpt', status: 'connected' },
              ],
            }),
          ],
        ]}
      >
        <ProviderAppConnections installation="lab-a">
          {list => <section aria-label="Wrapper">{list}</section>}
        </ProviderAppConnections>
      </TestApiProvider>,
    );

    const wrapper = await screen.findByRole('region', { name: 'Wrapper' });
    const rows = within(wrapper).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('ChatGPT');
    expect(rows[0]).toHaveTextContent('✓ Connected');
    expect(rows[1]).toHaveTextContent('github');
    expect(
      within(rows[1]).getByRole('button', { name: 'Connect' }),
    ).toBeEnabled();
    expect(wrapper).not.toHaveTextContent('workspace-manager');
  });

  it('renders nothing while muster lists no App', async () => {
    await renderInTestApp(
      <TestApiProvider
        apis={[[musterApiRef, api({ servers: [], providerApps: [] })]]}
      >
        <ProviderAppConnections installation="lab-b">
          {list => <section aria-label="Wrapper">{list}</section>}
        </ProviderAppConnections>
      </TestApiProvider>,
    );

    expect(
      screen.queryByRole('region', { name: 'Wrapper' }),
    ).not.toBeInTheDocument();
  });
});
