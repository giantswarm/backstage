import { storageApiRef } from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SlackPromoBanner } from './SlackPromoBanner';

let configured: Record<string, boolean | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalBoolean: (key: string) => configured[key],
    },
    isLoading: false,
  }),
}));

function render(storage = mockApis.storage()) {
  return renderInTestApp(<SlackPromoBanner />, {
    apis: [[storageApiRef, storage]],
  });
}

const banner = () =>
  screen.queryByRole('region', { name: 'Use agents in Slack' });

describe('SlackPromoBanner', () => {
  beforeEach(() => {
    configured = {};
  });

  it('renders nothing, and reads nothing, while the integration is not configured', async () => {
    const storage = mockApis.storage();
    const forBucket = jest.spyOn(storage, 'forBucket');

    await render(storage);

    expect(banner()).not.toBeInTheDocument();
    expect(screen.queryByText(/Slack/)).not.toBeInTheDocument();
    // Zero footprint: not even the dismissal is fetched from user settings.
    expect(forBucket).not.toHaveBeenCalledWith('agent-platform');
  });

  it('renders nothing when the integration is switched off', async () => {
    configured = { 'agentPlatform.integrations.slack': false };

    await render();

    expect(banner()).not.toBeInTheDocument();
  });

  it('invites people to use their agents in Slack once enabled', async () => {
    configured = { 'agentPlatform.integrations.slack': true };

    await render();

    expect(banner()).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Use your agents right in Slack',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mention an agent in any channel/),
    ).toBeInTheDocument();
  });

  it('stays gone for good once dismissed', async () => {
    configured = { 'agentPlatform.integrations.slack': true };
    const storage = mockApis.storage();

    await render(storage);
    await userEvent.click(
      screen.getByRole('button', {
        name: "Dismiss, and don't show this again",
      }),
    );

    await waitFor(() => expect(banner()).not.toBeInTheDocument());
    expect(
      storage.forBucket('agent-platform').snapshot('dismissedHints').value,
    ).toEqual(['slackPromo']);
  });

  it('stays hidden for a person who dismissed it before', async () => {
    configured = { 'agentPlatform.integrations.slack': true };
    const storage = mockApis.storage();
    await storage
      .forBucket('agent-platform')
      .set('dismissedHints', ['slackPromo']);

    await render(storage);

    expect(banner()).not.toBeInTheDocument();
  });
});
