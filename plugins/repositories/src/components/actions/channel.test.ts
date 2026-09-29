import { messageTarget } from './channel';

describe('messageTarget', () => {
  it('names the channel by its name, the ID only when the manager sent none, the team alone without a channel', () => {
    expect(
      messageTarget({
        team: 'team-bumblebee',
        channel: 'C0ALXPMB1PW',
        channelName: 'team-bumblebee',
      }),
    ).toBe('#team-bumblebee (team-bumblebee)');
    expect(
      messageTarget({ team: 'team-bumblebee', channel: 'C0ALXPMB1PW' }),
    ).toBe('C0ALXPMB1PW (team-bumblebee)');
    expect(messageTarget({ team: 'team-bumblebee' })).toBe('team-bumblebee');
  });
});
