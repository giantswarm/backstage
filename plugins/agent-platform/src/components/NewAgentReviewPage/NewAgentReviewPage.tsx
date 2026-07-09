import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  PluginHeader,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import AndroidIcon from '@material-ui/icons/Android';

import { CHART_DEFAULTS } from '../../lib/agentDefaults';
import { composeManifests } from '../../lib/composeManifests';
import { useDeployAgent } from '../../hooks/useDeployAgent';
import { newAgentRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CodeBlock } from '../CodeBlock';

const CHART_NAME = 'general-purpose-agent';

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
  const chartVersion =
    ap?.getOptionalString('chart.version') ?? CHART_DEFAULTS.version;
  const serviceAccountName = ap?.getOptionalString('fluxServiceAccountName');

  // Reaching review with an incomplete form means a deep link or a reset —
  // send the user back to fill it in.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  // The agent's resources are applied alongside the ModelConfig it uses — that
  // namespace already exists and is where kagent watches.
  const namespace = state.modelConfigNamespace!;

  const { files, combinedManifest, valuesYaml, helmInstallCommand } =
    composeManifests(
      {
        name: state.name,
        slug: state.slug,
        description: state.description,
        modelConfigName: state.modelConfigName!,
        modelConfigNamespace: state.modelConfigNamespace!,
        systemMessage: state.systemMessage,
        skillRefs: [],
      },
      {
        installation: state.installation!,
        namespace,
        chartOciUrl,
        chartVersion,
        serviceAccountName,
      },
    );

  const isDeploying =
    status.phase === 'authenticating' || status.phase === 'submitting';

  const onDeploy = async () => {
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
  };

  const deployLabelByPhase: Record<string, string> = {
    authenticating: 'Authenticating…',
    submitting: 'Deploying…',
  };
  const deployLabel = deployLabelByPhase[status.phase] ?? 'Deploy agent';

  const actions = (
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
  );

  return (
    <>
      <PluginHeader
        icon={<AndroidIcon fontSize="inherit" />}
        title="Agents"
        customActions={actions}
      />
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
            <span className={classes.code}>OCIRepository</span>. Deploying
            applies them directly to <strong>{state.installation}</strong> —
            Flux then reconciles the agent onto the cluster.
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
            <Text
              as="p"
              color="secondary"
              className={classes.sectionDescription}
            >
              These are applied to{' '}
              <span className={classes.code}>{state.installation}</span> exactly
              as shown: the Flux{' '}
              <span className={classes.code}>OCIRepository</span> that sources
              the chart and the{' '}
              <span className={classes.code}>HelmRelease</span> that installs
              the agent (with its values inlined).
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
            <Text
              as="p"
              color="secondary"
              className={classes.sectionDescription}
            >
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
                  yourself? Copy the resources above, or save the values below
                  and run the command once against the cluster.
                </Text>
                <CodeBlock
                  filename={`${state.slug}-values.yaml`}
                  content={valuesYaml}
                  language="yaml"
                />
                <CodeBlock content={helmInstallCommand} />
              </div>
            </details>

            {!serviceAccountName && (
              <Box mt="3">
                <Alert
                  status="warning"
                  title="No deploy ServiceAccount configured"
                  description="Deploying into a tenant namespace requires agentPlatform.fluxServiceAccountName (GS Flux multi-tenancy). Without it the apply is rejected by admission policy — set it in app-config, or use the manual install below."
                />
              </Box>
            )}

            <Box mt="3">
              <Alert
                status="warning"
                title="The general-purpose-agent chart is still provisional"
                description="The chart itself doesn't exist yet, so treat the chart URL, version, values shape, and the deploy ServiceAccount as placeholders — deploying now will not produce a working agent until the chart is published."
              />
            </Box>
          </div>
        </div>
      </Content>
    </>
  );
}
