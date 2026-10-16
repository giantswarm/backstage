import type { SeenMarkTarget } from '@giantswarm/backstage-plugin-agent-platform';
import type { StatusDotTone } from '@giantswarm/backstage-plugin-ui-react';

/** An action in a row's ⋯ menu. */
export type InboxRowAction = {
  id: string;
  label: string;
  onAction: () => void;
};

/**
 * One row of the Notification inbox. The overlay, the badge, the title count,
 * the toasts and desktop notifications only ever see this shape, so a later
 * producer adds rows of its own without reshaping any of them.
 */
export type InboxRow = {
  /**
   * The row's identity: a React key, the desktop notification's `tag`, what
   * a tab remembers it announced. A changed id is a new row.
   */
  id: string;
  /**
   * What the row is about, such as one session; a subject has one row at a
   * time. A subject whose state the tab had already read is being watched, so
   * a new row of it is news whatever the clocks say.
   */
  subject: string;
  /** What happened, for analytics: the kind of row the person opened. */
  kind: 'waiting' | 'failed' | 'turnFinished' | 'mcpSignIn';
  /** When it happened (ms since the epoch); rows sort newest first. */
  at?: number;
  /**
   * Stands above the rows that sort by time: a condition that holds with no
   * time to tell, such as MCP servers waiting for a sign-in.
   */
  pinned?: boolean;
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
  /** An icon in the Avatar's place, for a row about no agent. */
  icon?: 'signIn';
  /** Where clicking the row goes (absolute). */
  href?: string;
  /**
   * The row's own button, such as the MCP sign-in row's Sign in, for a row
   * that acts in place instead of opening a page: pressing it opens the row.
   */
  action?: {
    label: string;
    /** The button's name for assistive technology; begins with `label`. */
    accessibleLabel?: string;
    onAction: () => void;
  };
  /** How a toast or a desktop notification says it. */
  announce: {
    title: string;
    description?: string;
    status: 'warning' | 'danger' | 'success' | 'info';
    linkLabel: string;
    /**
     * Where the link goes, when not to `href`: a hash link acts where the
     * person is (`#mcp-sign-in` opens the sign-in dialog).
     */
    href?: string;
  };
  /** The row's entry in the person's Seen record. */
  seenMark: SeenMarkTarget;
  /** The row's ⋯ menu. */
  actions?: InboxRowAction[];
  /**
   * Whether this row only narrows a row of the same subject the tab already
   * read (by that row's id): the MCP sign-in row once fewer servers wait.
   * Such a row is no news, though its id is new.
   */
  narrows?: (previousId: string) => boolean;
};

/** What a source of rows (the sessions, the MCP sign-in) gives the inbox. */
export type InboxRowSource = {
  rows: InboxRow[];
  /**
   * Every subject whose state this read has, row or not: what the tab is
   * watching.
   */
  subjects: ReadonlySet<string>;
  /**
   * The source has read once, everywhere it reads, and the Seen record is
   * known: the rows now are the tab's first read. Until then nothing is
   * announced.
   */
  ready: boolean;
};
