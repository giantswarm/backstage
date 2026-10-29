import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Flex, Link, Text } from '@backstage/ui';
import {
  HelmRelease,
  ModelConfig,
  readProvenance,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findHelmReleaseChartName } from '@giantswarm/backstage-plugin-flux-react';
import {
  CommitSha,
  type Fact,
  FactList,
  InfoCard,
  LoadingIndicator,
  MONO,
  Mono,
  namespacedNameFacts,
  StatusDot,
  type StatusDotTone,
  useFactTextVariant,
} from '@giantswarm/backstage-plugin-ui-react';

import { deploymentDetailsExternalRouteRef } from '../../../routes';

/** `namespace/name`, to compare two releases by; the card shows them as facts. */
function qualified(namespace: string | undefined, name: string) {
  return namespace ? `${namespace}/${name}` : name;
}

/**
 * The HelmRelease's state in the words the Flux pages use for it, from its
 * Ready condition.
 */
function releaseState(helmRelease: HelmRelease): {
  tone: StatusDotTone;
  label: string;
  message?: string;
} {
  if (helmRelease.isSuspended()) {
    return { tone: 'neutral', label: 'Inactive', message: 'Suspended.' };
  }
  const ready = helmRelease.findReadyCondition();
  if (ready?.status === 'True') {
    return { tone: 'success', label: 'Ready' };
  }
  if (ready?.status === 'False') {
    return { tone: 'danger', label: 'Not ready', message: ready.message };
  }
  return { tone: 'neutral', label: 'Unknown', message: ready?.message };
}

/** The Flux HelmRelease's name, linked to its deployment page where gs is. */
function HelmReleaseName({
  installation,
  namespace,
  name,
}: {
  installation: string;
  namespace: string | undefined;
  name: string;
}) {
  const deploymentDetailsRoute = useRouteRef(deploymentDetailsExternalRouteRef);
  const variant = useFactTextVariant();
  const href =
    namespace &&
    deploymentDetailsRoute?.({
      installationName: installation,
      kind: 'helmrelease',
      namespace,
      name,
    });
  if (!href) {
    return <Mono>{name}</Mono>;
  }
  return (
    <Link href={href} variant={variant} style={MONO}>
      {name}
    </Link>
  );
}

export type ModelHelmReleaseCardProps = {
  modelConfig: ModelConfig;
  installation: string;
};

/**
 * The Helm release that renders the model, for a ModelConfig Helm owns: what
 * its labels and annotations name, and, where a Flux HelmRelease rendered it,
 * that HelmRelease's chart, version and state, linked to its deployment page
 * as the agent page links an agent's. A release Helm installed without Flux
 * has no resource to read, so it shows the names alone. Nothing for a model
 * Helm does not own.
 */
export function ModelHelmReleaseCard({
  modelConfig,
  installation,
}: ModelHelmReleaseCardProps) {
  const variant = useFactTextVariant();
  const provenance = readProvenance(modelConfig);
  const fluxName = provenance.fluxHelmRelease;
  const fluxNamespace = provenance.fluxHelmNamespace;

  const { resource: helmRelease, isLoading: isReading } = useResource(
    installation,
    HelmRelease,
    { name: fluxName ?? '', namespace: fluxNamespace },
    { enabled: Boolean(fluxName) },
  );
  const isLoading = Boolean(fluxName) && isReading;

  if (!fluxName && !provenance.helmRelease) {
    return null;
  }

  // The card is the HelmRelease's, so its namespace and name lead unprefixed.
  const facts: Fact[] = [];
  if (fluxName) {
    facts.push(
      ...namespacedNameFacts({
        namespace: fluxNamespace,
        name: fluxName,
        nameValue: (
          <HelmReleaseName
            installation={installation}
            namespace={fluxNamespace}
            name={fluxName}
          />
        ),
      }),
    );
  }
  // Helm's own name for the release, where it is not the HelmRelease's: a
  // HelmRelease may set its own `releaseName` or `targetNamespace`.
  if (
    provenance.helmRelease &&
    qualified(provenance.helmNamespace, provenance.helmRelease) !==
      (fluxName ? qualified(fluxNamespace, fluxName) : undefined)
  ) {
    facts.push(
      ...namespacedNameFacts({
        namespace: provenance.helmNamespace,
        name: provenance.helmRelease,
        kind: 'Helm release',
      }),
    );
  }

  let note: string | undefined;
  if (!fluxName) {
    note =
      'Helm installed this release without a Flux HelmRelease, so there is no release resource to read.';
  } else if (helmRelease) {
    const chart = findHelmReleaseChartName(helmRelease);
    const chartRef = helmRelease.getChartRef();
    if (chart) {
      facts.push({ label: 'Chart', value: <Mono>{chart}</Mono> });
    } else if (chartRef) {
      // A reference, so named alone, with its namespace where it is not the
      // HelmRelease's.
      facts.push({
        label: 'Chart from',
        value: (
          <Flex direction="column" gap="1">
            <Mono>{`${chartRef.kind} ${chartRef.name}`}</Mono>
            {chartRef.namespace && chartRef.namespace !== fluxNamespace && (
              <Text variant="body-small" color="secondary">
                Namespace <span style={MONO}>{chartRef.namespace}</span>
              </Text>
            )}
          </Flex>
        ),
      });
    }
    const version =
      helmRelease.getLastAppliedRevision() ??
      helmRelease.getChart()?.spec?.version;
    if (version) {
      facts.push({
        label: 'Version',
        value: (
          <Text variant={variant}>
            <CommitSha value={version} style={MONO} />
          </Text>
        ),
      });
    }
    const state = releaseState(helmRelease);
    facts.push({
      label: 'Status',
      value: (
        <Flex direction="column" gap="1">
          <StatusDot tone={state.tone} label={state.label} />
          {state.message && (
            <Text variant={variant} color="secondary">
              {state.message}
            </Text>
          )}
        </Flex>
      ),
    });
  } else if (!isLoading) {
    // Missing, or not readable with the person's access: either way, the
    // labels are all there is.
    note =
      'The HelmRelease could not be read, so only what the model’s labels name is shown.';
  }

  return (
    <InfoCard title="HelmRelease">
      <Flex direction="column" gap="3">
        <FactList facts={facts} labelWidth={160} maxWidth={null} />
        {isLoading && !helmRelease && (
          <LoadingIndicator label="Reading the HelmRelease…" />
        )}
        {note && (
          <Text as="p" variant="body-small" color="secondary">
            {note}
          </Text>
        )}
      </Flex>
    </InfoCard>
  );
}
