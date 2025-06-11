import { filterLabels } from './filterLabels';
import { Label, LabelConfig } from './types';

describe('filterLabels', () => {
  const labels: Label[] = [
    { key: 'env', value: 'prod' },
    { key: 'team', value: 'giantswarm' },
    { key: 'giantswarm.io/owner', value: 'alice' },
    { key: 'giantswarm.io/cluster', value: 'test-cluster' },
    { key: 'custom', value: 'foo' },
  ];

  const labelsConfig: LabelConfig[] = [
    { label: 'env:prod' },
    { label: 'team:giantswarm' },
  ];

  it('returns an empty array if no labels are provided', () => {
    const result = filterLabels([], labelsConfig);
    expect(result).toEqual([]);
  });

  it('returns an empty array if no labelsConfig is provided', () => {
    const result = filterLabels(labels, []);
    expect(result).toEqual([]);
  });

  describe('filters labels to only configured ones', () => {
    it('by exact key:value combination', () => {
      const config: LabelConfig[] = [
        { label: 'env:prod' },
        { label: 'team:giantswarm' },
      ];
      const result = filterLabels(labels, config);
      expect(result).toEqual([
        { key: 'env', value: 'prod' },
        { key: 'team', value: 'giantswarm' },
      ]);
    });

    it('by key pattern (wildcard)', () => {
      const config: LabelConfig[] = [{ label: 'giantswarm.io/*' }];
      const result = filterLabels(labels, config);
      expect(result).toEqual([
        { key: 'giantswarm.io/owner', value: 'alice' },
        { key: 'giantswarm.io/cluster', value: 'test-cluster' },
      ]);
    });

    it('by both exact key:value and key pattern', () => {
      const config: LabelConfig[] = [
        { label: 'env:prod' },
        { label: 'giantswarm.io/*' },
      ];
      const result = filterLabels(labels, config);
      expect(result).toEqual([
        { key: 'env', value: 'prod' },
        { key: 'giantswarm.io/owner', value: 'alice' },
        { key: 'giantswarm.io/cluster', value: 'test-cluster' },
      ]);
    });
  });
});
