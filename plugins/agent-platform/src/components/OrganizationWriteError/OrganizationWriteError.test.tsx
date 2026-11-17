import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
} from '../../lib/agentManager';
import { PortalSessionEndedError } from '../../lib/portalSession';
import { OrganizationWriteError } from './OrganizationWriteError';

// The sign-in itself is the muster plugin's: what matters here is that it
// is offered, and that its landing clears the error.
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  ServerSignIn: ({ onSignedIn }: { onSignedIn?: () => void }) => (
    <button type="button" onClick={() => onSignedIn?.()}>
      Sign-in lands
    </button>
  ),
  useConnectorLabel: () => 'Agent Manager',
}));

function renderError(error: Error, organization?: string) {
  const onSignedIn = jest.fn();
  render(
    <OrganizationWriteError
      error={error}
      installation="gazelle"
      organization={organization}
      signInAction="An organization's default model is set"
      adminAction="sets its default model"
      title="Could not make this the default model"
      onSignedIn={onSignedIn}
    />,
  );
  return onSignedIn;
}

describe('OrganizationWriteError', () => {
  it('says an ended portal session plainly, whatever the write', () => {
    renderError(new PortalSessionEndedError(), 'payments');

    expect(screen.getByText('Your portal session ended')).toBeInTheDocument();
    expect(screen.queryByText('Not permitted')).toBeNull();
  });

  it("offers the sign-in to agent-manager in the action's words, and clears the error once it lands", async () => {
    const onSignedIn = renderError(
      new AgentManagerNotConnectedError('server agent-manager not connected'),
      'payments',
    );

    expect(screen.getByText('Connect to Agent Manager')).toBeInTheDocument();
    expect(
      screen.getByText(
        /^An organization's default model is set through the Agent Manager connector/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign-in lands' }),
    );
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it("names the organization's admins when agent-manager refuses the person", () => {
    renderError(
      new AgentManagerError('forbidden', 'you may not update modelconfigs'),
      'payments',
    );

    expect(screen.getByText('Not permitted')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only an admin of the organization payments sets its default model. Ask one of its admins to make the change, or to make you an admin. agent-manager answered: you may not update modelconfigs',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    [
      'a refusal outside an organization',
      new AgentManagerError('forbidden', 'you may not update modelconfigs'),
      undefined,
    ],
    [
      'any other failure',
      new AgentManagerError('conflict', 'the model changed meanwhile'),
      'payments',
    ],
  ])('says %s as it came, under the given title', (_, error, organization) => {
    renderError(error, organization);

    expect(
      screen.getByText('Could not make this the default model'),
    ).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
    expect(screen.queryByText('Not permitted')).toBeNull();
  });
});
