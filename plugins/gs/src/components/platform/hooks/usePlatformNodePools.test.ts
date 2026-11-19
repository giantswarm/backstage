import { nodePoolCount } from './usePlatformNodePools';

const pools = [{ name: 'alder-general' }] as any;

describe('nodePoolCount', () => {
  it('counts the pools once they are read', () => {
    expect(
      nodePoolCount({ isShown: true, pools, isLoading: false, errors: [] }),
    ).toBe(1);
  });

  it('gives no number while the pools are read', () => {
    expect(
      nodePoolCount({ isShown: true, pools: [], isLoading: true, errors: [] }),
    ).toBeUndefined();
  });

  it('gives no number where a read failed, rather than 0', () => {
    expect(
      nodePoolCount({
        isShown: true,
        pools: [],
        isLoading: false,
        errors: ['Forbidden'],
      }),
    ).toBeUndefined();
  });

  it('gives no number where the tab shows no pools', () => {
    expect(
      nodePoolCount({
        isShown: false,
        pools: [],
        isLoading: false,
        errors: [],
      }),
    ).toBeUndefined();
  });
});
