import { useMemo } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import {
  addDisplayInfo,
  filterLabels,
  getLabelsConfig,
  sortLabels,
} from './utils';
import { LabelWithDisplayInfo } from './utils/types';

export function useLabelsWithDisplayInfo(
  labelsMap: Record<string, string>,
  displayRawLabels: boolean = false,
): LabelWithDisplayInfo[] {
  const configApi = useApi(configApiRef);

  return useMemo(() => {
    let labels = Object.entries(labelsMap).map(([key, value]) => ({
      key,
      value,
    }));
    if (displayRawLabels) {
      return addDisplayInfo(labels, []);
    }

    const labelsConfig = getLabelsConfig(configApi);
    labels = filterLabels(labels, labelsConfig);
    labels = sortLabels(labels, labelsConfig);

    return addDisplayInfo(labels, labelsConfig);
  }, [configApi, displayRawLabels, labelsMap]);
}
