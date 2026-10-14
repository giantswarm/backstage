import { isSoleInstallation, nothingCouldBeRead } from './soleInstallation';

const base = {
  scope: 'all',
  isLoading: false,
  installations: ['inst-1', 'inst-2'],
  unreachableInstallations: [],
};

describe('isSoleInstallation', () => {
  it('is true for a pinned installation, even while loading', () => {
    expect(
      isSoleInstallation({ ...base, scope: 'inst-1', isLoading: true }),
    ).toBe(true);
  });

  it('is true when only one installation was read from', () => {
    expect(isSoleInstallation({ ...base, installations: ['inst-1'] })).toBe(
      true,
    );
  });

  it('is true when only one of several answered', () => {
    expect(
      isSoleInstallation({ ...base, unreachableInstallations: ['inst-2'] }),
    ).toBe(true);
  });

  it('is false when several answered', () => {
    expect(isSoleInstallation(base)).toBe(false);
  });

  it('is not decided while installations are still loading', () => {
    expect(
      isSoleInstallation({
        ...base,
        installations: ['inst-1'],
        isLoading: true,
      }),
    ).toBe(false);
  });
});

describe('nothingCouldBeRead', () => {
  it('is true when every installation in view failed', () => {
    expect(
      nothingCouldBeRead({ installations: ['a'], unreadable: ['a'] }),
    ).toBe(true);
    // Failed before it could say what it runs: nothing in view at all.
    expect(nothingCouldBeRead({ installations: [], unreadable: ['a'] })).toBe(
      true,
    );
  });

  it('is false while one in view was read, or nothing failed', () => {
    expect(
      nothingCouldBeRead({ installations: ['a', 'b'], unreadable: ['b'] }),
    ).toBe(false);
    expect(nothingCouldBeRead({ installations: [], unreadable: [] })).toBe(
      false,
    );
    expect(nothingCouldBeRead({ installations: ['a'], unreadable: [] })).toBe(
      false,
    );
  });
});
