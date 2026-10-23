import { useId } from 'react';
import { FieldLabel, ToggleButton, ToggleButtonGroup } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

// The shell's field box (agent-shell.css), so the control reads as a sibling
// of the Environment select beside it; bui's own field tokens elsewhere.
const FIELD_BG = 'var(--agent-shell-input-bg, var(--bui-bg-neutral-1))';
const FIELD_EDGE = 'var(--agent-shell-input-border, var(--bui-border-2))';
const FIELD_RADIUS = 'var(--agent-shell-input-radius, var(--bui-radius-3))';
// The selected window: a light fill with an edge and text in the shell's link
// colour. The edge carries the state on its own (6.6:1 against the white
// box), so the fill is never the only cue.
const SELECTED_FG = 'var(--agent-shell-link, var(--bui-fg-primary))';
const SELECTED_BG = 'var(--bui-bg-neutral-2)';

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    flexDirection: 'column',
  },
  row: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    fontFamily: 'var(--bui-font-regular)',
    fontSize: 'var(--bui-font-size-3)',
    color: 'var(--bui-fg-primary)',
    whiteSpace: 'nowrap',
  },
  // Unlayered, so these win over bui's `components` layer: the group drops
  // bui's dividers and solid selection for a track inside the field box.
  group: {
    padding: 2,
    gap: 2,
    borderRadius: FIELD_RADIUS,
    backgroundColor: FIELD_BG,
    boxShadow: `inset 0 0 0 1px ${FIELD_EDGE}`,
    overflow: 'visible',
    '& > .bui-ToggleButton': {
      // 32px in all, the height of the select's box beside it.
      height: 28,
      minWidth: 44,
      border: 0,
      borderRadius: 8,
      background: 'transparent',
      color: 'var(--bui-fg-primary)',
      fontSize: 'var(--bui-font-size-3)',
      fontWeight: 'var(--bui-font-weight-regular)',
      fontVariantNumeric: 'tabular-nums',
    },
    '& > .bui-ToggleButton + .bui-ToggleButton': {
      borderLeft: 0,
    },
    '& > .bui-ToggleButton:not([data-selected])[data-hovered]': {
      background: 'var(--bui-bg-neutral-2)',
    },
    '& > .bui-ToggleButton[data-selected], & > .bui-ToggleButton[data-pressed]':
      {
        background: SELECTED_BG,
        color: SELECTED_FG,
        boxShadow: `inset 0 0 0 1px ${SELECTED_FG}`,
        fontWeight: 'var(--bui-font-weight-bold)',
      },
    '& > .bui-ToggleButton[data-focus-visible]': {
      boxShadow: 'inset 0 0 0 2px var(--bui-ring)',
    },
    '& > .bui-ToggleButton[data-disabled]': {
      background: 'transparent',
      color: 'var(--bui-fg-disabled)',
    },
    // A deep link can select a window that is not on offer; it stays marked,
    // greyed.
    '& > .bui-ToggleButton[data-disabled][data-selected]': {
      background: 'var(--bui-bg-neutral-2)',
      boxShadow: `inset 0 0 0 1px ${FIELD_EDGE}`,
    },
  },
});

export interface TimeWindowPickerProps<T extends number> {
  /** The windows on offer, in whole days, shortest first. */
  options: readonly T[];
  /** The selected window. */
  value: T;
  onChange: (days: T) => void;
  /** The label above the control, and the group's accessible name. */
  label?: string;
  /**
   * Why a window cannot be chosen, or `undefined` when it can. A window with
   * a reason is disabled and shows the reason as its native tooltip.
   */
  unavailableReason?: (days: T) => string | undefined;
}

/**
 * A choice of time window phrased once: "Last [7 | 30 | 90] days", where only
 * the number is picked. It is a single-selection radio group named by its
 * label, each option named in full ("Last 7 days"), and it sits in a
 * labelled field box of the same height as a bui `Select`, so it lines up
 * with the selects beside it in a header or filter row.
 */
export function TimeWindowPicker<T extends number>({
  options,
  value,
  onChange,
  label = 'Time range',
  unavailableReason,
}: TimeWindowPickerProps<T>) {
  const classes = useStyles();
  const labelId = useId();

  return (
    <div className={classes.root}>
      <FieldLabel label={label} id={labelId} />
      <div className={classes.row}>
        {/* The words are said once by each option's own name. */}
        <span aria-hidden="true">Last</span>
        <ToggleButtonGroup
          className={classes.group}
          aria-labelledby={labelId}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[String(value)]}
          onSelectionChange={keys => {
            const next = Number([...keys][0]);
            const option = options.find(o => o === next);
            if (option !== undefined) {
              onChange(option);
            }
          }}
        >
          {options.map(option => {
            const reason = unavailableReason?.(option);
            return (
              <ToggleButton
                key={option}
                id={String(option)}
                size="small"
                aria-label={`Last ${option} days`}
                isDisabled={reason !== undefined}
                // Native tooltip: the only affordance a disabled button still
                // offers, and the reason has to live on the thing that is
                // grey. Set on the DOM node because react-aria strips `title`
                // from props (it is not in its DOM-prop allowlist), and a
                // wrapper element would break the group's direct-child CSS.
                ref={node => {
                  if (!node) {
                    return;
                  }
                  if (reason !== undefined) {
                    node.setAttribute('title', reason);
                  } else {
                    node.removeAttribute('title');
                  }
                }}
              >
                {option}
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
        <span aria-hidden="true">days</span>
      </div>
    </div>
  );
}
