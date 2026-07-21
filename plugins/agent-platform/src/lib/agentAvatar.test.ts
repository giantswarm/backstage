import { AVATAR_SIZES, buildAgentAvatarUrl } from './agentAvatar';

describe('buildAgentAvatarUrl', () => {
  const baseDomain = 'graveler.gaws2.gigantic.io';

  it('builds the default (unsized) canonical URL', () => {
    expect(buildAgentAvatarUrl(baseDomain, 'go-developer')).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/go-developer.png',
    );
  });

  it('includes the size segment when requested', () => {
    expect(buildAgentAvatarUrl(baseDomain, 'go-developer', { size: 96 })).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/96/go-developer.png',
    );
  });

  it('uses the no-cache preview route, before the size segment', () => {
    expect(
      buildAgentAvatarUrl(baseDomain, 'go-developer', {
        size: 96,
        preview: true,
      }),
    ).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/preview/96/go-developer.png',
    );
  });

  it('supports a preview URL without an explicit size', () => {
    expect(
      buildAgentAvatarUrl(baseDomain, 'go-developer', { preview: true }),
    ).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/preview/go-developer.png',
    );
  });

  it('encodes the name', () => {
    expect(buildAgentAvatarUrl(baseDomain, 'a/b c')).toBe(
      'https://avatars.graveler.gaws2.gigantic.io/v1/a%2Fb%20c.png',
    );
  });

  it('exposes the endpoint size allowlist', () => {
    expect(AVATAR_SIZES).toEqual([48, 96, 128, 512]);
  });
});
