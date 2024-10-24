import { Labels } from '@giantswarm/backstage-plugin-gs-common';

export function getClusterLabelsWithDisplayInfo(
  labels: Record<string, string>,
  filterHiddenLabels: boolean = true,
): {
  key: string;
  value: string;
  displayKey: string;
  displayValue: string;
  textColor?: string;
  backgroundColor?: string;
}[] {
  const filteredLabels = filterHiddenLabels
    ? (filterLabels(labels) ?? {})
    : labels;

  const labelsWithDisplayInfo = Object.entries(filteredLabels).map(
    ([key, value]) => {
      return {
        key,
        value,
        ...getClusterLabelKeyDisplayInfo(key),
        ...getClusterLabelValueDisplayInfo(key, value),
      };
    },
  );

  const sortedLabelsWithDisplayInfo = labelsWithDisplayInfo.sort((a, b) => {
    if (!filterHiddenLabels) {
      return a.key.localeCompare(b.key);
    }

    // Sort by special purpose first and then by displayKey

    const aIsImportant = isSpecialPurposeLabel(a.key);
    const bIsImportant = isSpecialPurposeLabel(b.key);

    return (
      Number(bIsImportant) - Number(aIsImportant) ||
      a.displayKey.localeCompare(b.displayKey)
    );
  });

  return sortedLabelsWithDisplayInfo;
}

function filterLabels(labels: Record<string, string>): Record<string, string> {
  return Object.entries(labels).reduce((acc, [key, value]) => {
    if (isSpecialPurposeLabel(key)) {
      return { ...acc, [key]: value };
    }

    return acc;
  }, {});
}

function getClusterLabelKeyDisplayInfo(key: string) {
  switch (key) {
    case Labels.labelServicePriority:
      return { displayKey: 'Service priority' };

    default:
      return { displayKey: key };
  }
}

function getClusterLabelValueDisplayInfo(key: string, value: string) {
  switch (`${key}:${value}`) {
    case `${Labels.labelServicePriority}:highest`:
      return {
        displayValue: 'Highest',
        textColor: 'text-accent',
        backgroundColor: 'service-priority-highest',
      };
    case `${Labels.labelServicePriority}:medium`:
      return {
        displayValue: 'Medium',
        textColor: 'text-accent',
        backgroundColor: 'service-priority-medium',
      };
    case `${Labels.labelServicePriority}:lowest`:
      return {
        displayValue: 'Lowest',
        textColor: 'text',
        backgroundColor: 'service-priority-lowest',
      };

    default:
      return { displayValue: value };
  }
}

function isSpecialPurposeLabel(key: string) {
  switch (key) {
    case Labels.labelServicePriority:
      return true;
    default:
      return false;
  }
}
