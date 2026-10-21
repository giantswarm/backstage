import { render, screen } from '@testing-library/react';
import { WorkspaceManagerSignIn } from './WorkspaceManagerSignIn';

let mockNeedsLogin = true;
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useServerSignIn: () => ({ needsLogin: mockNeedsLogin }),
  ServerSignIn: (props: { serverName: string; installation: string }) => (
    <button>
      Sign in to {props.serverName} on {props.installation}
    </button>
  ),
}));
let mockHasMuster = true;
jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => (mockHasMuster ? {} : undefined),
}));

describe('WorkspaceManagerSignIn', () => {
  beforeEach(() => {
    mockNeedsLogin = true;
    mockHasMuster = true;
  });

  it("offers muster's sign-in to workspace-manager and reads again once it lands", () => {
    const onSignedIn = jest.fn();
    const { rerender } = render(
      <WorkspaceManagerSignIn installation="gazelle" onSignedIn={onSignedIn} />,
    );

    expect(screen.getByText('Sign in to use workspaces')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Sign in to workspace-manager on gazelle',
      }),
    ).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();

    mockNeedsLogin = false;
    rerender(
      <WorkspaceManagerSignIn installation="gazelle" onSignedIn={onSignedIn} />,
    );
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('shows nothing on a portal without the muster plugin', () => {
    mockHasMuster = false;
    const { container } = render(
      <WorkspaceManagerSignIn installation="gazelle" onSignedIn={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
