import { compareVersionOptions } from './VersionPicker';

function opt(value: string) {
  return { value, label: value };
}

describe('compareVersionOptions', () => {
  it('sorts standard semver versions', () => {
    const input = [opt('2.0.0'), opt('1.0.0'), opt('3.0.0')];
    expect(input.sort(compareVersionOptions).map(o => o.value)).toEqual([
      '1.0.0',
      '2.0.0',
      '3.0.0',
    ]);
  });

  it('handles versions with non-semver suffixes like build metadata', () => {
    const input = [
      opt('2.2.0_fa483d226565'),
      opt('1.0.0'),
      opt('3.1.0_abc123'),
    ];
    expect(input.sort(compareVersionOptions).map(o => o.value)).toEqual([
      '1.0.0',
      '2.2.0_fa483d226565',
      '3.1.0_abc123',
    ]);
  });

  it('sorts non-semver strings alphabetically after semver versions', () => {
    const input = [opt('banana'), opt('1.0.0'), opt('apple')];
    expect(input.sort(compareVersionOptions).map(o => o.value)).toEqual([
      '1.0.0',
      'apple',
      'banana',
    ]);
  });
});
