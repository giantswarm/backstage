import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';

/** Registered servers of the active installation, per test. */
let mockMcpServers: MCPServer[] = [];

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: 'gazelle',
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers: mockMcpServers,
    isLoading: false,
  }),
}));

jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
}));

// Transport detection on the details step needs the muster API and session
// providers this test doesn't set up; it has its own tests in
// NewMcpServerPage.test.tsx.
jest.mock('../NewMcpServerPage/useTransportDetection', () => ({
  useTransportDetection: () => ({ detected: undefined, probing: false }),
}));

function renderWizard(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/mcp-servers/*"
        element={<McpServersRouter />}
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/mcp-servers': mcpServersRouteRef },
    },
  );
}

/** Walks the real flow: fills the details step, continues to authentication. */
async function renderAuthStep() {
  const result = await renderWizard('/agent-platform/mcp-servers/new');
  await userEvent.type(screen.getByLabelText(/^Name/), 'Weather');
  await userEvent.type(
    screen.getByLabelText(/^URL/),
    'https://weather.example.com/mcp',
  );
  await userEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
  await screen.findByText('Step 2 of 4: Authentication');
  return result;
}

describe('NewMcpServerAuthPage', () => {
  it('sends a deep link back to step 1 while the details are incomplete', async () => {
    await renderWizard('/agent-platform/mcp-servers/new/auth');

    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(
      screen.queryByText('Step 2 of 4: Authentication'),
    ).not.toBeInTheDocument();
  });

  it('asks the auth question with four choices, defaulting to no authentication', async () => {
    await renderAuthStep();

    const choices = screen.getAllByRole('radio');
    expect(choices.map(c => c.getAttribute('aria-label'))).toEqual([
      'No authentication',
      'Own account (OAuth sign-in)',
      'Platform SSO',
      'AWS request signing (SigV4)',
    ]);
    expect(
      screen.getByRole('radio', { name: 'No authentication' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the callback URL to allowlist for the own-account choice', async () => {
    await renderAuthStep();

    await userEvent.click(
      screen.getByRole('radio', { name: 'Own account (OAuth sign-in)' }),
    );

    expect(
      screen.getByText('https://muster.gazelle.example.com/oauth/callback'),
    ).toBeInTheDocument();
  });

  it('keeps scopes disabled with an explanation until an issuer override is set', async () => {
    await renderAuthStep();
    await userEvent.click(
      screen.getByRole('radio', { name: 'Own account (OAuth sign-in)' }),
    );

    expect(screen.getByLabelText(/Scopes/)).toBeDisabled();
    expect(
      screen.getByText(/Scopes belong to the issuer override/),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText(/Issuer/),
      'https://auth.example.com',
    );

    expect(screen.getByLabelText(/Scopes/)).toBeEnabled();
  });

  it('warns about token exposure and the new-audience caveat for Platform SSO', async () => {
    await renderAuthStep();

    await userEvent.click(screen.getByRole('radio', { name: 'Platform SSO' }));

    expect(
      screen.getByText(
        'This server receives the platform identity token of every user who uses its tools',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only choose this for backends your platform team administers.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('New audiences need a muster restart'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Required audiences/)).toBeEnabled();
  });

  it('says whose identity SigV4 signs as, and asks for the signing region', async () => {
    await renderAuthStep();

    await userEvent.click(
      screen.getByRole('radio', { name: 'AWS request signing (SigV4)' }),
    );

    // The point of the choice: it is a shared machine identity, not SSO.
    expect(
      screen.getByText('This grants every user the same shared AWS identity'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/CloudTrail attributes their actions to muster/),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/Signing region/)).toBeEnabled();
    expect(screen.getByLabelText(/Signing service/)).toBeEnabled();
    expect(screen.getByLabelText(/Assumed role ARN/)).toBeEnabled();
    // Region is required, so Continue must not move on without it.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );
    expect(
      await screen.findByText(/Signing region is required for AWS SigV4/),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4: Authentication')).toBeInTheDocument();
  });

  it('advises about the operating region a SigV4 server silently guesses', async () => {
    await renderAuthStep();
    await userEvent.click(
      screen.getByRole('radio', { name: 'AWS request signing (SigV4)' }),
    );
    await userEvent.type(
      screen.getByLabelText(/Signing region/),
      'eu-central-1',
    );

    expect(
      screen.getByText(/No AWS_REGION in request metadata/),
    ).toBeInTheDocument();
    // An advisory, not a blocker: it is not raised as something to fix.
    // (That it leaves the form complete is asserted in the provider's tests.)
    expect(
      screen.queryByText(/Please fix the following/),
    ).not.toBeInTheDocument();
  });

  it('withdraws the SigV4 choice on a transport the CRD forbids it on', async () => {
    await renderAuthStep();
    // Back to the details step to pick the legacy transport.
    await userEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]);
    await screen.findByText('Step 1 of 4: Details');
    await userEvent.click(screen.getByRole('radio', { name: 'Transport SSE' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );
    await screen.findByText('Step 2 of 4: Authentication');

    const sigv4 = screen.getByRole('radio', {
      name: 'AWS request signing (SigV4)',
    });
    expect(sigv4).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(/only with the Streamable HTTP transport/),
    ).toBeInTheDocument();

    // Clicking it changes nothing rather than composing a rejected definition.
    await userEvent.click(sigv4);
    expect(
      screen.getByRole('radio', { name: 'No authentication' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  describe('required audiences', () => {
    beforeEach(() => {
      mockMcpServers = [];
    });

    it('keeps them when the already-selected choice is clicked again', async () => {
      await renderAuthStep();
      await userEvent.click(
        screen.getByRole('radio', { name: 'Platform SSO' }),
      );
      await userEvent.type(
        screen.getByLabelText(/Required audiences/),
        'aud-a, aud-b',
      );

      await userEvent.click(
        screen.getByRole('radio', { name: 'Platform SSO' }),
      );

      expect(screen.getByLabelText(/Required audiences/)).toHaveValue(
        'aud-a, aud-b',
      );
    });

    it('clears the text with the state when the choice changes', async () => {
      await renderAuthStep();
      await userEvent.click(
        screen.getByRole('radio', { name: 'Platform SSO' }),
      );
      await userEvent.type(
        screen.getByLabelText(/Required audiences/),
        'aud-a',
      );

      await userEvent.click(
        screen.getByRole('radio', { name: 'No authentication' }),
      );
      await userEvent.click(
        screen.getByRole('radio', { name: 'Platform SSO' }),
      );

      expect(screen.getByLabelText(/Required audiences/)).toHaveValue('');
    });

    it("brings an edited server's audiences back when its own choice is picked again", async () => {
      mockMcpServers = [
        new MCPServer(
          {
            apiVersion: 'muster.giantswarm.io/v1alpha1',
            kind: 'MCPServer',
            metadata: { name: 'miro' },
            spec: {
              type: 'streamable-http',
              url: 'https://mcp.miro.com/',
              auth: {
                forwardToken: true,
                requiredAudiences: ['aud-a', 'aud-b'],
              },
            },
          } as never,
          'gazelle',
        ),
      ];
      await renderWizard('/agent-platform/mcp-servers/new/auth?edit=miro');
      await screen.findByText('Step 2 of 4: Authentication');
      expect(screen.getByLabelText(/Required audiences/)).toHaveValue(
        'aud-a, aud-b',
      );

      await userEvent.click(
        screen.getByRole('radio', { name: 'No authentication' }),
      );
      await userEvent.click(
        screen.getByRole('radio', { name: 'Platform SSO' }),
      );

      expect(screen.getByLabelText(/Required audiences/)).toHaveValue(
        'aud-a, aud-b',
      );
    });
  });
});
