import { ReactNode } from 'react';
import { makeStyles, Theme } from '@material-ui/core';
import CheckBoxIcon from '@material-ui/icons/CheckBox';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import { Link } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import { ToolAnnotations, ToolSummary } from '../../../apis';
import { hasMarkers, ToolMarkers } from './ToolMarkers';

const useStyles = makeStyles((theme: Theme) => ({
  // The table is one grid, so every row's columns line up without a header to
  // set their widths. Each row re-adopts the grid with `subgrid` rather than
  // `display: contents`, which would strip a row's own box — and with it the
  // hover background, the focus ring and the click target of a selectable row.
  list: {
    display: 'grid',
    gridTemplateColumns: 'var(--tool-table-columns)',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    background: theme.palette.background.paper,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'subgrid',
    gridColumn: '1 / -1',
    // Centred, not baseline-aligned: an icon-only control in the trailing
    // column (the Tool Explorer's favourite star) synthesises its baseline at
    // its bottom edge, so baseline alignment drags every text cell in the row
    // down with it. The description never wraps, so there is no second line
    // for a baseline to serve.
    alignItems: 'center',
    columnGap: theme.spacing(1.5),
    padding: theme.spacing(0.75, 1.5),
    minWidth: 0,
    '&:not(:last-child)': {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    // The focus ring belongs to the row, not to the button inside it: the
    // button is a bare grid item with no box of its own to outline.
    '&:focus-within': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -2,
    },
  },
  rowInteractive: {
    '&:hover': { background: theme.palette.action.hover },
  },
  rowSelected: {
    background: theme.palette.action.selected,
  },
  // Keyboard-highlighted result in a search list, distinct from `selected`:
  // what ↵ would open, not what is already open.
  rowActive: {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
  // The button carries no styling of its own — the row it sits in draws the
  // background, the border and the focus ring.
  trigger: {
    display: 'grid',
    gridTemplateColumns: 'subgrid',
    alignItems: 'center',
    // The row centres its cells, which would size this button to its text and
    // leave dead strips above and below it. A row that selects a tool has to
    // be clickable over its whole height, so the button stretches and centres
    // its own contents instead.
    alignSelf: 'stretch',
    columnGap: theme.spacing(1.5),
    appearance: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    minWidth: 0,
    outline: 'none',
  },
  // Standard type, not monospace: a tool name is read as a name here, not
  // quoted as code. It shares the description's type scale so the two columns
  // sit on one baseline, and is told apart by colour — primary against the
  // description's secondary — rather than by face or size.
  name: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  // Holds the markers and whatever `meta` a caller adds beside them (the Tool
  // Explorer's search score). The gap only materialises between things that
  // are actually there, so a row with markers and no meta is unaffected.
  markerCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 0,
  },
  description: {
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  indicator: {
    flexShrink: 0,
  },
  indicatorSelected: {
    color: theme.palette.primary.main,
  },
  indicatorUnselected: {
    color: theme.palette.text.secondary,
    opacity: 0.5,
  },
  empty: {
    padding: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
}));

/**
 * How a row behaves. A union rather than a bag of optional props, so the
 * combinations that make no sense — a `selected` row with nothing to select
 * it, a checkbox with no toggle — cannot be written.
 */
export type ToolRowMode =
  /** Shown, not operable. */
  | { kind: 'static' }
  /** The name links somewhere; the row itself is not a control. */
  | { kind: 'link'; href: string }
  /** The whole row selects the tool (the Tool Explorer's browse list). */
  | {
      kind: 'action';
      onSelect: () => void;
      /** Currently open. */
      selected?: boolean;
      /** Keyboard-highlighted: what ↵ would open. */
      active?: boolean;
    }
  /** The row is a checkbox or radio (the toolset pickers). */
  | {
      kind: 'select';
      role: 'checkbox' | 'radio';
      checked: boolean;
      onToggle: () => void;
    };

export interface ToolTableItem {
  /** React key, and the row's identity for the caller's selection state. */
  key: string;
  /** Column 1, in standard type. A node so a caller can decorate the name. */
  name: ReactNode;
  /** Column 2. The markers are derived from these; absent means no markers. */
  annotations?: ToolAnnotations;
  /** Column 3. One line, truncated — the full text is the row's tooltip. */
  description?: string;
  mode: ToolRowMode;
  /** Announced name. Defaults to `name` when that is a plain string. */
  ariaLabel?: string;
  /** Extra badges beside the markers, e.g. the Tool Explorer's search score. */
  meta?: ReactNode;
  /**
   * A control at the row's trailing edge, outside the row's own hit area —
   * the Tool Explorer's favourite star. Kept out of the row button because a
   * button cannot nest inside a button.
   */
  trailing?: ReactNode;
}

export interface ToolTableProps {
  items: ToolTableItem[];
  /**
   * The container's semantics: `list` for static and link rows, `group` for
   * checkboxes, `radiogroup` for radios.
   */
  role?: 'list' | 'group' | 'radiogroup';
  ariaLabel: string;
  /** What to say when there is nothing to list. */
  emptyText?: string;
}

/** The `grid-template-columns` this set of items needs. */
function columnTemplate(items: ToolTableItem[]): string {
  const columns: string[] = [];
  if (items.some(item => item.mode.kind === 'select')) {
    columns.push('auto');
  }
  columns.push('minmax(0, max-content)');
  // Most tools carry no annotations. A column reserved for markers no row can
  // fill would leave a gap down the middle of the table, so it only exists
  // when something in this list actually has one.
  if (items.some(item => hasMarkers(item.annotations) || item.meta)) {
    columns.push('max-content');
  }
  columns.push('minmax(0, 1fr)');
  if (items.some(item => item.trailing)) {
    columns.push('auto');
  }
  return columns.join(' ');
}

function SelectIndicator({
  role,
  checked,
}: {
  role: 'checkbox' | 'radio';
  checked: boolean;
}) {
  const classes = useStyles();
  const Selected = role === 'radio' ? CheckCircleIcon : CheckBoxIcon;
  const Unselected =
    role === 'radio' ? RadioButtonUncheckedIcon : CheckBoxOutlineBlankIcon;
  const Icon = checked ? Selected : Unselected;
  return (
    <Icon
      fontSize="small"
      aria-hidden
      className={`${classes.indicator} ${
        checked ? classes.indicatorSelected : classes.indicatorUnselected
      }`}
    />
  );
}

function ToolTableRow({
  item,
  containerRole,
  showIndicator,
  showMarkers,
  showTrailing,
}: {
  item: ToolTableItem;
  containerRole: 'list' | 'group' | 'radiogroup';
  showIndicator: boolean;
  showMarkers: boolean;
  showTrailing: boolean;
}) {
  const classes = useStyles();
  const { mode } = item;
  const ariaLabel =
    item.ariaLabel ?? (typeof item.name === 'string' ? item.name : undefined);

  const selected = mode.kind === 'action' && mode.selected === true;
  const active = mode.kind === 'action' && mode.active === true;
  const interactive = mode.kind === 'action' || mode.kind === 'select';

  // The cells, in column order. Placeholders keep the columns aligned for a
  // row that has nothing to put in one.
  const cells = (
    <>
      {showIndicator &&
        (mode.kind === 'select' ? (
          <SelectIndicator role={mode.role} checked={mode.checked} />
        ) : (
          <span aria-hidden />
        ))}
      <Text as="span" variant="body-small" className={classes.name}>
        {mode.kind === 'link' ? (
          <Link to={mode.href}>{item.name}</Link>
        ) : (
          item.name
        )}
      </Text>
      {showMarkers && (
        <span className={classes.markerCell}>
          <ToolMarkers annotations={item.annotations} />
          {item.meta}
        </span>
      )}
      <Text
        as="span"
        variant="body-small"
        color="secondary"
        className={classes.description}
      >
        {item.description}
      </Text>
    </>
  );

  const rowClassName = [
    classes.row,
    interactive ? classes.rowInteractive : '',
    selected || (mode.kind === 'select' && mode.checked)
      ? classes.rowSelected
      : '',
    active ? classes.rowActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rowClassName}
      // A `role="list"` container needs `listitem` children even when the row
      // holds a button; inside a `group`/`radiogroup` the button itself is the
      // control, so the row around it stays generic.
      role={containerRole === 'list' ? 'listitem' : undefined}
      title={item.description}
    >
      {interactive ? (
        <button
          type="button"
          className={classes.trigger}
          style={{ gridColumn: showTrailing ? '1 / -2' : '1 / -1' }}
          role={mode.kind === 'select' ? mode.role : undefined}
          aria-checked={mode.kind === 'select' ? mode.checked : undefined}
          aria-label={ariaLabel}
          onClick={mode.kind === 'select' ? mode.onToggle : mode.onSelect}
        >
          {cells}
        </button>
      ) : (
        cells
      )}
      {showTrailing && (item.trailing ?? <span aria-hidden />)}
    </div>
  );
}

/**
 * The house list of tools: a borderless table of name, markers and
 * description, without a header row — the columns are self-evident and a
 * header would cost a line on every card that shows a handful of tools.
 *
 * One component behind every surface that lists tools, so the Tool Explorer,
 * an agent's resolved toolset and the toolset pickers cannot drift apart. What
 * changes between them is the row's {@link ToolRowMode} — shown, linked,
 * selectable, or checkable — not its typography.
 *
 * Presentational by design: it renders exactly the `items` it is given, in the
 * order given. Grouping, searching and paging belong to the caller, which
 * knows how its catalogue is shaped; a long list is a `ShowMore` (or an
 * accordion) wrapped around this, not a prop on it.
 */
export function ToolTable({
  items,
  role = 'list',
  ariaLabel,
  emptyText,
}: ToolTableProps) {
  const classes = useStyles();

  if (items.length === 0) {
    return (
      <Text
        as="p"
        variant="body-small"
        color="secondary"
        className={classes.empty}
      >
        {emptyText ?? 'No tools.'}
      </Text>
    );
  }

  const showIndicator = items.some(item => item.mode.kind === 'select');
  const showMarkers = items.some(
    item => hasMarkers(item.annotations) || item.meta,
  );
  const showTrailing = items.some(item => item.trailing);

  return (
    <div
      className={classes.list}
      style={
        {
          '--tool-table-columns': columnTemplate(items),
        } as React.CSSProperties
      }
      role={role}
      aria-label={ariaLabel}
    >
      {items.map(item => (
        <ToolTableRow
          key={item.key}
          item={item}
          containerRole={role}
          showIndicator={showIndicator}
          showMarkers={showMarkers}
          showTrailing={showTrailing}
        />
      ))}
    </div>
  );
}

/**
 * A {@link ToolTableItem} from a muster {@link ToolSummary}, so the mapping
 * from the wire type lives in one place. `overrides` carries the parts only
 * the caller knows — the mode, and a display name that is not the tool's own
 * (a workflow shown without its `workflow_` prefix, say).
 *
 * Takes the full `description` in preference to muster's shortened `summary`:
 * the row truncates to its column with an ellipsis and carries the whole text
 * as its tooltip, so handing it an already-shortened string would cut the
 * description twice and leave the tooltip with nothing more to show. `summary`
 * remains the fallback for a tool that reports only that.
 */
export function toolTableItem(
  tool: ToolSummary,
  overrides: Partial<ToolTableItem> & Pick<ToolTableItem, 'mode'>,
): ToolTableItem {
  return {
    key: tool.name,
    name: tool.name,
    annotations: tool.annotations,
    description: tool.description ?? tool.summary,
    ...overrides,
  };
}
