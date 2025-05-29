import { createContext, ReactNode } from 'react';
import { InstallationInfo, useInstallationsData } from './useInstallationsData';

export type InstallationsData = {
  installations: string[];
  installationsInfo: InstallationInfo[];
  activeInstallations: string[];
  disabledInstallations: string[];
  selectedInstallations: string[];
  setSelectedInstallations: (items: string[]) => void;
};

export const InstallationsContext = createContext<InstallationsData | null>(
  null,
);

export function assertInstallationsContext(
  value: any,
): asserts value is InstallationsData {
  if (value === null) {
    throw new Error('InstallationsContext not found');
  }
}

export interface InstallationsProviderProps {
  children: ReactNode;
}

export const InstallationsProvider = ({
  children,
}: InstallationsProviderProps) => {
  const installationsData = useInstallationsData();

  return (
    <InstallationsContext.Provider value={installationsData}>
      {children}
    </InstallationsContext.Provider>
  );
};
