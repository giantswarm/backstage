import { OLDER_METRICS_UNAVAILABLE } from '@giantswarm/backstage-plugin-ui-react';
import {
  describeActualCost,
  describeModelCostFallback,
  withFallbackReason,
} from './modelCostCopy';

describe('describeModelCostFallback', () => {
  it.each([
    'identity-unreadable',
    'no-identity',
    'not-recorded',
    'no-spend',
    'unreadable',
    'error',
  ] as const)(
    'gives %p a reason, since a priced estimate can sit beside it',
    reason => {
      expect(describeModelCostFallback(reason, 'gazelle', 30)).toMatch(
        /^No actual cost: /,
      );
    },
  );

  it('says older data is temporarily unavailable in the shared words', () => {
    expect(
      describeModelCostFallback('older-data-unavailable', 'gazelle', 30),
    ).toBe(`No actual cost. ${OLDER_METRICS_UNAVAILABLE.sentence}`);
  });

  it('leaves no-mimir to the estimate’s own line, which already says it', () => {
    expect(
      describeModelCostFallback('no-mimir', 'gazelle', 30),
    ).toBeUndefined();
  });
});

describe('the window in the copy', () => {
  // kagent's session window is configurable, down to one day, and these
  // sentences sit beside the cost basis, which names its window in words.
  it('reads a one-day window in the singular', () => {
    expect(describeModelCostFallback('no-spend', 'gazelle', 1)).toContain(
      'in the last day.',
    );
    expect(
      describeActualCost({
        installation: 'gazelle',
        days: 1,
        partial: false,
        converted: false,
      }),
    ).toContain('on gazelle in the last day.');
  });

  it('reads any other window in days', () => {
    expect(describeModelCostFallback('no-spend', 'gazelle', 30)).toContain(
      'in the last 30 days.',
    );
  });
});

describe('withFallbackReason', () => {
  const olderData = Object.assign(new Error('Mimir could not answer'), {
    reason: 'older_data_unavailable',
  });
  const fallback = (
    reason: 'older-data-unavailable' | 'unreadable',
  ): { state: 'fallback'; reason: typeof reason } => ({
    state: 'fallback',
    reason,
  });

  it('leads the basis with why there is no actual cost', () => {
    expect(
      withFallbackReason({
        cost: fallback('unreadable'),
        installation: 'gazelle',
        days: 30,
        basis: 'Estimated: something.',
      }),
    ).toBe(
      'No actual cost: gazelle’s gateway metrics could not be read just now. Estimated: something.',
    );
  });

  it('says older data is unavailable once when the rate failed for it too', () => {
    const text = withFallbackReason({
      cost: fallback('older-data-unavailable'),
      installation: 'gazelle',
      days: 30,
      basis: `No estimate. ${OLDER_METRICS_UNAVAILABLE.sentence}`,
      rateFailure: olderData,
    });

    expect(text).toBe(
      `No actual cost and no estimate. ${OLDER_METRICS_UNAVAILABLE.sentence}`,
    );
    expect(text.split(OLDER_METRICS_UNAVAILABLE.title)).toHaveLength(2);
  });

  it('keeps both when only the actual cost failed for it', () => {
    expect(
      withFallbackReason({
        cost: fallback('older-data-unavailable'),
        installation: 'gazelle',
        days: 30,
        basis: 'Estimated: something.',
      }),
    ).toBe(
      `No actual cost. ${OLDER_METRICS_UNAVAILABLE.sentence} Estimated: something.`,
    );
  });

  it('is the basis alone with an actual cost', () => {
    expect(
      withFallbackReason({
        cost: { state: 'loading' },
        installation: 'gazelle',
        days: 30,
        basis: 'Estimated: something.',
      }),
    ).toBe('Estimated: something.');
  });
});
