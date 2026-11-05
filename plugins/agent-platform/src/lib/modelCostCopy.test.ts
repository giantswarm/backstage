import { OLDER_METRICS_UNAVAILABLE } from '@giantswarm/backstage-plugin-ui-react';
import { describeActualCost, describeModelCostFallback } from './modelCostCopy';

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
    ).toBe(
      `No actual cost. ${OLDER_METRICS_UNAVAILABLE.title}. ${OLDER_METRICS_UNAVAILABLE.description}`,
    );
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
