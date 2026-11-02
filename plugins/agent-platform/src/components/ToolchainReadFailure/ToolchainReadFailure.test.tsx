import { render, screen } from '@testing-library/react';
import { ToolchainReadFailure } from './ToolchainReadFailure';

let mockSignInRequired = false;
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  musterSignInRequiredOf: () =>
    mockSignInRequired ? { server: 'toolchain-manager' } : undefined,
  useServerSignIn: () => ({ needsLogin: true }),
  ServerSignIn: (props: { serverName: string; installation: string }) => (
    <button>
      Sign in to {props.serverName} on {props.installation}
    </button>
  ),
}));
jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => ({}),
}));

describe('ToolchainReadFailure', () => {
  beforeEach(() => {
    mockSignInRequired = false;
  });

  it('offers the sign-in to the toolchain-manager for a read muster refused for it', () => {
    mockSignInRequired = true;
    render(
      <ToolchainReadFailure
        installation="gazelle"
        error={new Error('auth_required')}
        title="The toolchain sources could not be read"
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('Sign in to use toolchains')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Sign in to toolchain-manager on gazelle',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('auth_required')).not.toBeInTheDocument();
  });

  it('says what could not be read for any other failure', () => {
    render(
      <ToolchainReadFailure
        installation="gazelle"
        error={new Error('connection refused')}
        title="The toolchain sources could not be read"
        onRetry={jest.fn()}
      />,
    );

    expect(
      screen.getByText('The toolchain sources could not be read'),
    ).toBeInTheDocument();
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });
});
