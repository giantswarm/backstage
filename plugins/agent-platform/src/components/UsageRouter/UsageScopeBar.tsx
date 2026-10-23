import { useLocation } from 'react-router-dom';
import { Text } from '@backstage/ui';
import {
  TimeWindowPicker,
  usePhoneLayout,
  useTouchInput,
} from '@giantswarm/backstage-plugin-ui-react';
import { EnvironmentSelect } from '../EnvironmentSelect';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useUsageInstallation } from '../../hooks/useUsageInstallation';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import { USAGE_WINDOW_OPTIONS } from '../../lib/usageWindow';

/**
 * The Usage screen's scope controls: which environment (installation) it
 * reads, and over which window.
 *
 * The Environment control appears **only when the portal knows more than one
 * installation** (decision O5); `EnvironmentSelect` owns that gate and
 * renders no slot otherwise.
 *
 * The window control shows on every view. The gateway views scope their
 * queries by it; Your sessions narrows the kagent fan-out's fixed-window
 * answer client-side (`AgentUsageSection` owns the honest labelling when the
 * selection asks for more than that window holds).
 *
 * On Your sessions, windows **larger than the backend's reported window are
 * disabled** rather than offered: selecting one could only ever re-show the
 * same figures under a bigger number. The window comes from the same cached
 * query `AgentUsageSection` reads (`useSessionUsage`, keyed per installation),
 * so this costs no extra request on that view and runs no query on the others
 * (`enabled` gates it). While the response is still loading nothing is
 * disabled — a control must not flicker locked over a guess — and a
 * deep-linked selection beyond the window stays rendered as today:
 * `AgentUsageSection`'s note explains it instead of this control clamping the
 * URL.
 */
export function UsageScopeBar() {
  const { days, setDays } = useUsageWindow();
  // A phone, or any touch screen, never shows the greyed buttons' `title=`:
  // the reason is said beside the control there instead (T22 C23).
  const isPhone = usePhoneLayout();
  const isTouch = useTouchInput();

  // Only the sessions view has a backend-fixed window; the gateway views
  // query any window directly, so everything stays selectable there.
  const { pathname } = useLocation();
  const isSessionsView = /\/your-sessions\/?$/.test(pathname);

  const { installation } = useUsageInstallation();
  const { usage } = useSessionUsage(installation, {
    enabled: isSessionsView,
  });

  // Undefined until a response carries a usable window — no response yet, a
  // response whose `windowDays` the reader coerced to 0, or another view —
  // and nothing is disabled on undefined. (`AgentUsageSection` falls back to
  // a nominal 30 for its *copy* in the coerced-0 case; a value the backend
  // never actually said is not grounds to lock a control.)
  const backendWindowDays =
    isSessionsView && usage && usage.windowDays > 0
      ? usage.windowDays
      : undefined;

  const windowReason =
    backendWindowDays !== undefined &&
    USAGE_WINDOW_OPTIONS.some(option => option > backendWindowDays)
      ? `kagent keeps ${backendWindowDays} days of session usage`
      : undefined;

  // A fragment: the controls are items of ShellPage's header actions row,
  // which spaces and aligns them (bottom edges, so the time range's box lines
  // up with the Environment select's, each under its own label).
  return (
    <>
      <EnvironmentSelect component="kagent" />
      <TimeWindowPicker
        options={USAGE_WINDOW_OPTIONS}
        value={days}
        onChange={setDays}
        unavailableReason={option =>
          backendWindowDays !== undefined && option > backendWindowDays
            ? windowReason
            : undefined
        }
      />
      {windowReason && (isPhone || isTouch) && (
        // A line of its own under the controls.
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          style={{ flexBasis: '100%', margin: 0 }}
        >
          {windowReason}, so the longer ranges are unavailable.
        </Text>
      )}
    </>
  );
}
