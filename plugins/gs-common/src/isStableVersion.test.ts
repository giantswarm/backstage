import { isStableVersion } from './isStableVersion';

describe('isStableVersion', () => {
  it.each(['1.2.3', 'v1.2.3', '1.2', '1.2.3+build.42'])(
    'treats %s as stable',
    tag => {
      expect(isStableVersion(tag)).toBe(true);
    },
  );

  it.each([
    '1.2.3-rc.1',
    '1.2.4-r08a93c50t20260127094959h1a2b3c4',
    '1.2.4-dev.my-feature.2026-01-27.09-49-59.h1a2b3c4',
    '1.2.3-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    'latest',
    'main',
    '',
  ])('treats %s as not stable', tag => {
    expect(isStableVersion(tag)).toBe(false);
  });
});
