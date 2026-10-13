import { Flex, Text } from '@backstage/ui';
import {
  isGitOpsManaged,
  MODEL_CONFIG_CONDITION_ORDER,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  ConditionsList,
  type Fact,
  FactList,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';

/** Identifiers someone may retype into `kubectl`. */
const MONO: React.CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

function Mono({ children }: { children: string }) {
  return (
    <Text variant="body-small" style={MONO}>
      {children}
    </Text>
  );
}

/**
 * The resource behind the model, in the terms of the people who run the
 * platform: what it is called in the cluster, its provider, and where its
 * key is read from.
 */
function ResourceFacts({ modelConfig }: { modelConfig: ModelConfig }) {
  const namespace = modelConfig.getNamespace();
  const name = modelConfig.getName();
  const provider = modelConfig.getProvider();
  const secret = modelConfig.getApiKeySecret();
  const secretKey = modelConfig.getApiKeySecretKey();

  const facts: Fact[] = [
    {
      label: 'ModelConfig',
      value: <Mono>{namespace ? `${namespace}/${name}` : name}</Mono>,
    },
  ];
  if (provider) {
    facts.push({ label: 'Provider', value: <Mono>{provider}</Mono> });
  }
  if (secret) {
    facts.push({
      label: 'API key from',
      value: (
        <Mono>
          {secretKey
            ? `Secret ${secret}, key ${secretKey}`
            : `Secret ${secret}`}
        </Mono>
      ),
    });
  }

  return (
    <InfoCard title="Resource">
      <FactList facts={facts} labelWidth={160} maxWidth={null} />
    </InfoCard>
  );
}

/**
 * What the controller makes of the model: its conditions, with their reason
 * and message, in the order it evaluates them, so the stage that failed
 * comes first and starts expanded. This is where "Not accepted" explains
 * itself (a missing key Secret, a provider config that does not resolve).
 */
function StatusConditions({ modelConfig }: { modelConfig: ModelConfig }) {
  return (
    <InfoCard title="Status">
      <Flex direction="column" gap="4">
        {/* The one thing the conditions cannot say on their own: they may
            all read healthy and still describe the previous spec. */}
        {modelConfig.isStale() && (
          <Text variant="body-small" color="secondary">
            The controller has not reconciled the latest change yet, so the
            conditions below describe the previous version.
          </Text>
        )}
        <ConditionsList
          conditions={modelConfig.getConditions()}
          order={MODEL_CONFIG_CONDITION_ORDER}
          headingLevel={4}
          emptyContent={
            <Text variant="body-small" color="secondary">
              The controller has not reported on this model yet, which is normal
              until kagent first reconciles it.
            </Text>
          }
        />
      </Flex>
    </InfoCard>
  );
}

/**
 * The model as a Kubernetes resource, inside the page's "Technical details"
 * fold-out, as on the agent page: where it came from (GitOps), what it is
 * called in the cluster, and the controller's conditions.
 */
export function ModelTechnicalDetails({
  modelConfig,
  installation,
}: {
  modelConfig: ModelConfig;
  installation: string;
}) {
  return (
    <Flex direction="column" gap="4">
      {/* A cheap pre-check only: whether the model is *actually* applied from
          Git is the card's own decision. */}
      {isGitOpsManaged(modelConfig) && (
        <GitOpsCard resource={modelConfig} installationName={installation} />
      )}
      <ResourceFacts modelConfig={modelConfig} />
      <StatusConditions modelConfig={modelConfig} />
    </Flex>
  );
}
