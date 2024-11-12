import { findLabelConfigIndex } from './findLabelConfig';
import { Label, LabelConfig } from './types';

export function sortLabels(labels: Label[], labelsConfig: LabelConfig[]) {
  return labels.sort((a, b) => {
    // Sort by position in labels config first, then sort by key.
    const aIndex = findLabelConfigIndex(a.key, a.value, labelsConfig);
    const bIndex = findLabelConfigIndex(b.key, b.value, labelsConfig);

    const aHasIndex = aIndex >= 0;
    const bHasIndex = bIndex >= 0;

    if (aHasIndex && bHasIndex) {
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return a.key.localeCompare(b.key);
    }

    if (aHasIndex) return -1;
    if (bHasIndex) return 1;

    return a.key.localeCompare(b.key);
  });
}
