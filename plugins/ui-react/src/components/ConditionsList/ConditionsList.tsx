import { ReactNode } from 'react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Box,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ConditionMessage } from '../display/ConditionMessage';
import { DateComponent } from '../DateComponent';
import { StatusLabel, StatusLabelIntent } from '../StatusLabel';

const useStyles = makeStyles(theme => ({
  // bui's AccordionTrigger has no bottom padding, so an expanded header sits
  // flush against its panel and reads as top-heavy. Only add the gap when the
  // panel is actually open, or collapsed rows in a list drift apart.
  trigger: {
    '&[aria-expanded="true"]': {
      paddingBottom: theme.spacing(1),
    },
  },
}));

/**
 * The subset of a Kubernetes status condition this renders. Structurally typed
 * rather than tied to one CRD's generated type, so any resource's conditions fit
 * — they all follow the `metav1.Condition` shape.
 *
 * `status` is a plain string rather than the `'True' | 'False' | 'Unknown'`
 * union: some generated CRD types widen it, and a value outside the union should
 * still render as itself instead of failing to compile.
 */
export type ConditionLike = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  observedGeneration?: number;
};

export type ConditionsListProps = {
  conditions: ConditionLike[];
  /**
   * Whether a condition represents a problem — it drives the icon, the colour,
   * and which condition starts expanded.
   *
   * Defaults to "anything that is not `True`", which is right for the common
   * positive-polarity conditions (`Ready`, `Accepted`). Pass your own for
   * resources with abnormal-true conditions, where `True` is the bad news:
   *
   * ```ts
   * isFailing={c => (c.type === 'Stalled' ? c.status === 'True' : c.status === 'False')}
   * ```
   */
  isFailing?: (condition: ConditionLike) => boolean;
  /** Extra controls for a condition's panel, e.g. an "explain this error" button. */
  renderActions?: (condition: ConditionLike) => ReactNode;
  /** Shown instead of the list when there are no conditions at all. */
  emptyContent?: ReactNode;
};

function defaultIsFailing(condition: ConditionLike): boolean {
  return condition.status !== 'True';
}

function conditionIntent(
  condition: ConditionLike,
  isFailing: boolean,
): StatusLabelIntent {
  if (!isFailing) {
    return 'positive';
  }

  // `Unknown` is "the controller cannot tell yet", which is a weaker claim than
  // an outright failure and shouldn't look identical to one.
  return condition.status === 'Unknown' ? 'warning' : 'negative';
}

function transitionTime(condition: ConditionLike): number | undefined {
  if (!condition.lastTransitionTime) {
    return undefined;
  }
  const parsed = Date.parse(condition.lastTransitionTime);

  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Sort the most recently changed condition first, so the reason a resource just
 * became unhealthy is at the top. Conditions with no usable timestamp sort last
 * — "unknown" is not "oldest" — and ties fall back to the type for a stable
 * order.
 */
function sortConditions(conditions: ConditionLike[]): ConditionLike[] {
  return [...conditions].sort((a, b) => {
    const aTime = transitionTime(a);
    const bTime = transitionTime(b);

    if (aTime !== bTime) {
      if (aTime === undefined) return 1;
      if (bTime === undefined) return -1;
      return bTime - aTime;
    }

    return a.type.localeCompare(b.type);
  });
}

/**
 * A resource's status conditions, verbatim, as a list of collapsible entries —
 * the "why is this thing not working" view.
 *
 * Each condition shows its type, whether it is satisfied, and when it last
 * changed; expanding one reveals the controller's `reason` and `message`. The
 * first failing condition starts expanded, because that is the one the reader
 * came for; everything else is collapsed so a long list stays scannable.
 *
 * Presentation only — pass already-fetched conditions in. Deliberately agnostic
 * about the resource kind: pass `isFailing` for abnormal-true conditions.
 */
export const ConditionsList = ({
  conditions,
  isFailing = defaultIsFailing,
  renderActions,
  emptyContent,
}: ConditionsListProps) => {
  const classes = useStyles();

  if (conditions.length === 0) {
    return <>{emptyContent}</>;
  }

  const sorted = sortConditions(conditions);
  const firstFailing = sorted.find(condition => isFailing(condition));

  return (
    <Flex direction="column" gap="1">
      {sorted.map(condition => {
        const failing = isFailing(condition);
        const actions = renderActions?.(condition);

        return (
          <Accordion
            key={`${condition.type}-${condition.lastTransitionTime ?? ''}`}
            defaultExpanded={condition === firstFailing}
          >
            <AccordionTrigger className={classes.trigger}>
              <Box grow>
                <Flex align="center" justify="between" gap="2">
                  <StatusLabel
                    label={condition.type}
                    intent={conditionIntent(condition, failing)}
                  />
                  {condition.lastTransitionTime && (
                    <Text variant="body-small" color="secondary">
                      <DateComponent
                        value={condition.lastTransitionTime}
                        relative
                      />
                    </Text>
                  )}
                </Flex>
              </Box>
            </AccordionTrigger>
            <AccordionPanel>
              <Flex direction="column" gap="2" pb="2">
                <Flex align="center" gap="2">
                  <Text variant="body-small" color="secondary">
                    Status
                  </Text>
                  <Text variant="body-small">{condition.status}</Text>
                  {condition.reason && (
                    <>
                      <Text variant="body-small" color="secondary">
                        Reason
                      </Text>
                      <Text variant="body-small">{condition.reason}</Text>
                    </>
                  )}
                </Flex>

                {condition.message && (
                  <Box>
                    <ConditionMessage message={condition.message} />
                  </Box>
                )}

                {actions && <Box>{actions}</Box>}
              </Flex>
            </AccordionPanel>
          </Accordion>
        );
      })}
    </Flex>
  );
};
