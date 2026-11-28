// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';
import { fixtureScenarioOfPage } from '@giantswarm/backstage-plugin-gs-common';

import {
  GITHUB_SERVER,
  GITHUB_TOOLS,
  SEARCH_PAGE_SIZE,
  type CheckRunsAnswer,
  type CombinedStatusAnswer,
  type PullAnswer,
  type Review,
  type SearchAnswer,
} from '../../lib/github';
import { SLACK_SERVER, SLACK_TOOLS } from '../../lib/slack';
import {
  BASE_PRS,
  ciOf,
  longNamePrs,
  manyPrs,
  reviewsOf,
  searchItemOf,
  type FixtureList,
  type FixturePr,
} from './githubFixtureData';

/** Hive's "Up" team answers GitHub's rate refusal, for the rate-limited state. */
export const RATE_LIMITED_TEAM = 'team-up';

function prsOfScenario(): FixturePr[] {
  switch (fixtureScenarioOfPage()) {
    case 'empty':
      return [];
    case 'many':
      return manyPrs();
    case 'long-names':
      return longNamePrs();
    default:
      return BASE_PRS;
  }
}

/** The list a search reads, from the qualifier the section puts first. */
function listOf(query: string): FixtureList | undefined {
  const team = query.match(/team-review-requested:[^/\s]+\/(\S+)/);
  if (team) {
    return `team:${team[1]}`;
  }
  if (query.includes('user-review-requested:@me')) {
    return 'direct';
  }
  if (query.includes('review-requested:@me')) {
    return 'waiting';
  }
  if (query.includes('reviewed-by:@me')) {
    return 'reviewed';
  }
  if (/(^|\s)author:@me/.test(query)) {
    return 'mine';
  }
  return undefined;
}

function excludedAuthors(query: string): Set<string> {
  const excluded = new Set<string>();
  for (const match of query.matchAll(/-author:(\S+)/g)) {
    const author = match[1];
    excluded.add(
      author.startsWith('app/') ? `${author.slice(4)}[bot]` : author,
    );
  }
  return excluded;
}

export function searchFixture(query: string, prs: FixturePr[]): SearchAnswer {
  const list = listOf(query);
  if (list === `team:${RATE_LIMITED_TEAM}`) {
    throw new Error(
      'failed to search pull requests: GET https://api.github.com/search/issues: 403 API rate limit of 30 still exceeded, not making remote request. [rate reset in 42s]',
    );
  }
  const excluded = excludedAuthors(query);
  const matching = prs
    .filter(pr => list !== undefined && pr.lists.includes(list))
    .filter(pr => !(query.includes('draft:false') && pr.draft))
    .filter(pr => !excluded.has(pr.author))
    .filter(pr => !(list === 'reviewed' && pr.author === 'guest'))
    .sort((a, b) => b.age - a.age);
  return {
    total_count: matching.length,
    incomplete_results: false,
    items: matching.slice(0, SEARCH_PAGE_SIZE).map(pr => searchItemOf(pr)),
  };
}

export function pullReadFixture(
  args: Record<string, unknown>,
  prs: FixturePr[],
): PullAnswer | CheckRunsAnswer | CombinedStatusAnswer | Review[] {
  const pr = prs.find(
    candidate =>
      candidate.repo === args.repo && candidate.number === args.pullNumber,
  );
  if (!pr) {
    throw new Error(
      `failed to get pull request: GET https://api.github.com/repos/${String(args.owner)}/${String(args.repo)}/pulls/${String(args.pullNumber)}: 404 Not Found []`,
    );
  }
  const { checkRuns, statuses } = ciOf(pr);
  switch (args.method) {
    case 'get':
      return {
        number: pr.number,
        draft: Boolean(pr.draft),
        mergeable_state: pr.merge,
        head: { sha: `${pr.number}`.padEnd(40, 'a') },
      };
    case 'get_check_runs':
      return { total_count: checkRuns.length, check_runs: checkRuns };
    case 'get_status':
      return {
        state: statuses.some(status => status.state === 'failure')
          ? 'failure'
          : 'success',
        total_count: statuses.length,
        statuses,
      };
    case 'get_reviews':
      return reviewsOf(pr);
    default:
      throw new Error(`fixture mode answers no method ${String(args.method)}`);
  }
}

/** GitHub's hosted MCP server as muster exposes it (`x_github_<tool>`). */
export const githubFixtureServer: FixtureMcpServer = {
  server: GITHUB_SERVER,
  tools: {
    [GITHUB_TOOLS.searchPullRequests]: args =>
      searchFixture(String(args.query ?? ''), prsOfScenario()),
    [GITHUB_TOOLS.pullRequestRead]: args =>
      pullReadFixture(args, prsOfScenario()),
  },
};

/** The channels the fixture Slack knows, by name. */
export const FIXTURE_SLACK_CHANNELS: Record<string, string> = {
  'team-bumblebee': 'C0FIXBUMBLE',
  'team-shield': 'C0FIXSHIELD',
  'team-shield-alerts': 'C0FIXALERTS',
  'standup-shield': 'C0FIXSTANDUP',
};

/**
 * Slack's hosted MCP server as muster exposes it (`x_slack_<tool>`): a
 * channel search that answers the channels whose name holds the query, and
 * a send that answers where the message landed, as Slack's does
 * (`message_context`). A channel it does not know is refused in Slack's
 * words.
 */
export const slackFixtureServer: FixtureMcpServer = {
  server: SLACK_SERVER,
  tools: {
    [SLACK_TOOLS.searchChannels]: args => {
      const query = String(args.query ?? '').toLowerCase();
      return {
        channels: Object.entries(FIXTURE_SLACK_CHANNELS)
          .filter(([name]) => name.includes(query))
          .map(([name, id]) => ({ id, name })),
      };
    },
    [SLACK_TOOLS.sendMessage]: args => {
      const channel = String(args.channel_id ?? '');
      if (!Object.values(FIXTURE_SLACK_CHANNELS).includes(channel)) {
        throw new Error(
          `failed to send message: channel_not_found (${channel})`,
        );
      }
      return {
        message_context: {
          channel_id: channel,
          message_ts: `${Math.floor(Date.now() / 1000)}.000100`,
        },
      };
    },
  },
};

export const reviewQueueFixtureMcpServers: FixtureMcpServer[] = [
  githubFixtureServer,
  slackFixtureServer,
];
