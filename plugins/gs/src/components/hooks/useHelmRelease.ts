import { IHelmRelease } from '../../model/services/mapi/helmv2beta1';
import { helmReleaseGVK } from '../../model/services/mapi/objects';
import { useGetResource } from './useGetResource';

export function useHelmRelease(installationName: string, name: string, namespace?: string) {
  return useGetResource<IHelmRelease>(installationName, helmReleaseGVK, name, namespace);
}
