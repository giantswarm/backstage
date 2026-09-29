import { isSoleInstallation } from './soleInstallation';

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
