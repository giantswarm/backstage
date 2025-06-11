import { findLabelConfig } from './findLabelConfig';
import { Label, LabelConfig, LabelWithDisplayInfo } from './types';

export function addDisplayInfo(
  labels: Label[],
  labelsConfig: LabelConfig[],
): LabelWithDisplayInfo[] {
  return labels.map(({ key, value }) => {
    const labelConfig = findLabelConfig(key, value, labelsConfig);

    return {
      key,
      value,
      formattedKey: labelConfig?.key ?? key,
      formattedValue: labelConfig?.valueMap?.[value] ?? value,
      variant: labelConfig?.variant,
    };
  });
}
