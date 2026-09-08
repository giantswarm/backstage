/**
 * Rows of a fleet-wide list, grouped by installation for the Agent Platform's
 * "All installations" view: the home installation first, the others in the
 * order the inventory lists them, each group with a status of its own. A
 * single-installation portal and a pinned scope never group -- see
 * `useGroupedByInstallation`.
 */

export type InstallationGroupStatus =
  /** Queried, no answer yet (or not queried yet: waiting for the home). */
  | 'loading'
  /** Answered with rows. */
  | 'ready'
  /** Answered with nothing. */
  | 'empty'
  /** Queried and could not be read (a real failure, not "no component"). */
  | 'unreachable'
  /** Never queried: the backend says the endpoint is not reachable from here. */
  | 'not-reachable';

export type InstallationGroup<Row> = {
  installation: string;
  home: boolean;
  pipeline?: string;
  rows: Row[];
  status: InstallationGroupStatus;
};

export type GroupRowsOptions = {
  /** The installations to show, in display order (home first). */
  installations: readonly string[];
  home?: string;
  /** Installations without a first answer yet. */
  pending?: readonly string[];
  /** Installations that were queried and could not be read. */
  unreachable?: readonly string[];
  /** Installations the backend reports as not reachable from this portal. */
  notReachable?: readonly string[];
  pipelineFor?: (installation: string) => string | undefined;
};

/**
 * Groups `rows` by installation, in the order of `options.installations`.
 * Rows of an installation that is not listed still get a group (appended,
 * alphabetically), so nothing is ever dropped from the page.
 */
export function groupRowsByInstallation<Row extends { installation: string }>(
  rows: readonly Row[],
  options: GroupRowsOptions,
): InstallationGroup<Row>[] {
  const byInstallation = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byInstallation.get(row.installation);
    if (list) {
      list.push(row);
    } else {
      byInstallation.set(row.installation, [row]);
    }
  }

  const listed = new Set(options.installations);
  const extras = [...byInstallation.keys()]
    .filter(installation => !listed.has(installation))
    .sort((a, b) => a.localeCompare(b));

  const pending = new Set(options.pending ?? []);
  const unreachable = new Set(options.unreachable ?? []);
  const notReachable = new Set(options.notReachable ?? []);

  return [...options.installations, ...extras].map(installation => {
    const groupRows = byInstallation.get(installation) ?? [];
    let status: InstallationGroupStatus;
    if (notReachable.has(installation)) {
      status = 'not-reachable';
    } else if (unreachable.has(installation)) {
      status = 'unreachable';
    } else if (groupRows.length > 0) {
      status = 'ready';
    } else if (pending.has(installation)) {
      status = 'loading';
    } else {
      status = 'empty';
    }
    return {
      installation,
      home: installation === options.home,
      pipeline: options.pipelineFor?.(installation),
      rows: groupRows,
      status,
    };
  });
}

/** What the rows are called in a group's status line. */
export type GroupNoun = { one: string; many: string };

export const SESSIONS_NOUN: GroupNoun = { one: 'session', many: 'sessions' };
export const MODELS_NOUN: GroupNoun = { one: 'model', many: 'models' };

/** The status line under a group's name. */
export function describeInstallationGroup(
  group: Pick<InstallationGroup<unknown>, 'rows' | 'status'>,
  noun: GroupNoun,
): string {
  switch (group.status) {
    case 'loading':
      return 'loading…';
    case 'ready':
      return group.rows.length === 1
        ? `1 ${noun.one}`
        : `${group.rows.length} ${noun.many}`;
    case 'empty':
      return `no ${noun.many} here`;
    case 'unreachable':
      return `${noun.many} could not be read`;
    case 'not-reachable':
      return 'not reachable from this portal';
    default:
      return '';
  }
}
