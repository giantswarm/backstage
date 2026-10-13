import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { MusterEndpoint } from './MusterEndpoint';

let mockEndpoint: string | undefined;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    activeInstallation: 'gazelle',
    activeInstallationInfo: {
      name: 'gazelle',
      requiresAuth: true,
      endpoint: mockEndpoint,
    },
  }),
}));

describe('MusterEndpoint', () => {
  it('shows the active muster endpoint with a copy button', async () => {
    mockEndpoint = 'https://muster.gazelle.example/mcp';
    await renderInTestApp(<MusterEndpoint />);

    expect(
      screen.getByText('https://muster.gazelle.example/mcp'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy MCP endpoint' }),
    ).toBeInTheDocument();
  });

  it('renders nothing without a configured endpoint', async () => {
    mockEndpoint = undefined;
    await renderInTestApp(<MusterEndpoint />);

    expect(screen.queryByText('MCP endpoint')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Copy MCP endpoint' }),
    ).toBeNull();
  });
});
