import { ConditionState } from '../../../utils/gatewayTopology';

/** A condition with the name a table header would give it. */
export type NamedCondition = { name: string; condition: ConditionState };

/**
 * The condition a stacked row shows next to its title: a failing one first,
 * then one not reported, then one not available, else the first, so the row
 * shows a check only when all are true.
 */
export function worstCondition(
  conditions: readonly NamedCondition[],
): NamedCondition | undefined {
  for (const status of ['false', 'not-reported', 'not-available'] as const) {
    const found = conditions.find(
      ({ condition }) => condition.status === status,
    );
    if (found) return found;
  }
  return conditions[0];
}

/** `False · RefNotPermitted`, as a table cell would show it. */
export function conditionValue(condition: ConditionState): string {
  switch (condition.status) {
    case 'true':
      return 'True';
    case 'false':
      return condition.reason ? `False · ${condition.reason}` : 'False';
    case 'not-reported':
      return 'Not reported';
    default:
      return 'Not available';
  }
}

/** `Accepted: False · RefNotPermitted`, the condition named. */
export function conditionText({ name, condition }: NamedCondition): string {
  return `${name}: ${conditionValue(condition)}`;
}

/**
 * Under a stacked row: every condition, which the table shows as columns,
 * and why one is not reported, which the table shows on hover.
 */
export function conditionsDetails(
  conditions: readonly NamedCondition[],
): string {
  const notReported = conditions.some(
    ({ condition }) => condition.status === 'not-reported',
  );
  return [
    conditions.map(conditionText).join(', '),
    notReported ? 'No controller has reported a condition yet.' : '',
  ]
    .filter(Boolean)
    .join('. ');
}
