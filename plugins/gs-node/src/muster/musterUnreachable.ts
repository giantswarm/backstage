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
 * The 503 for an installation whose muster could not be reached: thrown by
 * {@link MusterMcpClient}, which has logged the failure as a warning with the
 * installation in the metadata, and by muster-backend for an installation its
 * reachability probe reports unreachable, whose state changes the probe logs.
 * `reportedErrorHandler()` answers it so that Backstage's error middleware
 * does not log it again.
 */
export class MusterUnreachableError extends ReportedServiceUnavailableError {
  // A private field and a getter rather than an own property, which the
  // error middleware would serialize into the response body.
  readonly #installation: string;

  constructor(installation: string, reason: string) {
    super(musterUnreachableMessage(installation, reason));
    this.#installation = installation;
  }

  /** The installation whose muster could not be reached. */
  get installation(): string {
    return this.#installation;
  }
}
