/**
 * A Kubernetes label selector (`metav1.LabelSelector`).
 */
export type LabelSelector = {
  matchLabels?: { [key: string]: string };
  matchExpressions?: {
    key: string;
    operator: string;
    values?: string[];
  }[];
};

/**
 * Whether `labels` satisfy `selector`, with the semantics of
 * `metav1.LabelSelectorAsSelector`: all requirements must hold, and an empty
 * selector matches everything. An unknown operator matches nothing.
 */
export function matchesLabelSelector(
  selector: LabelSelector,
  labels: { [key: string]: string } = {},
): boolean {
  const labelsMet = Object.entries(selector.matchLabels ?? {}).every(
    ([key, value]) => labels[key] === value,
  );

  const expressionsMet = (selector.matchExpressions ?? []).every(
    ({ key, operator, values = [] }) => {
      const hasKey = Object.prototype.hasOwnProperty.call(labels, key);

      switch (operator) {
        case 'In':
          return hasKey && values.includes(labels[key]);
        case 'NotIn':
          return !hasKey || !values.includes(labels[key]);
        case 'Exists':
          return hasKey;
        case 'DoesNotExist':
          return !hasKey;
        default:
          return false;
      }
    },
  );

  return labelsMet && expressionsMet;
}
