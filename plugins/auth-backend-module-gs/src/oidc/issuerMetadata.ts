import { Issuer } from 'openid-client';
import { LoggerService } from '@backstage/backend-plugin-api';

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1000;

export type WaitForIssuerMetadataOptions = {
  attempts?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Checks that an OIDC issuer serves a valid metadata document, retrying with
 * exponential backoff. Throws once all attempts are exhausted.
 *
 * Discovery goes through openid-client's Issuer.discover — the same code path
 * and validation the oidc authenticator uses — so anything that would break
 * the authenticator's own discovery (unreachable issuer, but also an ingress
 * answering 200 with an HTML error page, or truncated JSON) fails this check
 * too. Each attempt is bounded by openid-client's built-in HTTP timeout, so a
 * hanging connection cannot stall backend startup indefinitely.
 *
 * Callers use this check to fail startup while the issuer is unavailable at
 * boot: a crash-looping pod is visible and alertable, unlike a portal that
 * comes up healthy without a login provider.
 */
export async function waitForIssuerMetadata(
  providerName: string,
  metadataUrl: string,
  logger: LoggerService,
  options: WaitForIssuerMetadataOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  // A malformed metadataUrl is a config error that no amount of retrying can
  // fix — fail immediately instead of burning the retry budget on it.
  const validatedUrl = new URL(metadataUrl).toString();

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await Issuer.discover(validatedUrl);
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < attempts) {
        const delayMs = initialDelayMs * 2 ** (attempt - 1);
        // info, not warn: a retry that recovers is an expected outcome and
        // must not create Sentry issues.
        logger.info(
          `Failed to fetch issuer metadata for ${providerName} auth provider (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms`,
          { error: lastError.toString() },
        );
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Failed to fetch issuer metadata for ${providerName} auth provider after ${attempts} attempts: ${lastError}`,
  );
}
