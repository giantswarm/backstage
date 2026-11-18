/**
 * Sentry fingerprints on the message, so a log line that carries a plugin id,
 * an entity ref or a URL in its *message* turns a single fault into one issue
 * per value. Our own code keeps those values in structured metadata instead
 * (see the logging conventions in CLAUDE.md), but upstream Backstage log lines
 * we cannot change do not, so we collapse them here on the way out.
 */

export type SentryEvent = {
  message?: string | { message?: string; formatted?: string };
  exception?: { values?: Array<{ value?: string }> };
  fingerprint?: string[];
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

const KUBERNETES_PROXY_ERROR = 'Kubernetes proxy error: cluster request error';

/**
 * Rewrites for known upstream messages, applied to the start of the message.
 * The value that fans the issue out is dropped; it stays available in the
 * event's extra data.
 */
const MESSAGE_REWRITES: Array<[RegExp, string]> = [
  // @backstage/backend-defaults DatabaseManager: one issue per plugin id, for
  // what is always a single database outage.
  [
    /^Database keepalive failed for plugin [^,]+,/,
    'Database keepalive failed,',
  ],
  // @backstage/plugin-catalog-backend DefaultCatalogProcessingEngine: one
  // issue per catalog entity.
  [/^Processing of \S+ failed/, 'Processing of an entity failed'],
  // @backstage/plugin-kubernetes-backend KubernetesProxy: one issue per
  // cluster, for a cause (refused, timed out) that is the same on each. The
  // cluster is in extra data and a tag. The cause can name the cluster too:
  // the host it could not resolve or reach (and whatever Node appends after
  // it, such as ` - Local (<address>)`), or the names on its certificate.
  // See giantswarm/giantswarm#39002.
  [
    /^Kubernetes proxy error Cluster '[^']*' request error/,
    KUBERNETES_PROXY_ERROR,
  ],
  [
    new RegExp(
      `^(${KUBERNETES_PROXY_ERROR}; caused by Error: (?:connect|getaddrinfo) \\w+) \\S+.*$`,
    ),
    '$1 <host>',
  ],
  [
    new RegExp(
      `^(${KUBERNETES_PROXY_ERROR}; caused by .*does not match certificate's altnames):.*`,
    ),
    '$1',
  ],
];

/**
 * Metadata that is also set as a Sentry tag, so that an issue shows how its
 * events spread over the values and can be searched and alerted on by them.
 * Sentry does not index extra data.
 */
const TAGGED_EXTRA = ['cluster', 'installation', 'tool', 'server'];

/**
 * gs-node's `MusterToolError`, a tool error muster answered. Its extra data
 * names the `tool`, the MCP `server` and the `installation`, and the `kind` of
 * failure where it is a known one (a timeout, a missing tool, ...).
 */
const MUSTER_TOOL_ERROR = 'MusterToolError';

/**
 * Quoted values in a tool's message: names of workflows, agents, Secrets,
 * servers. One fault, such as muster refusing a label value, names a
 * different one each time. muster quotes names in single quotes too (`MCP
 * server 'jira'`); such a quote follows no letter or digit, which tells it
 * from an apostrophe (`the server's timeout`).
 */
const QUOTED_VALUES: Array<[RegExp, string]> = [
  [/"[^"]*"/g, '"<value>"'],
  [/(^|[^\p{L}\p{N}])'[^']*'/gu, "$1'<value>'"],
];

/**
 * The kinds of failure that belong to a whole MCP server rather than to one of
 * its tools: a server that is slow, gone or not in this muster fails every
 * tool of it, so they are one issue per server, with the tool as a tag.
 */
const SERVER_KINDS = new Set([
  'timeout',
  'client_not_connected',
  'tool_not_found',
  'no_backend',
]);

/**
 * A tool's name without what varies per customer or per workflow: an
 * Organization's namespace in front of its servers' tools
 * (`x_org-<name>_github_…`), and a workflow's own name (`workflow_<name>`).
 */
function toolGroupOf(tool: string): string {
  return tool
    .replace(/^x_org-[^_]+_/, 'x_<org>_')
    .replace(/^workflow_.+$/, 'workflow_<name>');
}

/**
 * Tokens that differ per occurrence but not per fault. Order matters: URLs are
 * replaced first so that addresses and hashes inside them are not matched on
 * their own.
 */
const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/https?:\/\/[^\s,)]+/g, '<url>'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<address>'],
  [/\b[0-9a-f]{12,}\b/g, '<hash>'],
];

function normalizeMessage(message: string): string {
  let result = message;
  for (const [pattern, replacement] of MESSAGE_REWRITES) {
    result = result.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of PLACEHOLDERS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function readEventMessage(event: SentryEvent): string | undefined {
  if (typeof event.message === 'string') {
    return event.message;
  }
  if (event.message) {
    return event.message.formatted ?? event.message.message;
  }
  return event.exception?.values?.[0]?.value;
}

function writeEventMessage(event: SentryEvent, message: string): void {
  if (typeof event.message === 'string') {
    event.message = message;
    return;
  }
  if (event.message) {
    if (event.message.formatted !== undefined) {
      event.message.formatted = message;
    }
    if (event.message.message !== undefined) {
      event.message.message = message;
    }
    return;
  }
  const exception = event.exception?.values?.[0];
  if (exception) {
    exception.value = message;
  }
}

function isMusterToolError(event: SentryEvent): boolean {
  return event.extra?.name === MUSTER_TOOL_ERROR;
}

/**
 * One issue per kind of failure and tool, whatever route the call came
 * through: `['MusterToolError', <kind>, <tool>]`, the tool without its
 * Organization or workflow name ({@link toolGroupOf}). A kind that belongs to
 * a whole server ({@link SERVER_KINDS}) is grouped by the server instead,
 * or by the message where the tool names no server (a meta-tool's target that
 * muster does not have). Without a known `kind`, the message stands in for
 * it, with its quoted values replaced.
 */
function musterToolErrorFingerprint(
  event: SentryEvent,
  normalizedMessage: string,
): string[] {
  const { kind, tool, server } = event.extra ?? {};
  if (typeof kind === 'string' && SERVER_KINDS.has(kind)) {
    return [
      MUSTER_TOOL_ERROR,
      kind,
      typeof server === 'string' && server !== '' ? server : normalizedMessage,
    ];
  }
  return [
    MUSTER_TOOL_ERROR,
    typeof kind === 'string' ? kind : normalizedMessage,
    typeof tool === 'string' ? toolGroupOf(tool) : '',
  ];
}

/**
 * Collapses high-cardinality Sentry messages onto a stable fingerprint.
 *
 * Events whose message needs no rewriting keep their message and grouping;
 * they only gain the tags from `TAGGED_EXTRA`. A muster tool error is grouped
 * by its kind and its tool or server ({@link musterToolErrorFingerprint}).
 */
export function normalizeSentryEvent<T extends SentryEvent>(event: T): T {
  for (const key of TAGGED_EXTRA) {
    const value = event.extra?.[key];
    if (typeof value === 'string') {
      event.tags = { ...event.tags, [key]: value };
    }
  }

  const original = readEventMessage(event);
  if (!original) {
    return event;
  }

  const musterToolError = isMusterToolError(event);
  let normalized = normalizeMessage(original);
  if (musterToolError) {
    for (const [pattern, replacement] of QUOTED_VALUES) {
      normalized = normalized.replace(pattern, replacement);
    }
  }

  if (normalized !== original) {
    writeEventMessage(event, normalized);
    event.fingerprint = [normalized];
    event.extra = { ...event.extra, original_message: original };
  }
  if (musterToolError) {
    event.fingerprint = musterToolErrorFingerprint(event, normalized);
  }
  return event;
}
