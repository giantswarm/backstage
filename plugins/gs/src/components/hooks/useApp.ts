import { IApp } from '../../model/services/mapi/applicationv1alpha1';
import { appGVK } from '../../model/services/mapi/objects';
import { useGetResource } from './useGetResource';

export function useApp(
  installationName: string,
  name: string,
  namespace?: string,
) {
  return useGetResource<IApp>(installationName, appGVK, name, namespace);
}
