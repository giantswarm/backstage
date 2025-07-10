import { useContext } from 'react';
import {
  assertClustersInfoContext,
  ClustersInfoContext,
} from '../../components/ClustersInfoProvider';

export function useClustersInfo() {
  const context = useContext(ClustersInfoContext);

  assertClustersInfoContext(context);

  return context;
}
