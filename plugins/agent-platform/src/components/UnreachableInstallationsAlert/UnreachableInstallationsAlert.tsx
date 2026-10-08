import { Alert } from '@backstage/ui';
import type { ReadFailure } from '../../lib/readFailure';

export type UnreachableInstallationsAlertProps = {
  /** Installations whose kagent resources couldn't be read. */
  installations: string[];
  /**
   * The resource being listed, used in the explanation (e.g. "ModelConfigs",
   * "Agents"). Defaults to a generic "kagent resources".
   */
  resourceName?: string;
  /**
   * Why each installation could not be read. When given, the banner names the
   * reason and request id per installation instead of guessing at both.
   */
  failures?: Record<string, ReadFailure>;
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
  failures,
}: UnreachableInstallationsAlertProps) {
  if (installations.length === 0) {
    return null;
  }

  const count = installations.length;

  return (
    <Alert
      status="warning"
      title={`Couldn't read ${count} installation${count === 1 ? '' : 's'}`}
      description={
        failures
          ? `Skipped because their ${resourceName} couldn't be read: ${installations
              .map(installation =>
                describe(installation, failures[installation]),
              )
              .join('; ')}.`
          : `Skipped because their ${resourceName} couldn't be read — the installation may be unreachable, or you may not have permission to list ${resourceName} there: ${installations.join(
              ', ',
            )}.`
      }
    />
  );
}

/** `gremlin (timed out, request id 3f2c…)`, or the bare name with no failure. */
function describe(installation: string, failure: ReadFailure | undefined) {
  if (!failure) {
    return installation;
  }
  const requestId = failure.requestId
    ? `, request id ${failure.requestId}`
    : '';
  return `${installation} (${failure.reason}${requestId})`;
}
