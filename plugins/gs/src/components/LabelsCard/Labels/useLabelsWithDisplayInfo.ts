import { useMemo } from 'react';
import { addDisplayInfo, filterLabels, sortLabels } from './utils';
import { LabelConfig, LabelWithDisplayInfo } from './utils/types';

export function useLabelsWithDisplayInfo(
  labelsMap: Record<string, string>,
  displayFriendlyItems: boolean = true,
  labelsConfig: LabelConfig[],
): LabelWithDisplayInfo[] {
  return useMemo(() => {
    let labels = Object.entries(labelsMap).map(([key, value]) => ({
      key,
      value,
    }));
    if (!displayFriendlyItems) {
      return addDisplayInfo(labels, []);
    }

    labels = filterLabels(labels, labelsConfig);
    labels = sortLabels(labels, labelsConfig);

    return addDisplayInfo(labels, labelsConfig);
  }, [displayFriendlyItems, labelsConfig, labelsMap]);
}
