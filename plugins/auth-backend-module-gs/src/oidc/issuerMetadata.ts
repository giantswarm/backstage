import { Issuer } from 'openid-client';
import { LoggerService } from '@backstage/backend-plugin-api';

const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const DEFAULT_WARN_AFTER_ATTEMPTS = 5;

export type WaitForIssuerMetadataOptions = {
  /**
   * Give up and throw after this many attempts. Unbounded by default: the
   * check keeps retrying until the issuer answers.
   */
  attempts?: number;
  initialDelayMs?: number;
  /** Cap for the exponential backoff between attempts. */
  maxDelayMs?: number;
  /**
   * Escalate one retry log line from info to warn once this many attempts
   * have failed, so an outage that outlives the boot window reaches Sentry
   * exactly once per process instead of on every retry.
   */
  warnAfterAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Waits until an OIDC issuer serves a valid metadata document, retrying with
 * exponential backoff (1s, 2s, 4s, ... capped at 30s). By default it never
 * gives up: startup stays blocked, so the backend keeps answering readiness
 * 503 (and liveness 200) until the issuer is reachable, and then finishes
 * booting without a restart.
 *
 * Discovery goes through openid-client's Issuer.discover — the same code path
 * and validation the oidc authenticator uses — so anything that would break
 * the authenticator's own discovery (unreachable issuer, but also an ingress
 * answering 200 with an HTML error page, or truncated JSON) is retried here
 * too. Each attempt is bounded by openid-client's built-in HTTP timeout, so a
 * hanging connection cannot stall a single attempt indefinitely.
 *
 * Why wait instead of failing startup: a rejected startup does not stop the
 * process. The backend initializer installs a log-only unhandledRejection
 * handler before plugins initialize, so a failed `backend.start()` leaves a
 * process that serves liveness 200 / readiness 503 forever and is never
 * restarted (giantswarm/backstage#2144). Waiting turns the same outage into a
 * NotReady pod that recovers by itself within one backoff interval, and it
 * spares real clusters a crash loop when the IdP is briefly unreachable at
 * boot.
 */
export async function waitForIssuerMetadata(
  providerName: string,
  metadataUrl: string,
  logger: LoggerService,
  options: WaitForIssuerMetadataOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? Number.POSITIVE_INFINITY;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const warnAfterAttempts =
    options.warnAfterAttempts ?? DEFAULT_WARN_AFTER_ATTEMPTS;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  // A malformed metadataUrl is a config error that no amount of retrying can
  // fix — fail immediately instead of retrying it forever.
  const validatedUrl = new URL(metadataUrl).toString();

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await Issuer.discover(validatedUrl);
      if (attempt > 1) {
        logger.info(
          `Fetched issuer metadata for ${providerName} auth provider after ${attempt} attempts`,
        );
      }
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt >= attempts) {
        break;
      }
      const delayMs = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const counter = Number.isFinite(attempts)
        ? `${attempt}/${attempts}`
        : `${attempt}`;
      const message = `Failed to fetch issuer metadata for ${providerName} auth provider (attempt ${counter}), retrying in ${delayMs}ms`;
      if (attempt === warnAfterAttempts) {
        // One warn per process: the outage has outlived the boot window and
        // startup stays blocked (readiness 503) until the issuer answers.
        logger.warn(
          `${message}; startup is blocked until the issuer is reachable`,
          { error: lastError.toString() },
        );
      } else {
        // info, not warn: a retry that recovers is an expected outcome and
        // must not create Sentry issues.
        logger.info(message, { error: lastError.toString() });
      }
      await sleep(delayMs);
    }
  }

  throw new Error(
    `Failed to fetch issuer metadata for ${providerName} auth provider after ${attempts} attempts: ${lastError}`,
  );
}
