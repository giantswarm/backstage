import { MimirQueryResponse } from '../../apis/mimir/types';
import { blockingError, optionalSamplesOf, samplesOf } from './mimirSamples';

const response = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [{ metric: { name: 'a' }, value: [0, '1'] }],
  },
} as unknown as MimirQueryResponse;

describe('mimirSamples', () => {
  it('keeps the last result of an optional query when a refetch fails', () => {
    expect(optionalSamplesOf(response, new Error('refetch failed'))).toEqual(
      samplesOf(response),
    );
  });

  it('reports an optional query without any result that failed as missing', () => {
    expect(optionalSamplesOf(undefined, new Error('failed'))).toBeUndefined();
    expect(optionalSamplesOf(undefined, null)).toEqual([]);
  });

  it('only blocks on a required query that never succeeded', () => {
    const error = new Error('failed');
    expect(blockingError({ data: undefined, error })).toBe(error);
    expect(blockingError({ data: response, error })).toBeUndefined();
    expect(blockingError({ data: undefined, error: null })).toBeUndefined();
  });
});
