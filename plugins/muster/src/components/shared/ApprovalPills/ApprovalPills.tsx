import { ToggleButton, ToggleButtonGroup } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import BlockIcon from '@material-ui/icons/Block';
import CheckIcon from '@material-ui/icons/Check';
import {
  APPROVAL_SETTING_HINTS,
  type ApprovalSetting,
} from '../../../lib/toolApproval';

const useStyles = makeStyles({
  group: {
    flex: 'none',
  },
  // A chosen *Block* in the danger tone, so it never reads like *Ask*.
  block: {
    '&[data-selected]': {
      background: 'var(--bui-negative-bg-subdued)',
      color: 'var(--bui-negative-fg-subdued)',
      boxShadow: 'inset 0 0 0 1px var(--bui-negative-border)',
    },
  },
});

export type ApprovalPillsProps<T extends ApprovalSetting> = {
  /** Names the group for assistive tech: "Approval for merge_pull_request". */
  'aria-label': string;
  /** The choices, in order: every setting, or a rule's Allow and Ask. */
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * One choice of `Allow · Ask · Block` as pills (bui's `ToggleButtonGroup`,
 * as the new-agent Tools step draws its connector choices). The chosen pill
 * carries a check, a chosen *Block* its own icon and the danger tone. Each
 * pill's hint is its accessible description. Only for a person who may
 * change the setting: everyone else gets an {@link ApprovalBadge}, never a
 * disabled group.
 */
export function ApprovalPills<T extends ApprovalSetting>({
  'aria-label': ariaLabel,
  options,
  value,
  onChange,
}: ApprovalPillsProps<T>) {
  const classes = useStyles();
  return (
    <ToggleButtonGroup
      aria-label={ariaLabel}
      className={classes.group}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={keys => {
        const next = [...keys][0] as T | undefined;
        if (next && next !== value) {
          onChange(next);
        }
      }}
    >
      {options.map(option => {
        let icon;
        if (option === value) {
          icon =
            option === 'Block' ? (
              <BlockIcon aria-hidden />
            ) : (
              <CheckIcon aria-hidden />
            );
        }
        return (
          <ToggleButton
            key={option}
            id={option}
            size="small"
            iconStart={icon}
            aria-description={APPROVAL_SETTING_HINTS[option]}
            className={option === 'Block' ? classes.block : undefined}
          >
            {option}
          </ToggleButton>
        );
      })}
    </ToggleButtonGroup>
  );
}
