import { useHomeInstallation } from '@giantswarm/backstage-plugin-gs';
import { useMusterInstallations } from '../MusterInstanceProvider/useMusterInstallations';

/**
 * The muster the portal-wide notice reads: the home installation's, reached
 * with the person's main-login token. Another installation's muster needs a
 * brokered token, and minting one on every page of the portal could ask the
 * person to sign in again for an installation they are not working on; those
 * servers are signed in to where they are used. A portal with one muster and
 * no configured home (a standalone install) reads that one. `undefined`
 * while unknown, and when the home muster is not reachable from this portal.
 */
export function useNoticeInstallation(): string | undefined {
  const { home } = useHomeInstallation();
  const { installations } = useMusterInstallations();

  const candidate =
    installations.find(info => info.name === home?.name) ??
    (installations.length === 1 ? installations[0] : undefined);
  if (!candidate || candidate.reachable === false) {
    return undefined;
  }
  return candidate.name;
}
