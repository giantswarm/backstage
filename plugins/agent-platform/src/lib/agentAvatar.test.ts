import {
  AVATAR_SIZES,
  buildAgentAvatarUrl,
  buildProxiedAgentAvatarUrl,
} from './agentAvatar';

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

describe('buildProxiedAgentAvatarUrl', () => {
  const backend = 'https://portal.example';

  it('serves the same path from the backend, below the installation', () => {
    expect(
      buildProxiedAgentAvatarUrl(backend, 'graveler', 'go-developer'),
    ).toBe(
      'https://portal.example/api/agent-platform/avatars/graveler/v1/go-developer.png',
    );
  });

  it('keeps the size and preview segments of the canonical URL', () => {
    expect(
      buildProxiedAgentAvatarUrl(backend, 'graveler', 'go-developer', {
        size: 48,
        preview: true,
      }),
    ).toBe(
      'https://portal.example/api/agent-platform/avatars/graveler/v1/preview/48/go-developer.png',
    );
  });

  it('tolerates a backend URL with a trailing slash and encodes both names', () => {
    expect(
      buildProxiedAgentAvatarUrl('http://localhost:7007/', 'a b', 'a/b c'),
    ).toBe(
      'http://localhost:7007/api/agent-platform/avatars/a%20b/v1/a%2Fb%20c.png',
    );
  });

  it('names no installation host: the domain stays with the backend', () => {
    const url = buildProxiedAgentAvatarUrl(backend, 'graveler', 'go-developer');
    expect(new URL(url).origin).toBe(backend);
    expect(url).not.toMatch(/avatars\./);
  });
});
