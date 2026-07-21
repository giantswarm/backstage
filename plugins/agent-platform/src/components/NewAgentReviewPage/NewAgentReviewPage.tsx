import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Box, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { CHART_DEFAULTS } from '../../lib/agentDefaults';
import { CHART_NAME, composeManifests } from '../../lib/composeManifests';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentChart } from '../../hooks/useAgentChart';
import { useDeployAgent } from '../../hooks/useDeployAgent';
import { newAgentRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CodeBlock } from '../CodeBlock';

// Standard scaffolder task route in this app (scaffolder mounts at /create).
const taskPath = (taskId: string) => `/create/tasks/${taskId}`;

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    padding: theme.spacing(2, 0),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(4),
  },
  code: {
    fontFamily: 'monospace',
  },
  section: {
    marginBottom: theme.spacing(4),
  },
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  sectionDescription: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  details: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  summaryLine: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  detailsBody: {
    marginTop: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-x-small" color="secondary">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

export function NewAgentReviewPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const configApi = useApi(configApiRef);
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const { state, isComplete } = useNewAgentForm();
  const { deploy, status } = useDeployAgent();
  const [deployError, setDeployError] = useState<string | undefined>();

  const ap = configApi.getOptionalConfig('agentPlatform');
  const chartOciUrl =
    ap?.getOptionalString('chart.ociUrl') ?? CHART_DEFAULTS.ociUrl;
  const serviceAccountName = ap?.getOptionalString('fluxServiceAccountName');

  // Deploy the latest published chart version (resolved from the registry;
  // falls back to the configured floor). Shares useAgentChart's query cache
  // with the create form.
  const { version: chartVersion } = useAgentChart();

  // Persist the same deterministic avatar the UI renders onto the resource, as
  // the size-agnostic canonical URL. Seeded by the technical name (= agent.name)
  // so it matches the created agent; undefined when the installation has no
  // configured base domain (then the chart keeps its default).
  const buildAvatarUrl = useAgentAvatarUrl();

  // The agent's resources are applied alongside the ModelConfig it uses — that
  // namespace already exists and is where kagent watches.
  const namespace = state.modelConfigNamespace ?? '';

  // Memoized so the YAML isn't recomposed (and the CodeMirror editors re-seeded)
  // on every re-render — this page re-renders as useAgentChart resolves and as
  // the deploy status advances. Computed before the completeness guard below so
  // the hook order stays stable (its result is only rendered when complete).
  const { files, combinedManifest, valuesYaml, helmInstallCommand } = useMemo(
    () =>
      composeManifests(
        {
          name: state.name,
          slug: state.slug,
          description: state.description,
          modelConfigName: state.modelConfigName ?? '',
          systemMessage: state.systemMessage,
          iconUrl: buildAvatarUrl(state.installation, state.slug) ?? '',
          skills: state.selectedSkills.map(skill => ({
            url: skill.repoUrl,
            path: skill.path,
            ref: skill.ref,
            name: skill.name,
          })),
        },
        {
          installation: state.installation ?? '',
          namespace,
          chartOciUrl,
          chartVersion,
          serviceAccountName,
        },
      ),
    [
      state.name,
      state.slug,
      state.description,
      state.modelConfigName,
      state.systemMessage,
      state.selectedSkills,
      state.installation,
      buildAvatarUrl,
      namespace,
      chartOciUrl,
      chartVersion,
      serviceAccountName,
    ],
  );

  const isDeploying =
    status.phase === 'authenticating' || status.phase === 'submitting';

  const onDeploy = useCallback(async () => {
    setDeployError(undefined);
    try {
      const taskId = await deploy({
        installation: state.installation!,
        manifest: combinedManifest,
        releaseName: state.slug,
        namespace,
      });
      navigate(taskPath(taskId));
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : String(e));
    }
  }, [
    deploy,
    state.installation,
    state.slug,
    combinedManifest,
    namespace,
    navigate,
  ]);

  const deployLabelByPhase: Record<string, string> = {
    authenticating: 'Authenticating…',
    submitting: 'Deploying…',
  };
  const deployLabel = deployLabelByPhase[status.phase] ?? 'Deploy agent';

  // Memoized so the header actions slot only updates when the handlers/labels
  // actually change (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          isDisabled={isDeploying}
          onPress={() => navigate(newAgentLink ? newAgentLink() : '..')}
        >
          Back to edit
        </Button>
        <Button variant="primary" isDisabled={isDeploying} onPress={onDeploy}>
          {deployLabel}
        </Button>
      </Flex>
    ),
    [isDeploying, newAgentLink, navigate, onDeploy, deployLabel],
  );

  // Surface the actions in the section's single header (Agent Platform) rather
  // than a second header of our own.
  useProvidePageHeaderActions(isComplete ? actions : null);

  // Reaching review with an incomplete form means a deep link or a reset —
  // send the user back to fill it in. (After all hooks, to keep their order
  // stable across renders.)
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Create an agent: review and deploy
        </Text>
        <Text as="p" color="secondary" className={classes.intro}>
          Your configuration is composed into a Flux{' '}
          <span className={classes.code}>HelmRelease</span> and{' '}
          <span className={classes.code}>OCIRepository</span>. Deploying applies
          them directly to <strong>{state.installation}</strong> — Flux then
          reconciles the agent onto the cluster.
        </Text>

        <div className={classes.summary}>
          <SummaryItem label="Release">
            <span className={classes.code}>{state.slug}</span>
          </SummaryItem>
          <SummaryItem label="Installation">
            <span className={classes.code}>{state.installation}</span>
          </SummaryItem>
          <SummaryItem label="Namespace">
            <span className={classes.code}>{namespace}</span>
          </SummaryItem>
          <SummaryItem label="Chart">
            <span className={classes.code}>
              {CHART_NAME}:{chartVersion}
            </span>
          </SummaryItem>
        </div>

        <div className={classes.section}>
          <Text
            as="h3"
            variant="title-small"
            weight="bold"
            className={classes.sectionTitle}
          >
            Resources to apply
          </Text>
          <Text as="p" color="secondary" className={classes.sectionDescription}>
            These are applied to{' '}
            <span className={classes.code}>{state.installation}</span> exactly
            as shown: the Flux{' '}
            <span className={classes.code}>OCIRepository</span> that sources the
            chart and the <span className={classes.code}>HelmRelease</span> that
            installs the agent (with its values inlined).
          </Text>
          <div className={classes.files}>
            {files.map(file => (
              <CodeBlock
                key={file.path}
                filename={file.filename}
                content={file.content}
                language="yaml"
              />
            ))}
          </div>
        </div>

        <div className={classes.section}>
          <Text
            as="h3"
            variant="title-small"
            weight="bold"
            className={classes.sectionTitle}
          >
            Deploy
          </Text>
          <Text as="p" color="secondary" className={classes.sectionDescription}>
            Applies the resources to{' '}
            <span className={classes.code}>{state.installation}</span> using
            your own cluster access. You can follow the apply logs on the next
            screen.
          </Text>

          <Card>
            <CardBody>
              <Flex justify="between" align="center" gap="4">
                <Flex direction="column" gap="1">
                  <Text weight="bold">Deploy to {state.installation}</Text>
                  <Text variant="body-small" color="secondary">
                    Creates the OCIRepository and HelmRelease directly on the
                    installation. Flux reconciles the agent from there.
                  </Text>
                </Flex>
                <Button
                  variant="primary"
                  isDisabled={isDeploying}
                  onPress={onDeploy}
                >
                  {deployLabel}
                </Button>
              </Flex>
            </CardBody>
          </Card>

          {deployError && (
            <Box mt="3">
              <Alert
                status="danger"
                title="Deploy failed"
                description={deployError}
              />
            </Box>
          )}

          <details className={classes.details}>
            <summary className={classes.summaryLine}>
              Install manually instead
            </summary>
            <div className={classes.detailsBody}>
              <Text variant="body-small" color="secondary">
                Prefer to keep this in your own GitOps repo, or apply it
                yourself? Copy the resources above, or save the values below and
                run the command once against the cluster.
              </Text>
              <CodeBlock
                filename={`${state.slug}-values.yaml`}
                content={valuesYaml}
                language="yaml"
              />
              <CodeBlock content={helmInstallCommand} />
            </div>
          </details>
        </div>
      </div>
    </Content>
  );
}
