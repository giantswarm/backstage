import { numberCompareSort, semverCompareSort } from './tableHelpers';

describe('semverCompareSort', () => {
  it('should sort valid semver strings correctly', () => {
    const items = [
      { version: '1.0.0' },
      { version: '10.0.0' },
      { version: '2.0.0' },
      { version: '1.2.0' },
      { version: '1.1.0' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    expect(sortedItems).toEqual([
      { version: '1.0.0' },
      { version: '1.1.0' },
      { version: '1.2.0' },
      { version: '2.0.0' },
      { version: '10.0.0' },
    ]);
  });

  it('should handle invalid semver strings by placing them at the end', () => {
    const items = [
      { version: '1.0.0' },
      { version: '10.0.0' },
      { version: 'invalid' },
      { version: '2.0.0' },
      { version: '1.1.0' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    expect(sortedItems).toEqual([
      { version: '1.0.0' },
      { version: '1.1.0' },
      { version: '2.0.0' },
      { version: '10.0.0' },
      { version: 'invalid' },
    ]);
  });

  it('should handle undefined versions by placing them at the end', () => {
    const items = [
      { version: '1.0.0' },
      { version: '10.0.0' },
      { version: undefined },
      { version: '2.0.0' },
      { version: '1.1.0' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    expect(sortedItems).toEqual([
      { version: '1.0.0' },
      { version: '1.1.0' },
      { version: '2.0.0' },
      { version: '10.0.0' },
      { version: undefined },
    ]);
  });

  it('should sort pre-release versions correctly', () => {
    const items = [
      { version: '1.0.0-beta' },
      { version: '1.0.0-alpha' },
      { version: '1.0.0-rc.1' },
      { version: '1.0.0' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    // According to semver: 1.0.0-alpha < 1.0.0-beta < 1.0.0-rc.1 < 1.0.0
    expect(sortedItems).toEqual([
      { version: '1.0.0-alpha' },
      { version: '1.0.0-beta' },
      { version: '1.0.0-rc.1' },
      { version: '1.0.0' },
    ]);
  });

  it('should handle mix of valid, pre-release, invalid, and undefined versions correctly', () => {
    const items = [
      { version: '1.0.0-rc.1' },
      { version: 'invalid' },
      { version: undefined },
      { version: '1.0.0' },
      { version: '1.0.0-alpha' },
      { version: '1.0.0-beta' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    // Expected order:
    // 1.0.0-alpha < 1.0.0-beta < 1.0.0-rc.1 < 1.0.0, then invalid and undefined versions
    expect(sortedItems).toEqual([
      { version: '1.0.0-alpha' },
      { version: '1.0.0-beta' },
      { version: '1.0.0-rc.1' },
      { version: '1.0.0' },
      { version: 'invalid' },
      { version: undefined },
    ]);
  });

  it('reads incomplete versions the way Flux does', () => {
    const items = [
      { version: '1.2.1' },
      { version: '1.3' },
      { version: '1.2' },
    ];

    const sortedItems = items.sort(semverCompareSort(item => item.version));

    expect(sortedItems).toEqual([
      { version: '1.2' },
      { version: '1.2.1' },
      { version: '1.3' },
    ]);
  });

  it('sorts newest first with descending, keeping invalid versions last', () => {
    const items = [
      { version: 'latest' },
      { version: '1.0.0' },
      { version: undefined },
      { version: '2.0.0' },
      { version: '1.10.0' },
    ];

    const sortedItems = items.sort(
      semverCompareSort(item => item.version, { descending: true }),
    );

    expect(sortedItems).toEqual([
      { version: '2.0.0' },
      { version: '1.10.0' },
      { version: '1.0.0' },
      { version: 'latest' },
      { version: undefined },
    ]);
  });
});

describe('numberCompareSort', () => {
  it('sorts numbers ascending and items without a number last', () => {
    const items = [{ cpu: 16 }, { cpu: undefined }, { cpu: 4 }, { cpu: 0 }];

    const sortedItems = items.sort(numberCompareSort(item => item.cpu));

    expect(sortedItems).toEqual([
      { cpu: 0 },
      { cpu: 4 },
      { cpu: 16 },
      { cpu: undefined },
    ]);
  });
});
