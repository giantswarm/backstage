import { Alert } from '@backstage/ui';

export type UnreachableInstallationsAlertProps = {
  /** Installations whose kagent resources couldn't be read. */
  installations: string[];
  /**
   * The resource being listed, used in the explanation (e.g. "ModelConfigs",
   * "Agents"). Defaults to a generic "kagent resources".
   */
  resourceName?: string;
};

/**
 * Warning card listing installations that were skipped because their kagent
 * resources couldn't be read (unreachable, or the user lacks permission).
 * Shared by the create flow (installation select) and the agents list so the two
 * surfaces report partial-fleet failures identically. Renders nothing when the
 * list is empty.
 */
export function UnreachableInstallationsAlert({
  installations,
  resourceName = 'kagent resources',
}: UnreachableInstallationsAlertProps) {
  if (installations.length === 0) {
    return null;
  }

  const count = installations.length;

  return (
    <Alert
      status="warning"
      title={`Couldn't read ${count} installation${count === 1 ? '' : 's'}`}
      description={`Skipped because their ${resourceName} couldn't be read — the installation may be unreachable, or you may not have permission to list ${resourceName} there: ${installations.join(
        ', ',
      )}.`}
    />
  );
}
