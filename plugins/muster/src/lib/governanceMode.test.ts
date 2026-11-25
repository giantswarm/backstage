import { governanceModeOf } from './governanceMode';

describe('governanceModeOf', () => {
  it('reads a mode muster reports', () => {
    expect(governanceModeOf({ governance: 'trusted' })).toBe('trusted');
    expect(governanceModeOf({ governance: 'governed' })).toBe('governed');
  });

  it('reads no mode, another value or no answer as unknown, never trusted', () => {
    expect(governanceModeOf({})).toBeUndefined();
    expect(governanceModeOf({ unavailable: true })).toBeUndefined();
    expect(
      governanceModeOf({ governance: 'open' as unknown as 'trusted' }),
    ).toBeUndefined();
    expect(governanceModeOf(undefined)).toBeUndefined();
  });
});
