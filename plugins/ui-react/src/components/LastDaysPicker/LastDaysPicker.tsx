import { useId, useRef } from 'react';
import { FieldLabel, ToggleButton, ToggleButtonGroup } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/**
 * Class names on the picker that do not change between builds, for an app
 * stylesheet to restyle it by: the agent-platform shell gives the group its
 * field box (`agent-shell.css`). Renaming one silently drops that styling.
 */
export const LAST_DAYS_PICKER_CLASS_NAMES = {
  root: 'ui-react-last-days-picker',
  group: 'ui-react-last-days-picker-group',
} as const;

// Only bui's own tokens: the look of a bui field, which an app stylesheet
// may restyle by the class names above.
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
  // bui's dividers and solid selection for a track inside a field box.
  group: {
    padding: 2,
    gap: 2,
    overflow: 'visible',
    borderRadius: 'var(--bui-radius-3)',
    backgroundColor: 'var(--bui-bg-neutral-1)',
    boxShadow: 'inset 0 0 0 1px var(--bui-border-2)',
    // A bui Select's focus, while an option has keyboard focus.
    '&:has([data-focus-visible])': {
      boxShadow: 'inset 0 0 0 1px var(--bui-ring)',
    },
    '& > .bui-ToggleButton': {
      // 32px in all, the height of a small bui Select.
      height: 28,
      minWidth: 44,
      border: 0,
      borderRadius: 'calc(var(--bui-radius-3) - 2px)',
      background: 'transparent',
      color: 'var(--bui-fg-primary)',
      fontSize: 'var(--bui-font-size-3)',
      fontWeight: 'var(--bui-font-weight-regular)',
      fontVariantNumeric: 'tabular-nums',
    },
    '& > .bui-ToggleButton + .bui-ToggleButton': {
      borderLeft: 0,
    },
    // Hover draws an edge and never the selected option's fill, so a hovered
    // option cannot pass for the selected one.
    '& > .bui-ToggleButton:not([data-selected]):not([data-disabled])[data-hovered]':
      {
        background: 'transparent',
        boxShadow: 'inset 0 0 0 1px var(--bui-border-2)',
      },
    // The selected option: a light fill, a dark edge and bold text. The edge
    // carries the state on its own, so the fill is never the only cue.
    '& > .bui-ToggleButton[data-selected], & > .bui-ToggleButton[data-pressed]':
      {
        background: 'var(--bui-bg-neutral-2)',
        color: 'var(--bui-fg-primary)',
        boxShadow: 'inset 0 0 0 1px var(--bui-fg-primary)',
        fontWeight: 'var(--bui-font-weight-bold)',
      },
    // Keyboard focus is a ring of its own inside the option, apart from its
    // edge, so it reads as focus on the selected option and is not mistaken
    // for selection on another one (arrow keys move focus, not selection).
    '& > .bui-ToggleButton[data-focus-visible]': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: -5,
    },
    '& > .bui-ToggleButton[data-disabled]': {
      background: 'transparent',
      color: 'var(--bui-fg-disabled)',
    },
    // A deep link can select a window that is not on offer; it stays marked,
    // greyed.
    '& > .bui-ToggleButton[data-disabled][data-selected]': {
      background: 'var(--bui-bg-neutral-2)',
      boxShadow: 'inset 0 0 0 1px var(--bui-border-2)',
    },
  },
});

export interface LastDaysPickerProps<T extends number> {
  /** The windows on offer, in whole days back from today, shortest first. */
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
 * A choice among a few windows of whole days up to today, phrased once:
 * "Last [7 | 30 | 90] days", where only the number is picked. The words are
 * fixed, so it is for day windows looking back only; anything else is a
 * different control.
 *
 * It is a single-selection radio group named by its label, each option named
 * in full ("Last 7 days"), in a labelled field box as tall as a small bui
 * `Select`, so it lines up with the selects beside it in a header or filter
 * row. Like a select's label, its label moves focus to the control.
 */
export function LastDaysPicker<T extends number>({
  options,
  value,
  onChange,
  label = 'Time range',
  unavailableReason,
}: LastDaysPickerProps<T>) {
  const classes = useStyles();
  const labelId = useId();
  const root = useRef<HTMLDivElement>(null);

  // The label has no control of its own to point at (a radio group is not
  // labelable), so a click on it focuses the selected option, or the first
  // one that can be chosen.
  const focusSelected = () => {
    const radios = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    ).filter(radio => !radio.hasAttribute('disabled'));
    const target =
      radios.find(radio => radio.getAttribute('aria-checked') === 'true') ??
      radios[0];
    target?.focus();
  };

  return (
    <div
      ref={root}
      className={`${classes.root} ${LAST_DAYS_PICKER_CLASS_NAMES.root}`}
    >
      <FieldLabel label={label} id={labelId} onClick={focusSelected} />
      <div className={classes.row}>
        {/* The words are said once by each option's own name. */}
        <span aria-hidden="true">Last</span>
        <ToggleButtonGroup
          className={`${classes.group} ${LAST_DAYS_PICKER_CLASS_NAMES.group}`}
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
