import { governanceModeOf } from './governanceMode';

describe('governanceModeOf', () => {
  it('reads a mode muster reports', () => {
    expect(governanceModeOf({ governance: 'trusted' })).toBe('trusted');
    expect(governanceModeOf({ governance: 'governed' })).toBe('governed');
  });

  it("reads core_mcpserver_list's mode first, then /server-info's", () => {
    expect(
      governanceModeOf(
        { mcpServers: [], governance: 'governed' },
        { governance: 'trusted' },
      ),
    ).toBe('governed');
    expect(
      governanceModeOf({ mcpServers: [] }, { governance: 'trusted' }),
    ).toBe('trusted');
    expect(governanceModeOf(undefined, undefined)).toBeUndefined();
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
