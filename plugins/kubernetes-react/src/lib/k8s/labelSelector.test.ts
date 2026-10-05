import { matchesLabelSelector } from './labelSelector';

describe('matchesLabelSelector', () => {
  const labels = { app: 'podinfo', tier: 'web' };

  it('matches everything with an empty selector', () => {
    expect(matchesLabelSelector({}, labels)).toBe(true);
    expect(matchesLabelSelector({}, undefined)).toBe(true);
  });

  it('requires every matchLabels entry', () => {
    expect(
      matchesLabelSelector({ matchLabels: { app: 'podinfo' } }, labels),
    ).toBe(true);
    expect(
      matchesLabelSelector(
        { matchLabels: { app: 'podinfo', tier: 'db' } },
        labels,
      ),
    ).toBe(false);
  });

  it.each([
    ['In', ['web', 'api'], true],
    ['In', ['db'], false],
    ['NotIn', ['db'], true],
    ['NotIn', ['web'], false],
    ['Exists', [], true],
    ['DoesNotExist', [], false],
    ['Unknown', [], false],
  ])('evaluates %s %j on a present key', (operator, values, expected) => {
    expect(
      matchesLabelSelector(
        { matchExpressions: [{ key: 'tier', operator, values }] },
        labels,
      ),
    ).toBe(expected);
  });

  it.each([
    ['In', false],
    ['NotIn', true],
    ['Exists', false],
    ['DoesNotExist', true],
  ])('evaluates %s on a missing key', (operator, expected) => {
    expect(
      matchesLabelSelector(
        { matchExpressions: [{ key: 'zone', operator, values: ['a'] }] },
        labels,
      ),
    ).toBe(expected);
  });

  it('requires matchLabels and matchExpressions together', () => {
    expect(
      matchesLabelSelector(
        {
          matchLabels: { app: 'podinfo' },
          matchExpressions: [{ key: 'tier', operator: 'In', values: ['db'] }],
        },
        labels,
      ),
    ).toBe(false);
  });
});
