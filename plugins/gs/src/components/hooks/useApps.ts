import { IApp } from '../../model/services/mapi/applicationv1alpha1';
import { appGVK } from '../../model/services/mapi/objects';
import { useListResources } from './useListResources';

export function useApps() {
  return useListResources<IApp>(appGVK);
}
