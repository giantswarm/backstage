import { render, screen } from '@testing-library/react';
import { ConnectMargeAlert } from './ConnectMargeAlert';

jest.mock('../../hooks/useMarge', () => ({
  useMargeServerName: () => 'mcp-marge',
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  ServerSignIn: () => <div data-testid="server-sign-in" />,
  useConnectorLabel: (_installation: string, name: string) =>
    name === 'mcp-marge' ? 'Marge' : name,
}));

describe('ConnectMargeAlert', () => {
  it("says muster's sign-in request in its own words, with the connector's display name", () => {
    render(
      <ConnectMargeAlert
        installation="gazelle"
        message="auth_required: server 'mcp-marge' requires authentication; sign in to it to use its tools."
      />,
    );

    expect(screen.getByText('Sign in to GitHub for Marge')).toBeInTheDocument();
    expect(
      screen.getByText(/You have not given it that grant on gazelle yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/requires authentication/)).toBeNull();
    expect(screen.getByTestId('server-sign-in')).toBeInTheDocument();
  });

  // A tool not found may be a marge that is not registered or is down: a
  // sign-in may not fix it, so the answer stays in sight.
  it('keeps any other answer in sight', () => {
    render(
      <ConnectMargeAlert
        installation="gazelle"
        message="tool not found: x_marge_list_queue"
      />,
    );

    expect(
      screen.getByText('tool not found: x_marge_list_queue'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your session on gazelle cannot use it yet\./),
    ).toBeInTheDocument();
  });
});
