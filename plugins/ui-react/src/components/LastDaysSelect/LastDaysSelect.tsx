import { Select } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

/**
 * The class name on the select's root that does not change between builds,
 * for tests and app stylesheets to find it by without bui's own markup.
 */
export const LAST_DAYS_SELECT_CLASS_NAME = 'ui-react-last-days-select';

const useStyles = makeStyles({
  // Wide enough for the longest option, "Last 90 days", beside its chevron,
  // so the box keeps its width whichever window is selected.
  root: {
    minWidth: 150,
  },
});

export interface LastDaysSelectProps<T extends number> {
  /** The windows on offer, in whole days back from today, shortest first. */
  options: readonly T[];
  /** The selected window. */
  value: T;
  onChange: (days: T) => void;
  /** The label above the select, and its accessible name. */
  label?: string;
  /**
   * Why a window cannot be chosen, or `undefined` when it can. A window with
   * a reason is a disabled option that shows the reason under its name, which
   * is also its accessible description.
   */
  unavailableReason?: (days: T) => string | undefined;
}

/**
 * A select of a few windows of whole days up to today, each option reading
 * "Last 7 days", "Last 30 days", … The words are fixed, so it is for day
 * windows looking back only.
 *
 * It is a plain bui `Select` with its label above, so beside another select
 * (the shell's Environment select) it has the same label, box, edge, radius
 * and height, and the two line up.
 */
export function LastDaysSelect<T extends number>({
  options,
  value,
  onChange,
  label = 'Time range',
  unavailableReason,
}: LastDaysSelectProps<T>) {
  const classes = useStyles();
  return (
    <div className={`${classes.root} ${LAST_DAYS_SELECT_CLASS_NAME}`}>
      <Select
        label={label}
        selectedKey={String(value)}
        options={options.map(option => {
          const reason = unavailableReason?.(option);
          return {
            id: String(option),
            label: `Last ${option} days`,
            description: reason,
            disabled: reason !== undefined,
          };
        })}
        onSelectionChange={key => {
          const option = options.find(o => String(o) === String(key));
          if (option !== undefined) {
            onChange(option);
          }
        }}
      />
    </div>
  );
}
