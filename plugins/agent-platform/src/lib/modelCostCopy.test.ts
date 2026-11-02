import { describeModelCostFallback } from './modelCostCopy';

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

  it('leaves no-mimir to the estimate’s own line, which already says it', () => {
    expect(
      describeModelCostFallback('no-mimir', 'gazelle', 30),
    ).toBeUndefined();
  });
});
