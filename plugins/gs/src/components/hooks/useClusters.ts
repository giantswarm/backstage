import { ICluster } from '../../model/services/mapi/capiv1beta1';
import { clusterGVK } from '../../model/services/mapi/objects';
import { useListResources } from './useListResources';

export function useClusters() {
  return useListResources<ICluster>(clusterGVK);
}
