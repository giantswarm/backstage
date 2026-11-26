import { rowOf, type PrState } from './github';
import {
  channelIdIn,
  channelNameOf,
  channelProblem,
  defaultChannelOf,
  slackPostMessage,
  postOf,
  slackToolName,
} from './slack';

const row = (number: number, title: string) =>
  rowOf({
    number,
    title,
    html_url: `https://github.com/giantswarm/dex-app/pull/${number}`,
    user: { login: 'fhielpos' },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    repository_url: 'https://api.github.com/repos/giantswarm/dex-app',
  });

const STATE: PrState = {
  ci: { state: 'failing', failing: ['lint'], running: 0, total: 2 },
  review: { state: 'approved', approvals: 2, changesBy: [] },
  merge: { state: 'conflicts', raw: 'dirty' },
};

describe('slack', () => {
  it("names a tool as muster exposes the slack server's tools", () => {
    expect(slackToolName('send_message')).toBe('x_slack_send_message');
  });

  describe('the default channel', () => {
    it("is the team in view's channel", () => {
      expect(defaultChannelOf('Shield 🛡️', ['team-atlas'])).toBe(
        '#team-shield',
      );
      expect(defaultChannelOf('Honey Badger 🦡', [])).toBe('#team-honeybadger');
    });

    it('is my own team under All teams, else none', () => {
      expect(defaultChannelOf('all', ['team-shield'])).toBe('#team-shield');
      expect(defaultChannelOf('all', [])).toBe('');
    });
  });

  describe('a typed channel', () => {
    it('takes the name with or without #', () => {
      expect(channelNameOf(' #team-shield ')).toBe('team-shield');
    });

    it.each(['#team-shield', 'team-shield', 'C0123ABCDEF'])(
      'takes %j',
      input => {
        expect(channelProblem(input)).toBeUndefined();
      },
    );

    it.each([
      ['', 'Name the channel'],
      ['#Team Shield', 'lowercase letters'],
    ])('refuses %j', (input, problem) => {
      expect(channelProblem(input)).toContain(problem);
    });
  });

  describe('channel search answers', () => {
    it('finds the exact name in JSON', () => {
      expect(
        channelIdIn(
          {
            channels: [
              { id: 'C0ALERTS01', name: 'team-shield-alerts' },
              { id: 'C0SHIELD01', name: 'team-shield' },
            ],
          },
          'team-shield',
        ),
      ).toBe('C0SHIELD01');
    });

    it('finds it in JSON that came as text', () => {
      expect(
        channelIdIn(
          JSON.stringify([
            { channel_id: 'C0SHIELD01', channel_name: '#team-shield' },
          ]),
          'team-shield',
        ),
      ).toBe('C0SHIELD01');
    });

    it('finds it in a line of text naming the channel and its ID', () => {
      expect(
        channelIdIn(
          'Channels:\n- #team-shield-alerts (C0ALERTS01)\n- #team-shield (C0SHIELD01): Team Shield',
          'team-shield',
        ),
      ).toBe('C0SHIELD01');
    });

    it('finds nothing for a name that only starts the same', () => {
      expect(
        channelIdIn('- #team-shield-alerts (C0ALERTS01)', 'team-shield'),
      ).toBeUndefined();
    });
  });

  describe('a send answer', () => {
    it('links the message from its message_context', () => {
      expect(
        postOf({
          message_context: {
            channel_id: 'C0123ABCDEF',
            message_ts: '1790324925.717189',
          },
        }),
      ).toEqual({
        channel: 'C0123ABCDEF',
        ts: '1790324925.717189',
        url: 'https://slack.com/archives/C0123ABCDEF/p1790324925717189',
      });
    });

    it('has no link without one', () => {
      expect(postOf('Message sent')).toBeUndefined();
    });
  });

  describe('the message', () => {
    it('lists each PR with its link and state, and mentions nobody', () => {
      const one = row(640, 'Map connectors by id');
      const two = row(641, 'Fix [the] docs');
      expect(slackPostMessage([one, two], new Map([[one.id, STATE]]))).toBe(
        [
          'Waiting for reviews:',
          '- [Map connectors by id](https://github.com/giantswarm/dex-app/pull/640) · dex-app#640 · CI failing · 2 approvals · conflicts',
          '- [Fix the docs](https://github.com/giantswarm/dex-app/pull/641) · dex-app#641',
        ].join('\n'),
      );
    });

    it('says a review for one PR', () => {
      expect(slackPostMessage([row(1, 'x')], new Map())).toMatch(
        /^Waiting for a review:/,
      );
    });
  });
});
