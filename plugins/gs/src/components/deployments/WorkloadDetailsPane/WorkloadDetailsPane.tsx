import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  Box,
  Card,
  CardContent,
  LinearProgress,
  Typography,
  useTheme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';
import LightAsync from 'react-syntax-highlighter/dist/esm/light-async';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import stackoverflowDark from 'react-syntax-highlighter/dist/esm/styles/hljs/stackoverflow-dark';
import stackoverflowLight from 'react-syntax-highlighter/dist/esm/styles/hljs/stackoverflow-light';
import {
  ContentRow,
  ClusterLink,
  DateComponent,
  DetailsPane,
  SimpleAccordion,
} from '../../UI';
import { Labels } from '../../LabelsCard/Labels';
import { ClusterTypes } from '../../clusters/utils';
import { AIChatButton } from '@giantswarm/backstage-plugin-ai-chat-react';
import { DeploymentStatus } from '../DeploymentStatus';
import { useDeploymentsData } from '../DeploymentsDataProvider';
import { DeploymentData } from '../DeploymentsDataProvider/utils';
import { useCatalogEntityByRef } from '../../hooks/useCatalogEntityByRef';
import {
  useMimirWorkloadDiagnostics,
  WorkloadDiagnostics,
} from '../../hooks/useMimirWorkloadDiagnostics';

LightAsync.registerLanguage('json', json);

export const WORKLOAD_DETAILS_PANE_ID = 'workloadDetails';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <Typography
          variant="subtitle1"
          style={{ fontWeight: 'bold' }}
          gutterBottom
        >
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

const KIND_LABELS: Record<string, string> = {
  app: 'App',
  helmrelease: 'HelmRelease',
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
};

function InstallationLink({ installationName }: { installationName: string }) {
  const { entity } = useCatalogEntityByRef({
    kind: 'Resource',
    namespace: 'default',
    name: installationName,
  });

  if (entity) {
    return <EntityRefLink entityRef={entity} />;
  }

  return <>{installationName}</>;
}

function SummaryCard({ workload }: { workload: DeploymentData }) {
  return (
    <Section title="Summary">
      <Box display="flex" flexDirection="column" style={{ gap: 12 }}>
        <ContentRow title="Kind">
          {KIND_LABELS[workload.kind] ?? workload.kind}
        </ContentRow>
        <ContentRow title="Installation">
          <InstallationLink installationName={workload.installationName} />
        </ContentRow>
        {workload.clusterName && (
          <ContentRow title="Cluster">
            {(() => {
              const clusterNamespace =
                workload.clusterNamespace ??
                (workload.clusterType === ClusterTypes.Management
                  ? Constants.MANAGEMENT_CLUSTER_NAMESPACE
                  : undefined);
              const clusterType = workload.clusterType as
                | typeof ClusterTypes.Management
                | typeof ClusterTypes.Workload
                | undefined;

              return clusterNamespace && clusterType ? (
                <ClusterLink
                  installationName={workload.installationName}
                  namespace={clusterNamespace}
                  name={workload.clusterName}
                  type={clusterType}
                />
              ) : (
                workload.clusterName
              );
            })()}
          </ContentRow>
        )}
        <ContentRow title="Namespace">{workload.namespace ?? 'N/A'}</ContentRow>
        {workload.targetNamespace &&
          workload.targetNamespace !== workload.namespace && (
            <ContentRow title="Target namespace">
              {workload.targetNamespace}
            </ContentRow>
          )}
        {workload.version && (
          <ContentRow title="Version">{workload.version}</ContentRow>
        )}
        {workload.attemptedVersion &&
          workload.attemptedVersion !== workload.version && (
            <ContentRow title="Attempted version">
              {workload.attemptedVersion}
            </ContentRow>
          )}
        {workload.chartName && (
          <ContentRow title="Chart">{workload.chartName}</ContentRow>
        )}
        {workload.updated && (
          <ContentRow title="Created">
            <DateComponent value={workload.updated} relative />
          </ContentRow>
        )}
        {workload.sourceKind && workload.sourceName && (
          <ContentRow title="Source">
            {workload.sourceKind}/{workload.sourceName}
          </ContentRow>
        )}
        {workload.entity ? (
          <ContentRow title="App">
            <EntityRefLink entityRef={workload.entity} />
          </ContentRow>
        ) : (
          workload.app && <ContentRow title="App">{workload.app}</ContentRow>
        )}
      </Box>
    </Section>
  );
}

function StatusCard({ status }: { status: string }) {
  return (
    <Section title="Status">
      <DeploymentStatus status={status} />
    </Section>
  );
}

function ReplicasCard({
  replicaStatus,
}: {
  replicaStatus: { desired: number; ready: number };
}) {
  const { desired, ready } = replicaStatus;
  let readyColor: 'textSecondary' | 'inherit' | 'error' = 'error';
  if (desired === 0) {
    readyColor = 'textSecondary';
  } else if (ready >= desired) {
    readyColor = 'inherit';
  }

  return (
    <Section title="Replicas">
      <Box display="flex">
        <Box flex={1} textAlign="center">
          <Typography variant="h4">{desired}</Typography>
          <Typography variant="caption" color="textSecondary">
            Desired
          </Typography>
        </Box>
        <Box flex={1} textAlign="center">
          <Typography variant="h4" color={readyColor}>
            {ready}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Ready
          </Typography>
        </Box>
      </Box>
    </Section>
  );
}

function KubeLabelsCard({ labels }: { labels: Record<string, string> }) {
  if (Object.keys(labels).length === 0) return null;

  return (
    <Section title="Labels">
      <Labels labels={labels} labelsConfig={[]} displayFriendlyItems={false} />
    </Section>
  );
}

const KIND_LABEL_MAP: Record<string, string> = {
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
};

function buildTroubleshootPrompt(
  workload: DeploymentData,
  diagnostics: WorkloadDiagnostics,
): string {
  const kindLabel = KIND_LABEL_MAP[workload.kind] ?? workload.kind;
  const lines: string[] = [];

  lines.push(
    `I have a ${kindLabel} named '${workload.name}' in namespace '${workload.targetNamespace ?? workload.namespace}' on cluster '${workload.clusterName}' (installation '${workload.installationName}') that is in a ${workload.status} state. Help me troubleshoot it.`,
  );

  lines.push('');
  lines.push('Here is the diagnostic information I have:');
  lines.push('');

  if (diagnostics.conditions.length > 0) {
    lines.push(
      `- Conditions: ${diagnostics.conditions.map(c => `${c.condition}=${c.status}`).join(', ')}`,
    );
  }

  if (diagnostics.podPhases.length > 0) {
    lines.push(
      `- Pod phases: ${diagnostics.podPhases.map(p => `${p.phase}: ${p.count}`).join(', ')}`,
    );
  }

  if (diagnostics.waitingReasons.length > 0) {
    lines.push(
      `- Containers in waiting state: ${diagnostics.waitingReasons.map(r => `${r.container || r.pod} (${r.reason})`).join(', ')}`,
    );
  }

  if (diagnostics.terminatedReasons.length > 0) {
    lines.push(
      `- Containers terminated: ${diagnostics.terminatedReasons.map(r => `${r.container || r.pod} (${r.reason})`).join(', ')}`,
    );
  }

  if (diagnostics.restarts.length > 0) {
    lines.push(
      `- Container restarts: ${diagnostics.restarts.map(r => `${r.container}: ${r.count}`).join(', ')}`,
    );
  }

  if (workload.replicaStatus) {
    lines.push(
      `- Replicas: ${workload.replicaStatus.ready}/${workload.replicaStatus.desired} ready`,
    );
  }

  lines.push('');
  lines.push(
    'What are the likely causes and what steps should I take to resolve this?',
  );

  return lines.join('\n');
}

const SEVERE_REASONS = new Set([
  'CrashLoopBackOff',
  'OOMKilled',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
]);

function DiagnosticsCard({ workload }: { workload: DeploymentData }) {
  const diagnostics = useMimirWorkloadDiagnostics({
    installationName: workload.installationName,
    clusterName: workload.clusterName,
    namespace: workload.targetNamespace ?? workload.namespace,
    name: workload.name,
    kind: workload.kind,
  });

  const hasConditions = diagnostics.conditions.length > 0;
  const hasPodPhases = diagnostics.podPhases.length > 0;
  const hasWaiting = diagnostics.waitingReasons.length > 0;
  const hasTerminated = diagnostics.terminatedReasons.length > 0;
  const hasRestarts = diagnostics.restarts.length > 0;
  const hasDiagnosticData =
    hasConditions || hasPodPhases || hasWaiting || hasTerminated || hasRestarts;

  const severeIssues = [
    ...diagnostics.waitingReasons.filter(r => SEVERE_REASONS.has(r.reason)),
    ...diagnostics.terminatedReasons.filter(r => SEVERE_REASONS.has(r.reason)),
  ];

  return (
    <Section title="Diagnostics">
      <Box display="flex" flexDirection="column" style={{ gap: 12 }}>
        {diagnostics.isLoading && <LinearProgress />}

        {severeIssues.map((issue, i) => (
          <Alert key={i} severity="error">
            {issue.reason} (container: {issue.container || 'unknown'})
          </Alert>
        ))}

        {hasConditions && (
          <ContentRow title="Conditions">
            {diagnostics.conditions
              .map(c => `${c.condition}: ${c.status}`)
              .join(', ')}
          </ContentRow>
        )}

        {hasPodPhases && (
          <ContentRow title="Pod phases">
            {diagnostics.podPhases
              .map(p => `${p.phase}: ${p.count}`)
              .join(', ')}
          </ContentRow>
        )}

        {hasWaiting && (
          <ContentRow title="Waiting containers">
            {diagnostics.waitingReasons
              .map(r => `${r.reason} (${r.container || r.pod})`)
              .join(', ')}
          </ContentRow>
        )}

        {hasTerminated && (
          <ContentRow title="Terminated containers">
            {diagnostics.terminatedReasons
              .map(r => `${r.reason} (${r.container || r.pod})`)
              .join(', ')}
          </ContentRow>
        )}

        {hasRestarts && (
          <ContentRow title="Restarts">
            {diagnostics.restarts
              .map(r => `${r.container}: ${r.count}`)
              .join(', ')}
          </ContentRow>
        )}

        {!diagnostics.isLoading && !hasDiagnosticData && (
          <Typography variant="body2" color="textSecondary">
            No diagnostic metrics available for this workload.
          </Typography>
        )}

        <Box mt={1}>
          <AIChatButton
            troubleshoot
            items={[
              {
                message: buildTroubleshootPrompt(workload, diagnostics),
              },
            ]}
          />
        </Box>
      </Box>
    </Section>
  );
}

function RawDataAccordion({ data }: { data: DeploymentData }) {
  const theme = useTheme();
  const style =
    theme.palette.type === 'dark' ? stackoverflowDark : stackoverflowLight;

  return (
    <Card>
      <CardContent>
        <SimpleAccordion title="Raw data">
          <Box width="100%">
            <LightAsync
              language="json"
              style={style}
              wrapLongLines
              customStyle={{
                margin: 0,
                padding: 16,
                fontSize: '0.8rem',
                borderRadius: 4,
              }}
            >
              {JSON.stringify(data, null, 2)}
            </LightAsync>
          </Box>
        </SimpleAccordion>
      </CardContent>
    </Card>
  );
}

function WorkloadDetails({
  installationName,
  kind,
  name,
  namespace,
  clusterName,
}: {
  installationName: string;
  kind: string;
  name: string;
  namespace: string;
  clusterName?: string;
}) {
  const { data } = useDeploymentsData();

  const workload = data.find(
    item =>
      item.installationName === installationName &&
      item.kind === kind &&
      item.name === name &&
      item.namespace === namespace &&
      (!clusterName || item.clusterName === clusterName),
  );

  if (!workload) {
    return (
      <Typography variant="body2" color="textSecondary">
        Workload not found.
      </Typography>
    );
  }

  return (
    <Box display="flex" flexDirection="column" style={{ gap: 16 }}>
      <SummaryCard workload={workload} />

      {workload.status && <StatusCard status={workload.status} />}

      {workload.replicaStatus && (
        <ReplicasCard replicaStatus={workload.replicaStatus} />
      )}

      {(workload.status === 'failed' || workload.status === 'pending') && (
        <DiagnosticsCard workload={workload} />
      )}

      {workload.kubeLabels && Object.keys(workload.kubeLabels).length > 0 && (
        <KubeLabelsCard labels={workload.kubeLabels} />
      )}

      <RawDataAccordion data={workload} />
    </Box>
  );
}

export const WorkloadDetailsPane = () => {
  return (
    <DetailsPane
      paneId={WORKLOAD_DETAILS_PANE_ID}
      render={({ installationName, kind, name, namespace, clusterName }) => (
        <WorkloadDetails
          installationName={installationName}
          kind={kind}
          name={name}
          namespace={namespace}
          clusterName={clusterName}
        />
      )}
    />
  );
};
