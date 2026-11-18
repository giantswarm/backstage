import { clusterMetricsSelector } from './promql';

describe('clusterMetricsSelector', () => {
  it('selects the named metrics on one cluster', () => {
    expect(clusterMetricsSelector(['a_info', 'b_info'], 'demo')).toBe(
      '{__name__=~"a_info|b_info",cluster_id="demo"}',
    );
  });

  it('strips characters that would escape the cluster matcher', () => {
    expect(clusterMetricsSelector(['a_info'], 'de"m}o\\')).toBe(
      '{__name__=~"a_info",cluster_id="demo"}',
    );
  });
});
