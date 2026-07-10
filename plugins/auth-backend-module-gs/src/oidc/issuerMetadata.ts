import fetch from 'node-fetch';
import { LoggerService } from '@backstage/backend-plugin-api';

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1000;

export type WaitForIssuerMetadataOptions = {
  attempts?: number;
  initialDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Checks that an OIDC issuer's metadata endpoint is reachable, retrying with
 * exponential backoff. Throws once all attempts are exhausted.
 *
 * The upstream oidc authenticator performs issuer discovery only once and
 * caches a rejected discovery permanently, so registering a provider whose
 * issuer is unreachable produces a provider that fails every request until
 * the process restarts. Callers use this check to decide whether registering
 * is safe, and to fail startup otherwise.
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

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(new URL(metadataUrl));
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
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
