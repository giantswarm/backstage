import { Flex, ToggleButton, ToggleButtonGroup } from '@backstage/ui';
import { useInstallationScope } from '@giantswarm/backstage-plugin-gs';
import { EnvironmentSelect } from '../EnvironmentSelect';
import { useUsageWindow } from '../../hooks/useUsageWindow';
import {
  USAGE_WINDOW_OPTIONS,
  usageWindowLabel,
  type UsageWindowDays,
} from '../../lib/usageWindow';

export type UsageScopeBarProps = {
  /**
   * Whether the active view is scoped by the time-range control. The Your
   * sessions view reads the backend's own fixed window, so showing the
   * control there would claim a scope it does not apply.
   */
  windowApplies: boolean;
};

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
 * The window is URL state (`useUsageWindow`), so it survives the tab switch
 * and travels in a shared link.
 */
export function UsageScopeBar({ windowApplies }: UsageScopeBarProps) {
  const { isSingleInstallation, isLoading } = useInstallationScope();
  const { days, setDays } = useUsageWindow();

  const showEnvironment = !isLoading && !isSingleInstallation;
  if (!showEnvironment && !windowApplies) {
    return null;
  }

  return (
    <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
      {showEnvironment && <EnvironmentSelect component="kagent" />}
      {windowApplies && (
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
          {USAGE_WINDOW_OPTIONS.map(option => (
            <ToggleButton key={option} id={String(option)} size="small">
              {usageWindowLabel(option)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    </Flex>
  );
}
