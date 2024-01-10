const conditionTrue = 'True';
const conditionFalse = 'False';
const conditionUnknown = 'Unknown';

/**
 * ICondition defines current service state.
 */
type ICondition = {
  /**
   * Last time the condition transitioned from one status to another. This should be when the underlying condition changed. If that is not known, then using the time when the API field changed is acceptable.
   */
  lastTransitionTime: string;
  /**
   * A human readable message indicating details about the transition. This field may be empty.
   */
  message?: string;
  /**
   * The reason for the condition's last transition in CamelCase. The specific API may choose whether or not this field is considered a guaranteed API. This field may not be empty.
   */
  reason?: string;
  /**
   * Severity provides an explicit classification of Reason code, so the users or machines can immediately understand the current situation and act accordingly. The Severity field MUST be set only when Status=False.
   */
  severity?: 'Error' | 'Warning' | 'Info' | '' | string;
  /**
   * Status of the condition, one of True, False, Unknown.
   */
  status: string;
  /**
   * Type of condition in CamelCase or in foo.example.com/CamelCase. Many .condition.type values are consistent across resources like Available, but because arbitrary conditions can be useful (see .node.status.conditions), the ability to deconflict is important.
   */
  type: string;
}

type IConditionGetter = {
  status?: {
    conditions?: ICondition[];
  };
}

type CheckOption = (condition: ICondition) => boolean;

export function getCondition(
  cr: IConditionGetter,
  type: string
): ICondition | undefined {
  const conditions = cr.status?.conditions;
  if (!conditions) return undefined;

  return conditions.find((c) => c.type === type);
}

export function hasCondition(cr: IConditionGetter, type: string): boolean {
  return typeof getCondition(cr, type) !== 'undefined';
}

export function isConditionTrue(
  cr: IConditionGetter,
  type: string,
  ...checkOptions: CheckOption[]
): boolean {
  const condition = getCondition(cr, type);
  if (!condition) return false;

  if (condition.status === conditionTrue) {
    return true;
  }

  for (const checkOption of checkOptions) {
    if (checkOption(condition)) return true;
  }

  return false;
}

export function isConditionFalse(
  cr: IConditionGetter,
  type: string,
  ...checkOptions: CheckOption[]
): boolean {
  const condition = getCondition(cr, type);
  if (!condition) return false;

  if (condition.status === conditionFalse) {
    return true;
  }

  for (const checkOption of checkOptions) {
    if (!checkOption(condition)) return true;
  }

  return false;
}

export function isConditionUnknown(
  cr: IConditionGetter,
  type: string,
  ...checkOptions: CheckOption[]
): boolean {
  const condition = getCondition(cr, type);
  if (!condition) return false;

  if (condition.status === conditionUnknown) {
    return true;
  }

  for (const checkOption of checkOptions) {
    if (checkOption(condition)) return true;
  }

  return false;
}
