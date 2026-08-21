import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { rootRouteRef } from '../../routes';
import { McpServersRouter } from '../McpServersRouter';

// The wizard registers onto the section's active installation; the section
// providers (kubernetes reads, muster session) are irrelevant to the form.
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

// The servers manager pulls in the muster session machinery; the wizard's
// routing is what's under test here.
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

describe('NewMcpServerPage', () => {
  it('renders the details step with its step label', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText('Register an MCP server')).toBeInTheDocument();
  });

  it('derives the technical name from the display name', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(screen.getByLabelText(/^Name/), 'Weather (remote)');

    expect(screen.getByLabelText(/Technical name/)).toHaveValue(
      'weather-remote',
    );
  });

  it('surfaces validation on Continue and stays on the step', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );

    expect(
      screen.getByText('Please fix the following before continuing'),
    ).toBeInTheDocument();
    expect(screen.getByText(/URL is required/)).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('continues to the authentication step once the details are valid', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(screen.getByLabelText(/^Name/), 'Weather');
    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://weather.example.com/mcp',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );

    expect(
      await screen.findByText('Step 2 of 4: Authentication'),
    ).toBeInTheDocument();
  });
});
