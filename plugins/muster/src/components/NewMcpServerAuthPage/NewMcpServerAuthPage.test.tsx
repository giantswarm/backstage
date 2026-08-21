import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { rootRouteRef } from '../../routes';
import { McpServersRouter } from '../McpServersRouter';

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
  }),
}));

jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
}));

function renderWizard(path: string) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/muster/servers/*"
        element={<McpServersRouter />}
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
    },
  );
}

/** Walks the real flow: fills the details step, continues to authentication. */
async function renderAuthStep() {
  const result = await renderWizard('/agent-platform/muster/servers/new');
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
    await renderWizard('/agent-platform/muster/servers/new/auth');

    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(
      screen.queryByText('Step 2 of 4: Authentication'),
    ).not.toBeInTheDocument();
  });

  it('asks the auth question with three choices, defaulting to no authentication', async () => {
    await renderAuthStep();

    const choices = screen.getAllByRole('radio');
    expect(choices.map(c => c.getAttribute('aria-label'))).toEqual([
      'No authentication',
      'Sign in with your own account',
      'Platform SSO',
    ]);
    expect(
      screen.getByRole('radio', { name: 'No authentication' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the callback URL to allowlist for the own-account choice', async () => {
    await renderAuthStep();

    await userEvent.click(
      screen.getByRole('radio', { name: 'Sign in with your own account' }),
    );

    expect(
      screen.getByText('https://muster.gazelle.example.com/oauth/callback'),
    ).toBeInTheDocument();
  });

  it('keeps scopes disabled with an explanation until an issuer override is set', async () => {
    await renderAuthStep();
    await userEvent.click(
      screen.getByRole('radio', { name: 'Sign in with your own account' }),
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
});
