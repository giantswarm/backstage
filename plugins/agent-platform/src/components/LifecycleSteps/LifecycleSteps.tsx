import { Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { CircularProgress } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';

import { useNow } from '../../hooks/useNow';
import {
  stepTiming,
  type LifecycleStep,
  type LifecycleStepState,
} from '../../lib/lifecycle';

export type LifecycleStepsProps = {
  /** The steps in order, in the managers' vocabulary. */
  steps: LifecycleStep[];
  'aria-label'?: string;
};

const ICON_SIZE = 18;

function StateIcon({ state }: { state: LifecycleStepState }) {
  switch (state) {
    case 'done':
      return (
        <CheckCircleIcon
          style={{ fontSize: ICON_SIZE, color: 'var(--bui-fg-success)' }}
          aria-hidden
        />
      );
    case 'failed':
      return (
        <ErrorIcon
          style={{ fontSize: ICON_SIZE, color: 'var(--bui-fg-danger)' }}
          aria-hidden
        />
      );
    case 'inProgress':
      return <CircularProgress size={ICON_SIZE - 2} aria-hidden />;
    default:
      return (
        <RadioButtonUncheckedIcon
          style={{ fontSize: ICON_SIZE, color: 'var(--bui-fg-secondary)' }}
          aria-hidden
        />
      );
  }
}

const STATE_WORD: Record<LifecycleStepState, string> = {
  pending: 'pending',
  inProgress: 'in progress',
  done: 'done',
  failed: 'failed',
};

/**
 * The steps of a long-running action, each with its state, when it began or
 * how long it took, what it usually takes, and the manager's message; a step
 * with an `action` is the next thing to do, offered as a link once it is
 * `done`. Shared by the GPU node pools page and the Serving page; knows
 * nothing about pools or models.
 */
export function LifecycleSteps({
  steps,
  'aria-label': ariaLabel,
}: LifecycleStepsProps) {
  const now = useNow();
  return (
    <ol
      aria-label={ariaLabel}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bui-space-2)',
      }}
    >
      {steps.map(step => {
        const timing = stepTiming(step, now);
        const muted = step.state === 'pending';
        return (
          <li
            key={step.id}
            data-testid="lifecycle-step"
            data-step={step.id}
            data-state={step.state}
            style={{
              display: 'flex',
              gap: 'var(--bui-space-2)',
              alignItems: 'flex-start',
              opacity: muted ? 0.7 : undefined,
            }}
          >
            <span
              role="img"
              aria-label={STATE_WORD[step.state]}
              style={{ display: 'inline-flex', marginTop: 2 }}
            >
              <StateIcon state={step.state} />
            </span>
            <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
              <Flex gap="2" align="baseline" style={{ flexWrap: 'wrap' }}>
                {step.action && step.state === 'done' ? (
                  <Link to={step.action.to}>
                    <Text as="span" variant="body-medium" weight="bold">
                      {step.action.label}
                    </Text>
                  </Link>
                ) : (
                  <Text as="span" variant="body-medium" weight="bold">
                    {step.title}
                  </Text>
                )}
                {timing && (
                  <Text as="span" variant="body-small" color="secondary">
                    {timing}
                  </Text>
                )}
              </Flex>
              {step.message && (
                <Text
                  as="span"
                  variant="body-small"
                  color={step.state === 'failed' ? 'danger' : 'secondary'}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {step.message}
                </Text>
              )}
            </Flex>
          </li>
        );
      })}
    </ol>
  );
}
