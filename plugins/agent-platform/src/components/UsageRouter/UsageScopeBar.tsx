import { useLocation } from 'react-router-dom';
import { Flex, Text, ToggleButton, ToggleButtonGroup } from '@backstage/ui';
import { useInstallationScope } from '@giantswarm/backstage-plugin-gs';
import {
  usePhoneLayout,
  useTouchInput,
} from '@giantswarm/backstage-plugin-ui-react';
import { EnvironmentSelect } from '../EnvironmentSelect';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import { useUsageInstallation } from '../../hooks/useUsageInstallation';
import { useSessionUsage } from '../../hooks/useSessionUsage';
import {
  USAGE_WINDOW_OPTIONS,
  usageWindowLabel,
  type UsageWindowDays,
} from '../../lib/usageWindow';

/**
 * The Usage screen's scope controls: which environment (installation) it
 * reads, and over which window.
 *
 * The Environment control appears **only when the portal knows more than one
 * installation** (decision O5). `EnvironmentSelect` hides itself in that case
 * too; the explicit gate here keeps the decision visible — and testable — at
 * the screen that owes it, and spares the single-installation layout an empty
 * flex slot.
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
  const { isSingleInstallation, isLoading } = useInstallationScope();
  const { days, setDays } = useUsageWindow();
  // A phone, or any touch screen, never shows the greyed buttons' `title=`:
  // the reason is said beside the control there instead (T22 C23).
  const isPhone = usePhoneLayout();
  const isTouch = useTouchInput();

  // Only the sessions view has a backend-fixed window; the gateway views
  // query any window directly, so everything stays selectable there.
  const { pathname } = useLocation();
  const isSessionsView = /\/conversations\/?$/.test(pathname);

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

  const showEnvironment = !isLoading && !isSingleInstallation;
  const windowReason =
    backendWindowDays !== undefined &&
    USAGE_WINDOW_OPTIONS.some(option => option > backendWindowDays)
      ? `kagent keeps ${backendWindowDays} days of session usage`
      : undefined;

  return (
    // Bottom-aligned: the Environment select carries its label above the
    // field, so centring would lift the time range above the field's edge.
    // Wrapped onto its own line at phone width, the time range is unaffected.
    <Flex align="end" gap="3" style={{ flexWrap: 'wrap' }}>
      {showEnvironment && <EnvironmentSelect component="kagent" />}
      <ToggleButtonGroup
        aria-label="Time range"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[String(days)]}
        onSelectionChange={keys => {
          const next = Number([...keys][0]);
          const option = USAGE_WINDOW_OPTIONS.find(o => o === next);
          if (option) {
            setDays(option as UsageWindowDays);
          }
        }}
      >
        {USAGE_WINDOW_OPTIONS.map(option => {
          const isBeyondWindow =
            backendWindowDays !== undefined && option > backendWindowDays;
          return (
            <ToggleButton
              key={option}
              id={String(option)}
              size="small"
              isDisabled={isBeyondWindow}
              // Native tooltip: the only affordance a disabled button still
              // offers, and the reason has to live on the thing that is grey.
              // Set on the DOM node because react-aria strips `title` from
              // props (it is not in its DOM-prop allowlist), and a wrapper
              // element would break the group's direct-child border CSS.
              ref={node => {
                if (!node) {
                  return;
                }
                if (isBeyondWindow) {
                  node.setAttribute('title', windowReason ?? '');
                } else {
                  node.removeAttribute('title');
                }
              }}
            >
              {usageWindowLabel(option)}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
      {windowReason && (isPhone || isTouch) && (
        <Text as="p" variant="body-small" color="secondary">
          {windowReason}, so the longer ranges are unavailable.
        </Text>
      )}
    </Flex>
  );
}
