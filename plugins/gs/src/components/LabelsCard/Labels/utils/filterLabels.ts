import { findLabelConfig } from './findLabelConfig';
import { Label, LabelConfig } from './types';

export function filterLabels(labels: Label[], labelsConfig: LabelConfig[]) {
  return labels.filter(({ key, value }) => {
    return Boolean(findLabelConfig(key, value, labelsConfig));
  });
}
