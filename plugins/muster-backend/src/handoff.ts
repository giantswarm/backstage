import type { LoggerService } from '@backstage/backend-plugin-api';
import type { MusterInstallationConfig } from '@giantswarm/backstage-plugin-gs-node';
import { workloadHeaders } from './workloadToken';

/**
 * muster's endpoint that issues a one-time sign-in handoff ticket for one of
 * its pages (contract-muster-approval.md §5a): POST with the person's bearer
 * and `{"url": "<page>"}`, answered 201 `{"ticket", "expiresIn"}`. muster
 * issues one only to its `approval.trustedClients` (the portal's own OAuth
 * client), with the portal backend's own workload token beside the person's
 * (`X-Muster-Approval-Client`), only for the person the page is bound to.
 */
export const MUSTER_HANDOFF_PATH = '/handoff-tickets';

/** How long the portal waits for a ticket before opening the plain link. */
export const HANDOFF_TIMEOUT_MS = 5_000;

/** Where muster serves its pages: its public URL, else its endpoint's host. */
export function musterPagesOrigin(
  installation: Pick<MusterInstallationConfig, 'url' | 'publicUrl'>,
): string | undefined {
  try {
    return new URL(installation.publicUrl ?? installation.url).origin;
  } catch {
    return undefined;
  }
}

/** Whether `url` is an http(s) address on the installation's muster pages. */
export function isOnMusterPages(
  url: string,
  installation: Pick<MusterInstallationConfig, 'url' | 'publicUrl'>,
): boolean {
  const origin = musterPagesOrigin(installation);
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      origin !== undefined &&
      parsed.origin === origin
    );
  } catch {
    return false;
  }
}

/** Where muster serves its pages next to an MCP endpoint: `/mcp` dropped. */
export function musterPagesBase(endpoint: string): string {
  return endpoint.replace(/\/+$/, '').replace(/\/mcp$/, '');
}

/** The handoff endpoint next to the installation's MCP endpoint. */
export function musterHandoffUrl(endpoint: string): string {
  return `${musterPagesBase(endpoint)}${MUSTER_HANDOFF_PATH}`;
}

/**
 * Asks the installation's muster for a sign-in handoff ticket for `url`, as
 * the person whose token is given. `undefined` when muster issues none
 * (handoff not set up there, an older muster, a page that is not the
 * person's, muster unreachable): the portal then opens the plain link and
 * muster signs the browser in itself. The ticket is never logged.
 */
export async function requestHandoffTicket(options: {
  installation: MusterInstallationConfig;
  url: string;
  token: string;
  /** The portal backend's workload token for muster (`workloadToken.ts`). */
  workloadToken?: string;
  logger: LoggerService;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<string | undefined> {
  const {
    installation,
    url,
    token,
    workloadToken,
    logger,
    fetchFn = fetch,
    timeoutMs = HANDOFF_TIMEOUT_MS,
  } = options;
  try {
    const response = await fetchFn(musterHandoffUrl(installation.url), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...workloadHeaders(workloadToken),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (response.status !== 201) {
      logger.info('muster issued no sign-in handoff; the link opens as is', {
        installation: installation.name,
        status: response.status,
      });
      return undefined;
    }
    const body = (await response.json()) as { ticket?: unknown };
    return typeof body.ticket === 'string' && body.ticket !== ''
      ? body.ticket
      : undefined;
  } catch (error) {
    logger.info('muster issued no sign-in handoff; the link opens as is', {
      installation: installation.name,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return undefined;
  }
}
