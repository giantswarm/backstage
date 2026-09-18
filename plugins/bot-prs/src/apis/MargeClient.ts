import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import {
  classifyMargeError,
  isTeamQueues,
  MARGE_TOOLS,
  margeToolName,
  type MargeMarkResult,
  type MargeResult,
  type MargeTeamQueues,
  type MargeTool,
} from '../lib/marge';

export type MargeSweepArgs = {
  team: string;
  /** Narrow the run to these PRs (`OWNER/REPO#NUMBER` or URLs). */
  prs?: string[];
  /** Comma-separated sweep steps; every step when omitted. */
  actions?: string;
  dry_run?: boolean;
};

export type MargeRemedyArgs = {
  pr_url: string;
  team: string;
  dry_run?: boolean;
};

export type MargeMarkArgs = {
  pr_url: string;
  outcome: 'failed' | 'blocked';
  reason?: string;
  tool: string;
  dry_run?: boolean;
};

/**
 * marge's tools on one installation, called as the signed-in person.
 *
 * The seam is the muster plugin's own client, exactly as for agent-manager:
 * `musterApi.callTool()` sends the person's token for the installation's
 * muster and muster runs the tool with the person's own GitHub grant for
 * marge, so a merge, a comment or a marker names the person, not the sweep
 * App. No marge URL, no REST client: the portal knows marge only as
 * `x_marge_<tool>` in muster.
 */
export class MargeClient {
  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
  ) {}

  private async call<T>(
    tool: MargeTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        margeToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      throw classifyMargeError(error);
    }
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        throw new Error(`marge's ${tool} answered text, not JSON: ${result}`);
      }
    }
    return result as T;
  }

  /**
   * The team's open bot PRs. Without `refresh` this is the stored read: one
   * search, the classification the last sweep left in each PR's label. With
   * it the engine classifies every PR again, a check read per PR.
   */
  list(team: string, refresh: boolean): Promise<MargeResult> {
    return this.call<MargeResult>(MARGE_TOOLS.list, { team, refresh });
  }

  /**
   * The queues of several teams in one call. The teams share one discovery
   * in the engine, so this is one listing of the repositories they own
   * between them rather than one listing per team.
   *
   * A marge that does not take `teams` ignores it and answers the query
   * scope, which is every bot PR the person can see. That answer carries no
   * team, so it is refused here rather than rendered as the teams asked for.
   */
  async listTeams(teams: string[], refresh: boolean): Promise<MargeTeamQueues> {
    const answer = await this.call<unknown>(MARGE_TOOLS.list, {
      teams,
      refresh,
    });
    if (!isTeamQueues(answer)) {
      throw new Error(
        'this installation runs a marge that reads one team a call; update it to read every team at once',
      );
    }
    return answer;
  }

  /** The sweep, whole team or narrowed; `dry_run` is the preview. */
  sweep(args: MargeSweepArgs): Promise<MargeResult> {
    return this.call<MargeResult>(MARGE_TOOLS.sweep, { ...args });
  }

  /** The catalogue rule that matches one PR, applied through its own guards. */
  remedy(args: MargeRemedyArgs): Promise<MargeResult> {
    return this.call<MargeResult>(MARGE_TOOLS.remedy, { ...args });
  }

  /** An ai-rescue marker on one PR, as the person. */
  mark(args: MargeMarkArgs): Promise<MargeMarkResult> {
    return this.call<MargeMarkResult>(MARGE_TOOLS.mark, { ...args });
  }
}
