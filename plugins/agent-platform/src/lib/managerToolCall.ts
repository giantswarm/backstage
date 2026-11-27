import {
  musterUnauthorizedInfoOf,
  type MusterApi,
  type MusterProviderAppGrant,
} from '@giantswarm/backstage-plugin-muster';
import { portalSessionError, PortalSessionEndedError } from './portalSession';

/** How a platform manager's client turns muster's failures into its errors. */
export type ManagerErrors = {
  /** What a muster call threw, as the manager's error. */
  classify: (error: unknown) => Error;
  /** An answer that is prose where the data was expected. */
  notJSON: (message: string) => Error;
};

/**
 * One tool of a platform manager (workspace-manager, the toolchain-manager)
 * on an installation, called through its muster as the signed-in person:
 * `musterApi.callTool()` with the person's token, the answer's data parsed.
 * The proxy parses the tool's JSON; a bare string is a JSON text it left
 * alone, or prose where the data was expected, which fails.
 */
export async function callManagerTool<T>(
  musterApi: MusterApi,
  installation: string,
  toolName: string,
  args: Record<string, unknown>,
  errors: ManagerErrors,
): Promise<T> {
  let result: unknown;
  try {
    result = await musterApi.callTool(toolName, args, installation);
  } catch (error) {
    // The portal refusing the session token is said as that, never in its
    // words: nothing reached muster (`portalSession.ts`).
    const ended = portalSessionError(error);
    throw ended instanceof PortalSessionEndedError
      ? ended
      : errors.classify(error);
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as T;
    } catch {
      throw errors.notJSON(`${toolName} answered text, not JSON: ${result}`);
    }
  }
  return result as T;
}

/**
 * The provider Apps a failed manager call needs the person's grant of, when
 * that is why it failed: muster answers a call of a server that receives the
 * person's App grants, made without them, with its `auth_required` tool error
 * instead of the manager's own `grant_required` answer, and muster-backend
 * passes the Apps on in its 401. `undefined` for any other failure.
 */
export function providerAppGrantsOf(
  error: unknown,
): MusterProviderAppGrant[] | undefined {
  const unauthorized = musterUnauthorizedInfoOf(error);
  return unauthorized?.reason === 'server_sign_in_required' &&
    unauthorized.apps?.length
    ? unauthorized.apps
    : undefined;
}

/** muster's sign-in for a provider App, as a manager's `signIn` sentence says it. */
export function providerAppSignIn(app: string): string {
  return `Grant the ${app} App in muster first: core_auth_login app=${app}`;
}
