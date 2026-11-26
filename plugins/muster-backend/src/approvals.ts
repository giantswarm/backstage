import type { LoggerService } from '@backstage/backend-plugin-api';
import type { MusterInstallationConfig } from '@giantswarm/backstage-plugin-gs-node';
import { isOnMusterPages, musterPagesBase } from './handoff';
import { workloadHeaders } from './workloadToken';

/**
 * muster's decision API for a trusted client (contract-muster-approval.md
 * §5b): `GET /approvals/<id>` with the person's bearer shows the pending
 * approval (what muster's page shows, made safe the same way, and its
 * digest); `POST /approvals/<id>/decision` `{decision, digest}` decides it.
 * muster takes them only from its `approval.trustedClients` (the portal's own
 * OAuth client), only with the person's own token together with the portal
 * backend's workload token (`X-Muster-Approval-Client`), only for their
 * request.
 */
export const MUSTER_APPROVALS_PATH = '/approvals/';

/** How long the portal waits for muster's decision API. */
export const APPROVAL_TIMEOUT_MS = 10_000;

/** What muster answered when it showed or decided nothing. */
export type ApprovalRefusal = {
  /** muster's HTTP status, 502 when muster could not be reached. */
  status: number;
  /** muster's error code (`untrusted_client`, `foreign`, ...). */
  error: string;
  message: string;
  /** For `decided`: what stands (`approved`, `declined`). */
  decided?: string;
};

export type ApprovalViewAnswer =
  { view: Record<string, unknown> } | { refusal: ApprovalRefusal };

export type ApprovalDecisionAnswer =
  { status: 'approved' | 'declined' } | { refusal: ApprovalRefusal };

/**
 * The approval id of a link to the installation's muster approval page
 * (`<pages>/approvals/<id>`, an alphanumeric id), `undefined` for any other
 * link: another origin, another path, a query or fragment.
 */
export function approvalIdOf(
  url: string,
  installation: Pick<MusterInstallationConfig, 'url' | 'publicUrl'>,
): string | undefined {
  if (!isOnMusterPages(url, installation)) {
    return undefined;
  }
  const parsed = new URL(url);
  if (parsed.search || parsed.hash || parsed.username || parsed.password) {
    return undefined;
  }
  const basePath = new URL(
    musterPagesBase(installation.publicUrl ?? installation.url),
  ).pathname.replace(/\/+$/, '');
  if (basePath && !parsed.pathname.startsWith(`${basePath}/`)) {
    return undefined;
  }
  return /^\/approvals\/([A-Za-z0-9]+)$/.exec(
    parsed.pathname.slice(basePath.length),
  )?.[1];
}

/** muster's approval resource for `id`, next to the installation's endpoint. */
export function musterApprovalUrl(endpoint: string, id: string): string {
  return `${musterPagesBase(endpoint)}${MUSTER_APPROVALS_PATH}${encodeURIComponent(id)}`;
}

function refusalOf(status: number, body: unknown): ApprovalRefusal {
  const record = (body ?? {}) as Record<string, unknown>;
  return {
    status,
    error: typeof record.error === 'string' ? record.error : 'unknown',
    message:
      typeof record.message === 'string'
        ? record.message
        : `muster answered ${status}.`,
    ...(typeof record.status === 'string' && { decided: record.status }),
  };
}

const UNREACHABLE: ApprovalRefusal = {
  status: 502,
  error: 'unreachable',
  message: 'muster could not be reached. Try again in a moment.',
};

async function call(options: {
  installation: MusterInstallationConfig;
  target: string;
  token: string;
  workloadToken?: string;
  logger: LoggerService;
  init: RequestInit;
  fetchFn?: typeof fetch;
}): Promise<{ status: number; body: unknown } | undefined> {
  const {
    installation,
    target,
    token,
    workloadToken,
    logger,
    init,
    fetchFn = fetch,
  } = options;
  try {
    const response = await fetchFn(target, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...workloadHeaders(workloadToken),
      },
      signal: AbortSignal.timeout(APPROVAL_TIMEOUT_MS),
      redirect: 'error',
    });
    const body = await response.json().catch(() => undefined);
    return { status: response.status, body };
  } catch (error) {
    logger.info('muster could not be reached for an approval', {
      installation: installation.name,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return undefined;
  }
}

/** Reads the person's pending approval `id` from the installation's muster. */
export async function fetchApproval(options: {
  installation: MusterInstallationConfig;
  id: string;
  token: string;
  workloadToken?: string;
  logger: LoggerService;
  fetchFn?: typeof fetch;
}): Promise<ApprovalViewAnswer> {
  const answer = await call({
    ...options,
    target: musterApprovalUrl(options.installation.url, options.id),
    init: { method: 'GET' },
  });
  if (!answer) {
    return { refusal: UNREACHABLE };
  }
  if (
    answer.status === 200 &&
    answer.body &&
    typeof answer.body === 'object' &&
    typeof (answer.body as { digest?: unknown }).digest === 'string'
  ) {
    return { view: answer.body as Record<string, unknown> };
  }
  options.logger.info('muster showed no approval', {
    installation: options.installation.name,
    status: answer.status,
  });
  return { refusal: refusalOf(answer.status, answer.body) };
}

/**
 * Posts the person's decision on approval `id`, with the digest of the view
 * the person saw. Called only on the person's click in the chat.
 */
export async function postApprovalDecision(options: {
  installation: MusterInstallationConfig;
  id: string;
  decision: 'approve' | 'decline';
  digest: string;
  token: string;
  workloadToken?: string;
  logger: LoggerService;
  fetchFn?: typeof fetch;
}): Promise<ApprovalDecisionAnswer> {
  const { decision, digest } = options;
  const answer = await call({
    ...options,
    target: `${musterApprovalUrl(options.installation.url, options.id)}/decision`,
    init: { method: 'POST', body: JSON.stringify({ decision, digest }) },
  });
  if (!answer) {
    return { refusal: UNREACHABLE };
  }
  const status = (answer.body as { status?: unknown } | undefined)?.status;
  if (
    answer.status === 200 &&
    (status === 'approved' || status === 'declined')
  ) {
    options.logger.info('person decided an approval in the portal', {
      installation: options.installation.name,
      outcome: status,
    });
    return { status };
  }
  options.logger.info('muster took no decision', {
    installation: options.installation.name,
    status: answer.status,
  });
  return { refusal: refusalOf(answer.status, answer.body) };
}
