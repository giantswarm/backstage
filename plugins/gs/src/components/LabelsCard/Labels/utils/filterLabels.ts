import { findLabelConfig } from './findLabelConfig';
import { Label, LabelConfig } from './types';

export function filterLabels(labels: Label[], labelsConfig: LabelConfig[]) {
  return labels.filter(({ key, value }) =>
    isWellKnownLabel(key, value, labelsConfig),
  );
}

function isWellKnownLabel(
  key: string,
  value: string,
  labelsConfig: LabelConfig[],
) {
  const labelConfig = findLabelConfig(key, value, labelsConfig);

  return Boolean(labelConfig);
}
