import { OAuth2, OAuth2Session } from '@backstage/core-app-api';
import { idTokenExpiresAt } from '@giantswarm/backstage-plugin-gs-react';

type AuthResponse = {
  providerInfo: {
    idToken: string;
    accessToken: string;
    scope: string;
    expiresInSeconds?: number;
  };
  profile: OAuth2Session['profile'];
  backstageIdentity?: {
    token: string;
    identity: NonNullable<OAuth2Session['backstageIdentity']>['identity'];
    expiresInSeconds?: number;
  };
};

function inSeconds(seconds: number | undefined): Date | undefined {
  return seconds ? new Date(Date.now() + seconds * 1000) : undefined;
}

/**
 * The OAuth2 session of a portal auth response.
 *
 * `providerInfo.expiresAt` is the earlier of the response's
 * `expiresInSeconds` and the ID token's own `exp`. Backstage's OAuth2 refreshes
 * the session shortly before `expiresAt`, and the ID token is forwarded as a
 * bearer token (muster, the cluster token broker): its lifetime is the one
 * that must never lapse, also when the auth backend reports a longer one or
 * none at all.
 */
export function toOAuth2Session({
  backstageIdentity,
  ...res
}: AuthResponse): OAuth2Session {
  const expiries = [
    inSeconds(res.providerInfo.expiresInSeconds),
    res.providerInfo.idToken
      ? idTokenExpiresAt(res.providerInfo.idToken)
      : undefined,
  ].filter((date): date is Date => date !== undefined);
  const session: OAuth2Session = {
    ...res,
    providerInfo: {
      idToken: res.providerInfo.idToken,
      accessToken: res.providerInfo.accessToken,
      scopes: OAuth2.normalizeScopes(res.providerInfo.scope),
      expiresAt: expiries.length
        ? new Date(Math.min(...expiries.map(date => date.getTime())))
        : undefined,
    },
  };
  if (backstageIdentity) {
    session.backstageIdentity = {
      token: backstageIdentity.token,
      identity: backstageIdentity.identity,
      expiresAt: inSeconds(backstageIdentity.expiresInSeconds),
    };
  }
  return session;
}
