import type { SeenMarkTarget } from '@giantswarm/backstage-plugin-agent-platform';
import type { StatusDotTone } from '@giantswarm/backstage-plugin-ui-react';

/**
 * How a row is marked read. Derived rows (sessions today, the MCP sign-in row
 * later) keep their read state in the person's Seen record. Rows from the
 * upstream notifications store will add their own kind, keeping the upstream
 * read state.
 */
export type InboxRowRead = { kind: 'seenRecord'; target: SeenMarkTarget };

/** An action in a row's ⋯ menu. */
export type InboxRowAction = {
  id: string;
  label: string;
  onAction: () => void;
};

/**
 * One row of the Notification inbox, whatever produced it. A row source turns
 * what it reads into these; the overlay, the badge, the title count, the
 * toasts and desktop notifications only ever see this shape, so a further
 * source (the MCP sign-in row, the upstream notifications store) adds rows
 * without reshaping any of them.
 */
export type InboxRow = {
  /**
   * The row's identity: a React key, the desktop notification's `tag`, what
   * a tab remembers it announced. A changed id is a new row.
   */
  id: string;
  /** When it happened (ms since the epoch); rows sort newest first. */
  at?: number;
  /** Not yet seen by the person, on any tab or device. */
  unread: boolean;
  /** What happened, naming who: "SRE Agent needs your input". */
  title: string;
  /** What it is about: the session's name. */
  context?: string;
  /** A short addition after the age, such as a failure's reason class. */
  detail?: string;
  /** The state chip. */
  state?: { label: string; tone: StatusDotTone };
  /** The agent's Avatar, by Display name. */
  avatar?: { name: string; src?: string };
  /** Where clicking the row goes (absolute). */
  href?: string;
  /** How a toast or a desktop notification says it. */
  announce: {
    title: string;
    description?: string;
    status: 'warning' | 'danger' | 'success' | 'info';
    linkLabel: string;
  };
  /**
   * The row is a session waiting for the person: a burst of these opens the
   * Sessions list on its Waiting filter.
   */
  waiting: boolean;
  read: InboxRowRead;
  /** The row's ⋯ menu. */
  actions?: InboxRowAction[];
};

/** What one row source contributes. */
export type InboxRowSource = {
  rows: InboxRow[];
  /**
   * The source has read once, and the Seen record is known: the rows now are
   * the tab's first read of it. Until then nothing is announced.
   */
  ready: boolean;
};
