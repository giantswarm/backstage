import type {
  BackstageCredentials,
  HttpAuthService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { NotAllowedError, ServiceUnavailableError } from '@backstage/errors';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { tokenOidcIdentity } from '@giantswarm/backstage-plugin-gs-node';
import type express from 'express';

/** A shared identity owns no person's token. */
const GUEST_USER = 'user:default/guest';

/** What the frontend is told when the forwarded token is not the person's. */
export const NOT_OWN_TOKEN_MESSAGE =
  "The token forwarded for muster is not the signed-in person's own; nothing was sent to muster.";

/**
 * Whether `token` names `userEntityRef`: the person the portal's sign-in
 * resolver would sign that token's identity in as (`oidcIdentity`,
 * gs-node). `undefined` when it does; otherwise why not, which never quotes
 * the token.
 */
async function mismatch(options: {
  token: string;
  userEntityRef: string;
  catalog?: CatalogService;
  credentials: BackstageCredentials;
}): Promise<string | undefined> {
  const { token, userEntityRef, catalog, credentials } = options;
  const principal = parseEntityRef(userEntityRef);
  if (principal.kind.toLocaleLowerCase('en-US') !== 'user') {
    return 'principal is no user';
  }
  const identity = tokenOidcIdentity(token);
  switch (identity.kind) {
    case 'refused':
      return 'token names nobody the portal signs in';
    case 'external':
      return stringifyEntityRef(parseEntityRef(identity.userEntityRef)) ===
        stringifyEntityRef(principal)
        ? undefined
        : 'token is another person’s';
    case 'catalog': {
      if (!catalog) {
        return 'no catalog to look the person up in';
      }
      let entity;
      try {
        entity = await catalog.getEntityByRef(principal, { credentials });
      } catch {
        throw new ServiceUnavailableError(
          'The catalog could not be asked who you are; try again in a moment.',
        );
      }
      const value =
        identity.field === 'metadata.name'
          ? entity?.metadata.name
          : (entity?.spec?.profile as { email?: unknown } | undefined)?.email;
      return typeof value === 'string' &&
        value.toLocaleLowerCase('en-US') ===
          identity.value.toLocaleLowerCase('en-US')
        ? undefined
        : 'token is another person’s';
    }
    default:
      return 'token names nobody the portal signs in';
  }
}

/**
 * Refuses (403) unless `token`, the token the frontend forwarded for muster,
 * is the signed-in Backstage user's own. The routes that present it to muster
 * together with the portal's workload token (`/handoff`, `/approvals/view`,
 * `/approvals/decision`) call it before muster is called: the workload token
 * proves to muster that the portal presents the token, so the portal must
 * present only the person's own (a portal user who holds another person's
 * token, from a server it was forwarded to, must not decide for them).
 *
 * The person is the one the sign-in resolver maps the token's identity onto:
 * `user:oidc/<hash of sub>` compared with the user's ref, or a staff
 * identity's catalog field (`metadata.name` for the GitHub connector, the
 * verified email otherwise) compared with the user's entity. A request
 * without a user (none, a service, the shared guest) is refused. A refusal is
 * logged with the user, the installation and why, never the token.
 */
export async function assertOwnToken(options: {
  req: express.Request;
  token: string;
  httpAuth: HttpAuthService;
  catalog?: CatalogService;
  logger: LoggerService;
  installation: string;
  route: string;
}): Promise<void> {
  const { req, token, httpAuth, catalog, logger, installation, route } =
    options;
  const credentials = await httpAuth.credentials(req, { allow: ['user'] });
  const { userEntityRef } = credentials.principal;
  const why =
    userEntityRef === GUEST_USER
      ? 'principal is the shared guest'
      : await mismatch({ token, userEntityRef, catalog, credentials });
  if (why) {
    logger.info(
      'Refused to present a token for muster that is not the signed-in person’s own',
      {
        audit: 'muster_token_not_own',
        installation,
        route,
        user: userEntityRef,
        reason: why,
      },
    );
    throw new NotAllowedError(NOT_OWN_TOKEN_MESSAGE);
  }
}
