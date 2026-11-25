import { VisuallyHidden } from '@backstage/ui';
import BlockIcon from '@material-ui/icons/Block';
import LockIcon from '@material-ui/icons/LockOutlined';
import {
  APPROVAL_SETTING_HINTS,
  BUILT_IN_HINT,
  type ApprovalSetting,
} from '../../../lib/toolApproval';
import { MarkerBadge, type MarkerBadgeProps } from '../MarkerBadge';

const TONES: Record<ApprovalSetting, MarkerBadgeProps['tone']> = {
  Allow: 'neutral',
  Ask: 'info',
  Block: 'danger',
};

export type ApprovalBadgeProps = {
  setting: ApprovalSetting;
  /** muster's own built-in setting (always asks): a lock, not a choice. */
  builtIn?: boolean;
};

/**
 * A tool's approval setting, read-only: *Allow* plain, *Ask* in the info
 * tone, *Block* in the danger tone with its icon, so a blocked tool never
 * reads like one that asks. The hint is the badge's title and accessible
 * description, in the words every approval surface uses.
 */
export function ApprovalBadge({ setting, builtIn }: ApprovalBadgeProps) {
  let icon;
  if (builtIn) {
    icon = <LockIcon aria-hidden />;
  } else if (setting === 'Block') {
    icon = <BlockIcon aria-hidden />;
  }
  const hint = builtIn ? BUILT_IN_HINT : APPROVAL_SETTING_HINTS[setting];
  return (
    <span title={hint}>
      <MarkerBadge tone={TONES[setting]} icon={icon}>
        {setting}
        <VisuallyHidden>{`: ${hint}`}</VisuallyHidden>
      </MarkerBadge>
    </span>
  );
}
