import { useContext } from 'react';
import {
  assertInstallationsContext,
  InstallationsContext,
  InstallationsData,
} from '../installations/InstallationsProvider/InstallationsProvider';

export const useInstallations = (): InstallationsData => {
  const context = useContext(InstallationsContext);

  assertInstallationsContext(context);

  return context;
};
