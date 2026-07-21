import { useSyncExternalStore } from 'react';
import {
  getInstallationsConfigSnapshot,
  InstallationConfig,
  subscribeInstallationsConfig,
} from './installationsConfig';

export type UseInstallationsResult = {
  /** Configured installations, or an empty array until the fetch resolves. */
  installations: InstallationConfig[];
  /** True until the post-sign-in `/api/gs/installations` fetch has resolved. */
  isLoading: boolean;
};

/**
 * React access to the installations config loaded from the authenticated
 * backend endpoint. Backed by the module-level source
 * (`installationsConfig.ts`) via `useSyncExternalStore`, so it works anywhere
 * in the tree without a wrapping context provider and re-renders once the data
 * arrives.
 */
export function useInstallations(): UseInstallationsResult {
  const installations = useSyncExternalStore(
    subscribeInstallationsConfig,
    getInstallationsConfigSnapshot,
  );

  return {
    installations: installations ?? [],
    isLoading: installations === undefined,
  };
}
