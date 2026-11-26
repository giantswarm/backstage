/**
 * Post to Slack: which channel it goes to, what it says, and how Slack's
 * MCP server (muster's `slack` server) answers. Pure functions; the client
 * and the dialog call them.
 */

import { ALL_TEAMS, teamSlugOf, type PrRow, type PrState } from './github';

/** The server muster exposes Slack's MCP server as: tools are `x_slack_<tool>`. */
export const SLACK_SERVER = 'slack';

export const SLACK_TOOLS = {
  sendMessage: 'send_message',
  searchChannels: 'search_channels',
} as const;

export type SlackTool = (typeof SLACK_TOOLS)[keyof typeof SLACK_TOOLS];

export function slackToolName(tool: SlackTool): string {
  return `x_${SLACK_SERVER}_${tool}`;
}

/**
 * The channel the dialog opens with: the channel named after the team the
 * person is looking at (Hive's `Shield 🛡️` → `#team-shield`), else, under
 * "All teams", after their own first team. Empty when there is neither; the
 * person can always type another.
 */
export function defaultChannelOf(
  hiveTeam: string,
  myTeams: readonly string[],
): string {
  if (hiveTeam !== ALL_TEAMS) {
    return `#${teamSlugOf(hiveTeam)}`;
  }
  return myTeams[0] ? `#${myTeams[0]}` : '';
}

/** `#team-shield` or ` team-shield ` → `team-shield`. */
export function channelNameOf(input: string): string {
  return input.trim().replace(/^#/, '').trim();
}

/** A Slack conversation ID, which the send tool takes as it is. */
export function isChannelId(value: string): boolean {
  return /^[CGD][A-Z0-9]{8,}$/.test(value);
}

/** What is wrong with a typed channel, if anything. */
export function channelProblem(input: string): string | undefined {
  const name = channelNameOf(input);
  if (name === '') {
    return 'Name the channel, for example #team-shield, or paste its ID.';
  }
  if (!isChannelId(name) && !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return 'A channel name has lowercase letters, digits, dashes, dots and underscores only.';
  }
  return undefined;
}

const CHANNEL_ID_PATTERN = /\b([CG][A-Z0-9]{8,})\b/g;

/**
 * The ID of the channel named `name` in a `search_channels` answer, which
 * Slack's MCP server words as it likes: JSON with `id` and `name` fields, or
 * text that lists each channel as `#name` or `Name: name` with its ID on the
 * same line. Only
 * the channel's own name counts, never a word of its topic or purpose, so
 * `team-shield` never resolves to a channel that mentions it.
 */
export function channelIdIn(answer: unknown, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const json = parsedJson(answer);
  if (json !== undefined) {
    return findInJson(json, wanted);
  }
  if (typeof answer !== 'string') {
    return undefined;
  }
  // The channel's own name: `#team-shield`, or a name field
  // (`Name: team-shield`, `name="team-shield"`), never a word of its purpose.
  const exact = `${escapeRegExp(wanted)}(?![a-z0-9._-])`;
  const ownName = new RegExp(
    `(^|[^a-z0-9._-])#${exact}|\\bname["']?\\s*[:=]\\s*["']?#?${exact}`,
  );
  for (const line of answer.split('\n')) {
    if (!ownName.test(line.toLowerCase())) {
      continue;
    }
    const ids = [...line.matchAll(CHANNEL_ID_PATTERN)].map(match => match[1]);
    if (ids.length === 1) {
      return ids[0];
    }
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The answer as JSON: an object as it is, a string that parses; else undefined. */
function parsedJson(answer: unknown): unknown {
  if (answer && typeof answer === 'object') {
    return answer;
  }
  if (typeof answer === 'string') {
    try {
      const parsed = JSON.parse(answer);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function findInJson(value: unknown, wanted: string): string | undefined {
  if (typeof value === 'string') {
    try {
      return findInJson(JSON.parse(value), wanted);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInJson(item, wanted);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const id = record.id ?? record.channel_id;
    const name = record.name ?? record.channel_name;
    if (
      typeof id === 'string' &&
      isChannelId(id) &&
      typeof name === 'string' &&
      channelNameOf(name).toLowerCase() === wanted
    ) {
      return id;
    }
    for (const child of Object.values(record)) {
      const found = findInJson(child, wanted);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** Where a message was posted, from `send_message`'s `message_context`. */
export type SlackPost = { channel: string; ts: string; url: string };

/**
 * A `send_message` answer: `message_context` names the channel and the
 * message's ts (as Beekeeper reads it). The link is Slack's own redirect to
 * the message in the reader's workspace.
 */
export function postOf(answer: unknown): SlackPost | undefined {
  let value = answer;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const context = (value as { message_context?: Record<string, unknown> })
    ?.message_context;
  const channel = context?.channel_id;
  const ts = context?.message_ts;
  if (typeof channel !== 'string' || typeof ts !== 'string') {
    return undefined;
  }
  return {
    channel,
    ts,
    url: `https://slack.com/archives/${channel}/p${ts.replace('.', '')}`,
  };
}

function stateWords(state: PrState | undefined): string[] {
  if (!state) {
    return [];
  }
  const ci = {
    passing: 'CI passing',
    failing: 'CI failing',
    running: 'CI running',
    none: 'no CI',
  }[state.ci.state];
  let review = 'no review yet';
  if (state.review.state === 'changes_requested') {
    review = 'changes requested';
  } else if (state.review.state === 'approved') {
    review =
      state.review.approvals > 1
        ? `${state.review.approvals} approvals`
        : 'approved';
  }
  const merge = {
    ready: 'ready to merge',
    conflicts: 'conflicts',
    blocked: 'blocked',
    behind: 'behind its base',
    draft: 'draft',
    checking: '',
  }[state.merge.state];
  return [ci, review, merge].filter(Boolean);
}

/**
 * The message: a short heading and one line per PR, its link, repository and
 * state. Standard markdown, which Slack's MCP server turns into Slack's own.
 * No one is mentioned; the person can add a mention in the preview.
 */
export function slackPostMessage(
  rows: readonly PrRow[],
  states: ReadonlyMap<string, PrState | undefined>,
): string {
  const heading =
    rows.length === 1 ? 'Waiting for a review:' : 'Waiting for reviews:';
  const lines = rows.map(row => {
    const facts = [
      `${row.repo}#${row.number}`,
      ...stateWords(states.get(row.id)),
    ];
    return `- [${row.title.replace(/[[\]]/g, '')}](${row.url}) · ${facts.join(' · ')}`;
  });
  return [heading, ...lines].join('\n');
}
