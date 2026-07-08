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
import GitHubIcon from '@material-ui/icons/GitHub';

import { CHART_DEFAULTS } from '../../lib/agentDefaults';
import { composeManifests } from '../../lib/composeManifests';
import { newAgentRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CodeBlock } from '../CodeBlock';

const CHART_NAME = 'general-purpose-agent';

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

  const ap = configApi.getOptionalConfig('agentPlatform');
  const namespace =
    ap?.getOptionalString('namespace') ?? CHART_DEFAULTS.namespace;
  const chartOciUrl =
    ap?.getOptionalString('chart.ociUrl') ?? CHART_DEFAULTS.ociUrl;
  const chartVersion =
    ap?.getOptionalString('chart.version') ?? CHART_DEFAULTS.version;
  const prTargetRepo = ap?.getOptionalString('prTargetRepo');

  // Reaching review with an incomplete form means a deep link or a reset —
  // send the user back to fill it in.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  const { files, valuesYaml, helmInstallCommand } = composeManifests(
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
    },
  );

  const actions = (
    <Flex gap="2">
      <Button
        variant="tertiary"
        onPress={() => navigate(newAgentLink ? newAgentLink() : '..')}
      >
        Back to edit
      </Button>
      <Button
        variant="primary"
        iconStart={<GitHubIcon />}
        isDisabled
        onPress={() => undefined}
      >
        Open pull request
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
            Your configuration is composed into Helm values plus the Flux
            manifests that deploy it. Nothing is live yet — review the change,
            then open a pull request against your GitOps repository.
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
              Generated changes
            </Text>
            <Text
              as="p"
              color="secondary"
              className={classes.sectionDescription}
            >
              These files land in your GitOps repo: the Flux{' '}
              <span className={classes.code}>HelmRelease</span> that installs
              the agent (with its values inlined) and the{' '}
              <span className={classes.code}>OCIRepository</span> that sources
              the chart.
            </Text>
            <div className={classes.files}>
              {files.map(file => (
                <CodeBlock
                  key={file.path}
                  filename={file.filename}
                  path={file.path}
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
              The recommended path is a pull request — Flux reconciles it onto
              the cluster once merged, and the change is reviewable and
              reversible in Git.
            </Text>

            <Card>
              <CardBody>
                <Flex justify="between" align="center" gap="4">
                  <Flex direction="column" gap="1">
                    <Text weight="bold">Open a pull request</Text>
                    <Text variant="body-small" color="secondary">
                      Commits the files to a new branch on your GitOps repo and
                      opens a PR. Merging triggers the Flux reconciliation.
                    </Text>
                  </Flex>
                  <Button
                    variant="primary"
                    iconStart={<GitHubIcon />}
                    isDisabled
                    onPress={() => undefined}
                  >
                    Open pull request
                  </Button>
                </Flex>
              </CardBody>
            </Card>

            <Box mt="3">
              <Alert
                status="info"
                title="Opening a PR from here isn't wired up yet"
                description={
                  prTargetRepo
                    ? `The GitOps target (${prTargetRepo}) is configured, but the pull-request action is still being built. For now, copy the manifests above or install manually below.`
                    : 'No GitOps target is configured (agentPlatform.prTargetRepo) and the pull-request action is still being built. For now, copy the manifests above or install manually below.'
                }
              />
            </Box>

            <details className={classes.details}>
              <summary className={classes.summaryLine}>
                Install manually instead
              </summary>
              <div className={classes.detailsBody}>
                <Text variant="body-small" color="secondary">
                  No GitOps pipeline? Save the values below and run the command
                  once against the cluster.
                </Text>
                <CodeBlock
                  filename={`${state.slug}-values.yaml`}
                  content={valuesYaml}
                  language="yaml"
                />
                <CodeBlock content={helmInstallCommand} />
              </div>
            </details>

            <Box mt="3">
              <Alert
                status="warning"
                title="Flux is assumed for the GitOps path"
                description="Installations that run a different pipeline (e.g. Argo CD or a bespoke delivery flow) will need a matching set of manifests. That path isn't generated yet. The general-purpose-agent chart itself is also still in progress — treat the chart URL, version, and values shape as provisional."
              />
            </Box>
          </div>
        </div>
      </Content>
    </>
  );
}
