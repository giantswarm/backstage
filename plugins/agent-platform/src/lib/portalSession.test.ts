import { ResponseError } from '@backstage/errors';
import { MusterUnauthorizedError } from '@giantswarm/backstage-plugin-muster';

import { classifyAgentManagerError } from './agentManager';
import {
  isPortalSessionRefusal,
  PORTAL_SESSION_ENDED_MESSAGE,
  PortalSessionEndedError,
} from './portalSession';

/** A plugin backend route's error answer, as `ResponseError` reads it. */
async function routeError(status: number, name: string, message: string) {
  return ResponseError.fromResponse(
    new Response(
      JSON.stringify({
        error: { name, message },
        request: { method: 'POST', url: '/' },
        response: { statusCode: status },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

describe('isPortalSessionRefusal', () => {
  // What Backstage's backend answers for a session token it cannot verify
  // (a restart that lost its signing keys): 401, AuthenticationError.
  it('is the portal refusing the session token on a plugin route', async () => {
    expect(
      isPortalSessionRefusal(
        await routeError(
          401,
          'AuthenticationError',
          'Failed user token verification',
        ),
      ),
    ).toBe(true);
  });

  it('is the portal refusing the session token before muster-backend', () => {
    expect(
      isPortalSessionRefusal(
        new MusterUnauthorizedError(
          'Failed user token verification',
          undefined,
          undefined,
          'gazelle',
          'AuthenticationError',
        ),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'agent-manager refusing on the credential route',
      401,
      'AgentManagerError',
    ],
    ['a refusal of the right', 403, 'AuthenticationError'],
  ])('is not %s', async (_case, status, name) => {
    expect(isPortalSessionRefusal(await routeError(status, name, 'x'))).toBe(
      false,
    );
  });

  it("is not muster-backend's own 401", () => {
    expect(
      isPortalSessionRefusal(
        new MusterUnauthorizedError(
          'sign in',
          'server_sign_in_required',
          'agent-manager',
          'gazelle',
          'MusterUnauthorizedError',
        ),
      ),
    ).toBe(false);
  });
});

describe('classifyAgentManagerError on a refused session token', () => {
  it('says the session ended, in plain words, keeping the refusal as its cause', () => {
    const refusal = new MusterUnauthorizedError(
      'Failed user token verification',
      undefined,
      undefined,
      'gazelle',
      'AuthenticationError',
    );

    const error = classifyAgentManagerError(refusal);

    expect(error).toBeInstanceOf(PortalSessionEndedError);
    expect(error.message).toBe(PORTAL_SESSION_ENDED_MESSAGE);
    expect(error.message).not.toMatch(/token verification/);
    expect(error.cause).toBe(refusal);
  });
});
