import { Select } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DEFAULT_USAGE_WINDOW_DAYS,
  formatUsageWindow,
  parseUsageWindow,
  USAGE_WINDOW_OPTIONS,
  usageMonthLabel,
  usageMonthOptions,
  type UsageWindow,
} from '../../lib/usageWindow';

/**
 * The class name on the select's root that does not change between builds,
 * for tests and app stylesheets to find it by without bui's own markup.
 */
export const USAGE_WINDOW_SELECT_CLASS_NAME =
  'agent-platform-usage-window-select';

const useStyles = makeStyles({
  // Wide enough for "September 2026 so far" beside its chevron, so the box
  // keeps its width whichever window is selected.
  root: {
    minWidth: 190,
  },
});

/** The default days window's key, which `formatUsageWindow` keeps out of the URL. */
const DEFAULT_KEY = `${DEFAULT_USAGE_WINDOW_DAYS}d`;

export type UsageWindowSelectProps = {
  value: UsageWindow;
  onChange: (window: UsageWindow) => void;
  /** The label above the select, and its accessible name. */
  label?: string;
  /**
   * Why a window cannot be chosen, or `undefined` when it can. A window with
   * a reason is a disabled option that shows the reason under its name, which
   * is also its accessible description.
   */
  unavailableReason?: (window: UsageWindow) => string | undefined;
  /** The clock, for the months on offer. Defaults to now. */
  now?: number;
};

/**
 * The Usage screen's time range: the days windows ("Last 7 days", …) and,
 * after them, the calendar months the screen offers, this month so far and
 * the two before it ("November 2026 so far", "October 2026", …). The key of
 * each option is what the URL carries for it, so the control and the URL
 * cannot disagree.
 *
 * A plain bui `Select` with its label above, so beside the Environment and
 * Organization selects it has the same label, box, edge, radius and height,
 * and the three line up.
 */
export function UsageWindowSelect({
  value,
  onChange,
  label = 'Time range',
  unavailableReason,
  now = Date.now(),
}: UsageWindowSelectProps) {
  const classes = useStyles();

  const option = (window: UsageWindow, name: string) => {
    const reason = unavailableReason?.(window);
    return {
      id: formatUsageWindow(window) ?? DEFAULT_KEY,
      label: name,
      description: reason,
      disabled: reason !== undefined,
    };
  };

  return (
    <div className={`${classes.root} ${USAGE_WINDOW_SELECT_CLASS_NAME}`}>
      <Select
        label={label}
        selectedKey={formatUsageWindow(value) ?? DEFAULT_KEY}
        options={[
          ...USAGE_WINDOW_OPTIONS.map(days =>
            option({ kind: 'days', days }, `Last ${days} days`),
          ),
          ...usageMonthOptions(now).map(month =>
            option({ kind: 'month', month }, usageMonthLabel(month, now)),
          ),
        ]}
        onSelectionChange={key => {
          if (key !== null) {
            onChange(parseUsageWindow(String(key), now));
          }
        }}
      />
    </div>
  );
}
