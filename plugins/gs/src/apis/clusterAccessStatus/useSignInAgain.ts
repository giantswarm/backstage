import { useCallback } from 'react';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { gsAuthProvidersApiRef } from '../auth/types';

/**
 * The "Sign in again" action for an expired main session: the single main
 * login, its failure posted to the error API. The main auth API is resolved
 * only when called: a portal without a main auth provider (`gs.authProvider`
 * unset) has none, and resolving it at render would throw.
 */
export function useSignInAgain(): () => void {
  const authProvidersApi = useApi(gsAuthProvidersApiRef);
  const errorApi = useApi(errorApiRef);
  return useCallback(() => {
    Promise.resolve()
      .then(() => authProvidersApi.getMainAuthApi().signIn())
      .catch(error => errorApi.post(error));
  }, [authProvidersApi, errorApi]);
}
