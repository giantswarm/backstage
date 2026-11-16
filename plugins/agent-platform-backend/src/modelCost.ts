import { LoggerService } from '@backstage/backend-plugin-api';
import { AuthenticationError, NotFoundError } from '@backstage/errors';
import {
  callerEmail,
  modelCostOf,
  modelCostQueries,
  ModelCostResponse,
  needsAttributedCount,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentgatewayGenAiClientCostUsdTotal as Cost } from '@giantswarm/backstage-plugin-gs-common';
import {
  MimirUnavailableError,
  type MimirQueryResponse,
  type MimirService,
} from '@giantswarm/backstage-plugin-gs-node';

/** The part of `MimirService` the cost read needs; a stub in tests. */
export type MimirQuerier = Pick<MimirService, 'query'>;

/** The part of `KagentClient` the cost read needs. */
export type IdentityReader = {
  getMe(options: { userToken?: string }): Promise<unknown>;
};

/**
 * The person's own model cost on one installation over the last `days` days.
 *
 * Answers `unavailable` with a reason, rather than an error, for every
 * outcome the page falls back to the estimate on — kagent or Mimir down, no
 * Mimir here at all — so none of them reaches a 5xx
 * (`MiddlewareFactory.error()` forwards those to Sentry), and the page can say
 * which it was. Only a token kagent or Mimir refused propagates (401): the
 * person can act on that by signing in again.
 */
export async function readModelCost(options: {
  identity: IdentityReader;
  mimir: MimirQuerier | undefined;
  installation: string;
  userToken: string;
  days: number;
  logger: LoggerService;
  now?: () => number;
}): Promise<ModelCostResponse> {
  const { identity, mimir, installation, userToken, days, logger } = options;
  const now = options.now ?? Date.now;
  const unavailable = (
    reason: Extract<ModelCostResponse, { status: 'unavailable' }>['reason'],
  ): ModelCostResponse => ({ status: 'unavailable', windowDays: days, reason });

  // Handled: the page shows the estimate and says why. No user in the
  // message, so one cause stays one line in the logs.
  const handled = (message: string, error: unknown) => {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.info(message, { installation, error: String(error) });
  };

  let claims: unknown;
  try {
    claims = await identity.getMe({ userToken });
  } catch (error) {
    handled('Could not ask kagent who the caller is for the model cost', error);
    return unavailable('identity-unreadable');
  }
  const user = callerEmail(claims);
  if (!user) {
    return unavailable('no-identity');
  }
  if (!mimir) {
    return unavailable('no-mimir');
  }

  const queries = modelCostQueries(Cost.name, user, days);
  const run = (query: string) =>
    mimir.query({
      installationName: installation,
      query,
      oidcToken: userToken,
      // The query names the person; keep it out of the debug log.
      redactQuery: true,
      // Handled below, at `info`: a Mimir outage on the cost read is the page
      // falling back to the estimate, not a warning per query.
      logFailures: false,
    });

  let byAgent: MimirQueryResponse;
  let unattributed: MimirQueryResponse;
  let attributed: MimirQueryResponse | undefined;
  try {
    [byAgent, unattributed] = await Promise.all([
      run(queries.byAgent),
      run(queries.unattributed),
    ]);
    if (needsAttributedCount(byAgent.data?.result ?? [])) {
      attributed = await run(queries.attributed);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      // `mimirEnabled: false`, or no `baseDomain`: no Mimir to ask.
      return unavailable('no-mimir');
    }
    handled('Could not read the model cost from Mimir', error);
    // The page says which it was.
    return unavailable(
      error instanceof MimirUnavailableError &&
        error.reason === 'older_data_unavailable'
        ? 'older-data-unavailable'
        : 'unreadable',
    );
  }

  return modelCostOf(
    {
      byAgent: byAgent.data?.result ?? [],
      unattributed: unattributed.data?.result ?? [],
      attributed: attributed && (attributed.data?.result ?? []),
    },
    { days, evaluatedAt: now() },
  );
}
