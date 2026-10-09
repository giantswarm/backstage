import { Alert, Flex, Text } from '@backstage/ui';
import {
  Agent,
  AGENT_CONDITION_STAGE_ORDER,
  Harness,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionsList,
  InfoCard,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import { HarnessLimits } from '../HarnessLimits';
import { shortPin } from './helpers';

/** Identifiers that may run to 64 characters with nowhere to break. */
const MONO: React.CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

/** A revision hash shortened like a commit, the full value on hover. */
function Revision({ value }: { value: string }) {
  return (
    <span style={MONO} title={value}>
      {shortPin(value)}
    </span>
  );
}

/**
 * The revision while the Harness compiles a newer one than it last succeeded
 * with — the one moment the revision explains something.
 */
function CompilingRevision({ agent }: { agent: Agent }) {
  const desiredRevision = agent.getDesiredRevision();
  const latestSuccessfulRevision = agent.getLatestSuccessfulRevision();
  if (!desiredRevision || desiredRevision === latestSuccessfulRevision) {
    return null;
  }
  return (
    <Text variant="body-small" color="secondary">
      Compiling <Revision value={desiredRevision} />
      {latestSuccessfulRevision && (
        <>
          , running <Revision value={latestSuccessfulRevision} />
        </>
      )}
    </Text>
  );
}

/**
 * Where the agent runs, and that Harness's limits. A failed read of the
 * Harness just hides the limits. The page header already carries the verdict.
 */
function HarnessLine({ agent, isReady }: { agent: Agent; isReady: boolean }) {
  const harness = agent.getHarnessName();
  const { resource: harnessObject } = useResource(
    agent.cluster,
    Harness,
    {
      name: harness ?? '',
      namespace: agent.getNamespace(),
      enableDiscovery: false,
    },
    { enabled: Boolean(harness) },
  );
  if (!harness) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      <Flex direction="column" gap="1">
        <Text variant="body-medium">
          {isReady ? 'Sessions run on ' : 'Runs on '}
          <span style={MONO}>{harness}</span>
        </Text>
        <CompilingRevision agent={agent} />
      </Flex>
      <HarnessLimits
        limits={harnessObject?.getLimits()}
        harnessName={harness}
      />
    </Flex>
  );
}

/**
 * Whether the agent works, below the verdict the page header shows: the
 * Harness its sessions run on, what the Harness could not honour, and the
 * conditions behind the verdict.
 *
 * A ready agent's conditions all read healthy, so they sit behind a closed
 * disclosure with the revision it runs. Anything else lists them open, in the
 * order the controller evaluates them, so the stage that failed comes before
 * the stages it blocks and starts expanded. Why sessions cannot start is the
 * page banner's to say, not repeated here.
 */
export function AgentStatusCard({ agent }: { agent: Agent }) {
  const readiness = agent.getReadiness();
  const warnings = agent.getHarnessWarnings();
  const conditions = agent.getConditions();
  const revision = agent.getLatestSuccessfulRevision();
  const isReady = readiness === 'ready';

  const conditionsList = (
    <ConditionsList
      conditions={conditions}
      order={AGENT_CONDITION_STAGE_ORDER}
      headingLevel={isReady ? 5 : 4}
      emptyContent={
        <Text variant="body-small" color="secondary">
          The controller has not reported on this agent yet. A newly created
          agent shows this until kagent reconciles it for the first time.
        </Text>
      }
    />
  );

  return (
    <InfoCard title="Status">
      <Flex direction="column" gap="4">
        <HarnessLine agent={agent} isReady={isReady} />

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

        {/* Independent of readiness — a fully ready agent can carry these — so
            they stay in view whatever the conditions say. */}
        {warnings.length > 0 && (
          <Alert
            status="warning"
            title="The Harness could not honour every configured feature"
            description={warnings.join('\n')}
          />
        )}

        {isReady ? (
          <SimpleAccordion
            title={`Conditions (${conditions.length})`}
            headingLevel={4}
          >
            <Flex direction="column" gap="2">
              {revision && (
                <Text variant="body-small" color="secondary">
                  Revision <Revision value={revision} />
                </Text>
              )}
              {conditionsList}
            </Flex>
          </SimpleAccordion>
        ) : (
          conditionsList
        )}
      </Flex>
    </InfoCard>
  );
}
