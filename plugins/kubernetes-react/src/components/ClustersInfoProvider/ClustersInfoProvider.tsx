import { createContext, ReactNode } from 'react';
import { useClustersInfoData } from './useClustersInfoData';

export type ClustersInfo = {
  clusters: string[];
  activeClusters: string[];
  activeCluster: string | null;
  selectedClusters: string[];
  selectedCluster: string | null;
  setSelectedClusters: (items: string[]) => void;
  setSelectedCluster: (items: string | null) => void;
};

export const ClustersInfoContext = createContext<ClustersInfo | null>(null);

export function assertClustersInfoContext(
  value: any,
): asserts value is ClustersInfo {
  if (value === null) {
    throw new Error('ClustersInfoContext not found');
  }
}

export interface ClustersInfoProviderProps {
  children: ReactNode;
}

export const ClustersInfoProvider = ({
  children,
}: ClustersInfoProviderProps) => {
  const clustersInfo = useClustersInfoData({
    persistToURL: true,
  });

  return (
    <ClustersInfoContext.Provider value={clustersInfo}>
      {children}
    </ClustersInfoContext.Provider>
  );
};
