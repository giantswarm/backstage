import { Alert, Flex, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionLike,
  ConditionsList,
  InfoCard,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';

import { READINESS_PRESENTATION } from '../AgentsTable/readinessStatus';

/**
 * kagent's `UnsupportedFeatures` is abnormal-true: the controller only sets it
 * when something *is* unsupported, and removes it once the warning clears. Every
 * other Agent condition is positive-polarity.
 */
function isFailingAgentCondition(condition: ConditionLike): boolean {
  if (condition.type === 'UnsupportedFeatures') {
    return condition.status === 'True';
  }

  return condition.status !== 'True';
}

/**
 * Why the agent is in the state the list shows: the readiness label, the
 * controller's own explanation, and every status condition verbatim.
 *
 * This is the section that makes a broken agent debuggable without `kubectl`, so
 * it leads the page rather than following the configuration.
 */
export function AgentStatusCard({ agent }: { agent: Agent }) {
  const readiness = agent.getReadiness();
  const { label, intent, icon } = READINESS_PRESENTATION[readiness];
  const readinessMessage = agent.getReadinessMessage();
  const unsupportedFeatures = agent.getUnsupportedFeaturesWarning();
  const conditions = agent.getConditions() ?? [];

  return (
    <InfoCard title="Status">
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="2">
          <StatusLabel label={label} intent={intent} icon={icon} />
          {readinessMessage && (
            <Text variant="body-small" color="secondary">
              {readinessMessage}
            </Text>
          )}
          {/* The one explanation the conditions cannot give on their own: they
              may all read healthy and still describe the *previous* spec. */}
          {agent.isStale() && (
            <Text variant="body-small" color="secondary">
              The controller has reconciled generation{' '}
              {agent.getObservedGeneration()}, but the stored spec is at
              generation {agent.getGeneration()} — the conditions below describe
              the previous version.
            </Text>
          )}
        </Flex>

        {/* Independent of readiness — a fully ready agent can carry this — so it
            is reported separately rather than folded into the label above. */}
        {unsupportedFeatures && (
          <Alert
            status="warning"
            title="Some configured features are unsupported"
            description={unsupportedFeatures}
          />
        )}

        <ConditionsList
          conditions={conditions}
          isFailing={isFailingAgentCondition}
          emptyContent={
            <Text variant="body-small" color="secondary">
              kagent has not reported a status for this agent yet. A newly
              created agent shows this until the controller reconciles it for
              the first time.
            </Text>
          }
        />
      </Flex>
    </InfoCard>
  );
}
