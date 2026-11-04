/**
 * The text of the 503 {@link MusterMcpClient} answers when an installation's
 * muster could not be reached, `reason` being one of
 * {@link describeMcpFailure}'s plain words.
 *
 * The person reads it as it is, and the muster plugin's `installationErrorLine`
 * matches on its start, so it names the installation. That makes the error
 * middleware's Sentry event for it one issue per installation; backend-common's
 * `normalizeSentryEvent` collapses it, and its test builds this text with this
 * function, so rewording it here fails that test instead of quietly undoing the
 * grouping.
 */
export function musterUnreachableMessage(
  installation: string,
  reason: string,
): string {
  return `${installation} did not answer: ${reason}`;
}
