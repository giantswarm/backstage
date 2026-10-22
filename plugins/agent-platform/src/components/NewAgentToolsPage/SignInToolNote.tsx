import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  joinNames,
  PHONE_QUERY,
  TOUCH_QUERY,
} from '@giantswarm/backstage-plugin-ui-react';

import type { SignInToolState } from '../../hooks/useSignInTool';
import { SIGN_IN_TOOL } from '../../lib/signInTool';
import { MAX_INLINE_SELECTORS } from '../../lib/toolset';

const useStyles = makeStyles(theme => ({
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    fontSize: 13,
  },
  code: {
    fontFamily: 'monospace',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  remove: {
    flex: 'none',
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    lineHeight: 1,
    padding: 0,
    // A thumb's target without a taller row, as the summary bar's chips.
    [`@media ${PHONE_QUERY}, ${TOUCH_QUERY}`]: {
      minWidth: 44,
      minHeight: 44,
      margin: '-14px -12px -14px -8px',
    },
  },
}));

export type SignInToolNoteProps = {
  signIn: SignInToolState;
  /** Takes the added sign-in tool out of the toolset. */
  onRemove: () => void;
  /** Puts it back after it was removed. */
  onAddBack: () => void;
};

/**
 * The sign-in tool the wizard adds for a connector that needs it, beside the
 * selection in the rail and the summary bar: what it is there for, removable;
 * once removed, what that costs and how to undo it. Nothing while no selected
 * connector needs it, or the selection carries it itself.
 */
export function SignInToolNote({
  signIn,
  onRemove,
  onAddBack,
}: SignInToolNoteProps) {
  const classes = useStyles();
  const connectors = joinNames(signIn.labels);

  if (signIn.status === 'added') {
    return (
      <Flex
        direction="column"
        gap="1"
        role="group"
        aria-label="Added for sign-in"
      >
        <Text variant="body-x-small" weight="bold">
          Added for sign-in
        </Text>
        <div className={classes.row}>
          <span className={classes.code}>{SIGN_IN_TOOL}</span>
          <button
            type="button"
            className={classes.remove}
            aria-label={`Remove ${SIGN_IN_TOOL}`}
            onClick={onRemove}
          >
            ×
          </button>
        </div>
        <Text variant="body-x-small" color="secondary">
          Lets the agent start the sign-in to {connectors}.
        </Text>
      </Flex>
    );
  }

  if (signIn.status === 'removed') {
    return (
      <Flex direction="column" align="start" gap="1" role="status">
        <Text variant="body-x-small" color="warning">
          Without <span className={classes.code}>{SIGN_IN_TOOL}</span> the agent
          won't be able to sign in to {connectors}.
        </Text>
        <Button variant="tertiary" size="small" onPress={onAddBack}>
          Add {SIGN_IN_TOOL} back
        </Button>
      </Flex>
    );
  }

  if (signIn.status === 'no-room') {
    return (
      <Text variant="body-x-small" color="warning" role="status">
        The toolset has no room left for{' '}
        <span className={classes.code}>{SIGN_IN_TOOL}</span> (at most{' '}
        {MAX_INLINE_SELECTORS} selectors), so the agent won't be able to sign in
        to {connectors}. Remove a selector to make room.
      </Text>
    );
  }

  return null;
}
