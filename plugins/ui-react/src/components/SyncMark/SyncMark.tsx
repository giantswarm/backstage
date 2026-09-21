import { ComponentType, CSSProperties } from 'react';
import Tooltip from '@material-ui/core/Tooltip';
import { SvgIconProps } from '@material-ui/core/SvgIcon';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import SyncIcon from '@material-ui/icons/Sync';
import SyncProblemIcon from '@material-ui/icons/SyncProblem';
import { Skeleton } from '@backstage/ui';
import { intentColor, StatusLabelIntent } from '../StatusLabel/StatusLabel';

/**
 * What one glance at a fleet table says about something a manager keeps to a
 * definition -- a capability on an installation, a repository's set-up: the
 * manager's own states folded into the four a person scanning the list asks
 * about, plus the two that need a look. The same six marks, glyphs and
 * colours on every page, so the icons need learning once.
 */
export type SyncMark =
  /** Present, and the manager's last check verified it as defined. */
  | 'in sync'
  /** Present, and the last check found it off its definition. */
  | 'not in sync'
  /**
   * Present or under way, and the manager has not reconciled it yet: a run
   * still in flight, or nothing has checked it since it was defined.
   */
  | 'not reconciled'
  /** Not defined for it: nothing installs or sets it up. */
  | 'not installed'
  /** The last run or check failed. */
  | 'failed'
  /** Not readable: the manager cannot say. */
  | 'unknown';

/** The marks in legend order: the good state first, the ones needing a look last. */
export const SYNC_MARKS: readonly SyncMark[] = [
  'in sync',
  'not in sync',
  'not reconciled',
  'not installed',
  'failed',
  'unknown',
];

/**
 * The glyph and the intent of each mark. Every glyph has its own silhouette
 * -- check, sync with a bang, sync, empty circle, bang, question mark -- so
 * the mark survives greyscale and colour blindness; the colour is the
 * intent's bui token, so it themes with the rest of the app.
 */
const MARK_ICON: Record<
  SyncMark,
  { icon: ComponentType<SvgIconProps>; intent: StatusLabelIntent }
> = {
  'in sync': { icon: CheckCircleIcon, intent: 'positive' },
  'not in sync': { icon: SyncProblemIcon, intent: 'warning' },
  'not reconciled': { icon: SyncIcon, intent: 'info' },
  'not installed': { icon: RadioButtonUncheckedIcon, intent: 'neutral' },
  failed: { icon: ErrorIcon, intent: 'negative' },
  unknown: { icon: HelpOutlineIcon, intent: 'neutral' },
};

/** The side of a mark's square: the `small` SvgIcon, 1.25rem at the app's 16px root. */
const MARK_SIZE = 20;

/**
 * The one box a mark and its placeholder share: one icon wide and one line
 * of the cell's text tall (`1lh`), laid out as a block so it adds no line box
 * of its own. The glyph is centred in it and overhangs the line into the
 * cell's padding, so a table row is as tall with the skeleton as with the
 * icon, and as with text alone.
 */
const MARK_BOX: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: MARK_SIZE,
  height: '1lh',
};

/**
 * The legend of the marks for a column header's tooltip: each mark with the
 * page's gloss of it, in {@link SYNC_MARKS} order, joined with middle dots.
 */
export function syncMarkLegend(gloss: Record<SyncMark, string>): string {
  return SYNC_MARKS.map(mark => `${mark}: ${gloss[mark]}`).join(' · ');
}

export type SyncMarkIconProps = {
  mark: SyncMark;
  /**
   * The tooltip and the accessible name: the manager's state in its own words
   * with the page's gloss, e.g. `enabled · installed, as defined`.
   */
  label: string;
  /** The manager's state, exposed as `data-state` for tests and styling. */
  state?: string;
  testId?: string;
};

/**
 * A mark as one icon in a table cell: the glyph and the colour carry the
 * mark, the tooltip and the accessible name carry the words. The cell has no
 * text of its own, so a column of them scans as a row of lights; the
 * `data-mark` attribute names the mark for tests.
 */
export function SyncMarkIcon({
  mark,
  label,
  state,
  testId,
}: SyncMarkIconProps) {
  const { icon: Icon, intent } = MARK_ICON[mark];
  return (
    <Tooltip title={label} placement="top" arrow>
      <span
        role="img"
        aria-label={label}
        data-testid={testId}
        data-state={state}
        data-mark={mark}
        style={{ ...MARK_BOX, color: intentColor(intent) }}
      >
        <Icon fontSize="small" color="inherit" />
      </span>
    </Tooltip>
  );
}

/**
 * A mark's place while the manager has not answered yet: a skeleton in the
 * mark's own box, so the cell and its row keep their size when the icon
 * takes over. `aria-busy` says the cell is loading; it has no mark and no
 * state of its own.
 */
export function SyncMarkSkeleton({ testId }: { testId?: string }) {
  return (
    <span aria-busy="true" data-testid={testId} style={MARK_BOX}>
      <Skeleton width={MARK_SIZE} height={MARK_SIZE} />
    </span>
  );
}
