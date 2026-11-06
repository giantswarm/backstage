import { ReportedServiceUnavailableError } from '../errors';

/**
 * The text of the 503 {@link MusterMcpClient} answers when an installation's
 * muster could not be reached, `reason` being one of
 * {@link describeMcpFailure}'s plain words. The person reads it as it is, and
 * the muster plugin's `installationErrorLine` matches on its start, so it names
 * the installation.
 */
function musterUnreachableMessage(
  installation: string,
  reason: string,
): string {
  return `${installation} did not answer: ${reason}`;
}

/**
 * The 503 {@link MusterMcpClient} throws when an installation's muster could
 * not be reached. The client has already logged the failure as a warning, with
 * the installation in the metadata; `reportedErrorHandler()` answers it so
 * that Backstage's error middleware does not log it a second time.
 */
export class MusterUnreachableError extends ReportedServiceUnavailableError {
  constructor(installation: string, reason: string) {
    super(musterUnreachableMessage(installation, reason));
  }
}
