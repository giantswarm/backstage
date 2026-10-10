import { storageApiRef } from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SlackPromoBanner, slackDocsUrl } from './SlackPromoBanner';

let configured: Record<string, boolean | string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalBoolean: (key: string) => configured[key],
      getOptionalString: (key: string) => configured[key],
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

const howItWorks = () => screen.getByRole('link', { name: /^How it works/ });

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

  it("points How it works at Giant Swarm's docs, in a new tab, when no docs URL is configured", async () => {
    configured = { 'agentPlatform.integrations.slack': true };

    await render();

    // One button: the portal knows the docs, not a workspace to try it in.
    expect(howItWorks()).toHaveAttribute('href', 'https://docs.giantswarm.io');
    expect(howItWorks()).toHaveAttribute('target', '_blank');
    expect(howItWorks()).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: /Try it now/ })).toBeNull();
  });

  it('points How it works at the configured docs URL', async () => {
    configured = {
      'agentPlatform.integrations.slack': true,
      'agentPlatform.integrations.slackDocsUrl':
        'https://docs.example.com/agents-in-slack',
    };

    await render();

    expect(howItWorks()).toHaveAttribute(
      'href',
      'https://docs.example.com/agents-in-slack',
    );
  });
});

describe('slackDocsUrl', () => {
  it.each([
    [undefined, 'https://docs.giantswarm.io'],
    ['', 'https://docs.giantswarm.io'],
    ['not a url', 'https://docs.giantswarm.io'],
    // The script URL is the input under test: it must never become an href.
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)', 'https://docs.giantswarm.io'],
    ['https://wiki.example.com/slack', 'https://wiki.example.com/slack'],
    ['http://wiki.internal/slack', 'http://wiki.internal/slack'],
  ])('reads %p as %p', (configuredUrl, expected) => {
    expect(slackDocsUrl(configuredUrl)).toBe(expected);
  });
});
