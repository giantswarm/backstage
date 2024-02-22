import { IHelmRelease } from '../../model/services/mapi/helmv2beta1';
import { helmReleaseGVK } from '../../model/services/mapi/objects';
import { useListResources } from './useListResources';

export function useHelmReleases() {
  return useListResources<IHelmRelease>(helmReleaseGVK);
}
