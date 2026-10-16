import { useHomeInstallation } from '@giantswarm/backstage-plugin-gs';
import { useMusterInstallations } from '../MusterInstanceProvider/useMusterInstallations';

export type SignInInstallation = {
  /**
   * The installation whose muster the sign-in status is read from;
   * `undefined` while unknown, and when the home muster is not reachable from
   * this portal.
   */
  installation: string | undefined;
  /** The home installation or the musters are still being read. */
  isLoading: boolean;
};

/**
 * The muster the portal-wide sign-in status reads: the home installation's,
 * reached with the person's main-login token. Another installation's muster
 * needs a brokered token, and minting one on every page of the portal could
 * ask the person to sign in again for an installation they are not working
 * on; those servers are signed in to where they are used. A portal with one
 * muster and no configured home (a standalone install) reads that one.
 */
export function useSignInInstallation(): SignInInstallation {
  const { home, isLoading: isHomeLoading } = useHomeInstallation();
  const { installations, isLoading: areInstallationsLoading } =
    useMusterInstallations();

  const candidate =
    installations.find(info => info.name === home?.name) ??
    (installations.length === 1 ? installations[0] : undefined);
  return {
    installation:
      !candidate || candidate.reachable === false ? undefined : candidate.name,
    isLoading: isHomeLoading || areInstallationsLoading,
  };
}
