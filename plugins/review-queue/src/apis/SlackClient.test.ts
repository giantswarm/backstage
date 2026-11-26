import {
  MusterUnauthorizedError,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { SlackClient, SlackNotConnectedError } from './SlackClient';

type Call = {
  name: string;
  args: Record<string, unknown>;
  installation?: string;
  options?: { urlElicitation?: boolean };
};

function musterWith(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const musterApi = {
    callTool: jest.fn(
      async (
        name: string,
        args: Record<string, unknown>,
        installation?: string,
        options?: { urlElicitation?: boolean },
      ) => {
        const call = { name, args, installation, options };
        calls.push(call);
        return answer(call);
      },
    ),
  } as unknown as MusterApi;
  return { musterApi, calls };
}

const SENT = {
  message_context: {
    channel_id: 'C0SHIELD01',
    message_ts: '1790324925.717189',
  },
};

describe('SlackClient', () => {
  it('looks a name up, then posts to its ID, as a call the person started', async () => {
    const { musterApi, calls } = musterWith(({ name }) =>
      name === 'x_slack_search_channels'
        ? { channels: [{ id: 'C0SHIELD01', name: 'team-shield' }] }
        : SENT,
    );
    const sent = await new SlackClient(musterApi, 'gazelle').send(
      '#team-shield',
      'Waiting for a review',
    );
    expect(calls).toEqual([
      {
        name: 'x_slack_search_channels',
        args: { query: 'team-shield', limit: 20 },
        installation: 'gazelle',
        options: { urlElicitation: true },
      },
      {
        name: 'x_slack_send_message',
        args: { channel_id: 'C0SHIELD01', message: 'Waiting for a review' },
        installation: 'gazelle',
        options: { urlElicitation: true },
      },
    ]);
    expect(sent.post?.url).toBe(
      'https://slack.com/archives/C0SHIELD01/p1790324925717189',
    );
  });

  it('posts to an ID as it is', async () => {
    const { musterApi, calls } = musterWith(() => SENT);
    await new SlackClient(musterApi, 'gazelle').send('C0123ABCDEF', 'hi');
    expect(calls.map(call => call.name)).toEqual(['x_slack_send_message']);
    expect(calls[0].args.channel_id).toBe('C0123ABCDEF');
  });

  it("passes a name Slack's search does not match on, for Slack to judge", async () => {
    const { musterApi, calls } = musterWith(({ name }) =>
      name === 'x_slack_search_channels' ? 'No channels found.' : SENT,
    );
    await new SlackClient(musterApi, 'gazelle').send('#team-shield', 'hi');
    expect(calls[1].args.channel_id).toBe('team-shield');
  });

  it('asks to connect Slack when muster has no grant', async () => {
    const { musterApi } = musterWith(() => {
      throw new MusterUnauthorizedError(
        'Sign in to slack to use its tools.',
        'server_sign_in_required',
        'slack',
        'gazelle',
      );
    });
    await expect(
      new SlackClient(musterApi, 'gazelle').send('#team-shield', 'hi'),
    ).rejects.toBeInstanceOf(SlackNotConnectedError);
  });

  it("keeps Slack's refusal in its own words", async () => {
    const { musterApi } = musterWith(({ name }) => {
      if (name === 'x_slack_send_message') {
        throw new Error('channel_not_found');
      }
      return { channels: [] };
    });
    await expect(
      new SlackClient(musterApi, 'gazelle').send('#nope', 'hi'),
    ).rejects.toThrow('channel_not_found');
  });
});
