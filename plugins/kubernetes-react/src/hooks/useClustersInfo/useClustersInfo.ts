import { useContext } from 'react';
import {
  assertKubernetesClustersInfoContext,
  KubernetesClustersInfoContext,
} from '../../components/KubernetesClustersInfoProvider';

export function useClustersInfo() {
  const context = useContext(KubernetesClustersInfoContext);

  assertKubernetesClustersInfoContext(context);

  return context;
}
