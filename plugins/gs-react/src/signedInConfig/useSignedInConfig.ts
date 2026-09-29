import { useSyncExternalStore } from 'react';
import { Config } from '@backstage/config';
import {
  getSignedInConfigSnapshot,
  subscribeSignedInConfig,
} from './signedInConfig';

export type UseSignedInConfigResult = {
  /**
   * The signed-in config in app-config shape, or `undefined` until the
   * post-sign-in fetch has published it. Read it like `configApi`.
   */
  config: Config | undefined;
  /** True until the signed-in config has loaded. */
  isLoading: boolean;
};

/**
 * React access to the config the signed-in frontend reads. Backed by the
 * module-level source, so it works anywhere in the tree without a provider
 * and re-renders once the config arrives.
 */
export function useSignedInConfig(): UseSignedInConfigResult {
  const config = useSyncExternalStore(
    subscribeSignedInConfig,
    getSignedInConfigSnapshot,
  );

  return { config, isLoading: config === undefined };
}
