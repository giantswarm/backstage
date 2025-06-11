import { sortLabels } from './sortLabels';
import { Label, LabelConfig } from './types';

describe('sortLabels', () => {
  const labelsConfig: LabelConfig[] = [
    { label: 'env:prod' },
    { label: 'test.io*' },
    { label: 'giantswarm.io*' },
    { label: 'app' },
  ];

  it('sorts by config order', () => {
    const labels: Label[] = [
      { key: 'app', value: 'test-app' },
      { key: 'env', value: 'prod' },
    ];
    const sorted = sortLabels(labels, labelsConfig);
    expect(sorted[0].key).toBe('env');
    expect(sorted[1].key).toBe('app');
  });

  it('sorts by key when multiple labels match the key pattern', () => {
    const labels: Label[] = [
      { key: 'giantswarm.io/c', value: 'giantswarm-c' },
      { key: 'test.io/b', value: 'test-b' },
      { key: 'giantswarm.io/b', value: 'giantswarm-b' },
      { key: 'test.io/a', value: 'test-a' },
      { key: 'giantswarm.io/a', value: 'giantswarm-a' },
    ];
    const sorted = sortLabels(labels, labelsConfig);
    expect(sorted[0].key).toBe('test.io/a');
    expect(sorted[1].key).toBe('test.io/b');
    expect(sorted[2].key).toBe('giantswarm.io/a');
    expect(sorted[3].key).toBe('giantswarm.io/b');
    expect(sorted[4].key).toBe('giantswarm.io/c');
  });

  it('sorts labels that are not in config by key', () => {
    const labels: Label[] = [
      { key: 'c', value: 'test-c' },
      { key: 'b', value: 'test-b' },
      { key: 'a', value: 'test-a' },
    ];
    const sorted = sortLabels(labels, labelsConfig);
    expect(sorted[0].key).toBe('a');
    expect(sorted[1].key).toBe('b');
    expect(sorted[2].key).toBe('c');
  });

  it('puts config-matched labels before others', () => {
    const labels: Label[] = [
      { key: 'c', value: 'test-c' },
      { key: 'b', value: 'test-b' },
      { key: 'app', value: 'test-app' },
      { key: 'env', value: 'prod' },
      { key: 'a', value: 'test-a' },
    ];
    const sorted = sortLabels(labels, labelsConfig);
    expect(sorted[0].key).toBe('env');
    expect(sorted[1].key).toBe('app');
    expect(sorted[2].key).toBe('a');
    expect(sorted[3].key).toBe('b');
    expect(sorted[4].key).toBe('c');
  });
});
