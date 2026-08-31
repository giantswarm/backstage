import { useInstallations } from '../../apis/installations';

/**
 * Whether the Mimir observability endpoint is expected to exist for an
 * installation. Every Giant Swarm management cluster runs the observability
 * stack, so the default is true; standalone installations opt out with
 * `gs.installations.<name>.mimirEnabled: false`, and metrics-backed UI then
 * renders neutral "unavailable" states instead of firing queries that can
 * only fail.
 *
 * Returns `undefined` while the installations config is still loading, so
 * callers can keep showing a loading state instead of flashing "unavailable".
 */
export function useMimirAvailable(
  installationName: string,
): boolean | undefined {
  const { installations, isLoading } = useInstallations();

  if (isLoading) {
    return undefined;
  }

  const installation = installations.find(
    ({ name }) => name === installationName,
  );

  return installation?.mimirEnabled !== false;
}
