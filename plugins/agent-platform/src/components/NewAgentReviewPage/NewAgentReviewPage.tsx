import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Box, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import {
  RemoteMCPServer,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  composeManifests,
  GATEWAY_SERVER_NAME,
  KAGENT_API_VERSION,
} from '../../lib/composeManifests';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useDeployAgent } from '../../hooks/useDeployAgent';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  buildCatalogue,
  declaredToolset,
  toolsetShape,
  unsignedServerSelectors,
} from '../../lib/toolset';
import { newAgentRouteRef, newAgentToolsRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CodeBlock } from '../CodeBlock';
import { ToolsetResolutionList } from '../ToolsetResolutionList';

// Standard scaffolder task route in this app (scaffolder mounts at /create).
const taskPath = (taskId: string) => `/create/tasks/${taskId}`;

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
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

/** The one-line Tools summary: the loud labels, or a selector count. */
function toolsetSummaryLabel(
  shape: 'none' | 'full' | 'composed',
  count: number,
): string {
  if (shape === 'none') {
    return 'No tools';
  }
  if (shape === 'full') {
    return 'Full gateway access';
  }
  return `${count} selector${count === 1 ? '' : 's'}`;
}

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
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const toolsLink = useRouteRef(newAgentToolsRouteRef);
  const { state, isComplete, isToolsetValid } = useNewAgentForm();
  // Only to number the steps: with no skill repositories configured the skills
  // step doesn't exist. Cached by the time this page renders.
  const { hasRepositories } = useSkillCatalog();

  // The toolset as the Tools step showed it — the same resolution for the same
  // person, from the same cached queries — so what is reviewed is exactly what
  // is applied, and the "selected without a sign-in" flag is repeated here.
  const toolCatalogue = useMusterToolCatalogue(state.installation);
  const { servers } = useMusterServers(state.installation);
  const resolution = useToolsetResolution(state.installation, state.toolset);
  const unsignedServers = useMemo(
    () =>
      unsignedServerSelectors(
        state.toolset,
        buildCatalogue(
          toolCatalogue.tools,
          servers,
          toolCatalogue.serversRequiringAuth,
        ),
      ),
    [
      state.toolset,
      toolCatalogue.tools,
      servers,
      toolCatalogue.serversRequiringAuth,
    ],
  );
  // What the release declares: the selection, or `preset:none` for none.
  const declared = useMemo(
    () => declaredToolset(state.toolset),
    [state.toolset],
  );
  const shape = toolsetShape(declared);
  const { deploy, status } = useDeployAgent();
  const [deployError, setDeployError] = useState<string | undefined>();

  // The agent's resources are applied alongside the ModelConfig it uses — that
  // namespace already exists and is where kagent watches. On kagent `main` the
  // template's bindings resolve same-namespace, so the gateway copy lives there
  // too.
  const namespace = state.modelConfigNamespace ?? '';

  // The platform's muster gateway server on the installation: a toolset is a
  // copy of it carrying the header, so its spec is read to be copied verbatim.
  // Best-effort — the composer falls back to the in-cluster muster URL.
  const { resource: gatewayServer } = useResource(
    state.installation ?? '',
    RemoteMCPServer,
    { name: GATEWAY_SERVER_NAME, namespace, enableDiscovery: false },
    { enabled: Boolean(state.installation && namespace) },
  );
  const gateway = useMemo(
    () =>
      gatewayServer
        ? {
            name: gatewayServer.getName(),
            spec: (gatewayServer.jsonData.spec ?? {}) as Record<string, unknown>,
          }
        : undefined,
    [gatewayServer],
  );

  // Persist the same deterministic avatar the UI renders onto the resource, as
  // the size-agnostic canonical URL. Seeded by the technical name (= agent.name)
  // so it matches the created agent; undefined when the installation has no
  // configured base domain (then the chart keeps its default).
  const buildAvatarUrl = useAgentAvatarUrl();

  // Memoized so the YAML isn't recomposed (and the CodeMirror editors re-seeded)
  // on every re-render — this page re-renders as the gateway read resolves and
  // as the deploy status advances. Computed before the completeness guard below
  // so the hook order stays stable (its result is only rendered when complete).
  const { files, combinedManifest, applyCommand } = useMemo(
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
          toolset: declared,
        },
        {
          installation: state.installation ?? '',
          namespace,
          gateway,
        },
      ),
    [
      state.name,
      state.slug,
      state.description,
      state.modelConfigName,
      state.systemMessage,
      state.selectedSkills,
      declared,
      state.installation,
      buildAvatarUrl,
      namespace,
      gateway,
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

  // "Back" goes to the immediately preceding step, which is always the Tools
  // step.
  const backLink = toolsLink;
  const stepNumber = hasRepositories ? 4 : 3;

  // Memoized so the header actions slot only updates when the handlers/labels
  // actually change (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          isDisabled={isDeploying}
          onPress={() => navigate(backLink ? backLink() : '..')}
        >
          Back to edit
        </Button>
        <Button variant="primary" isDisabled={isDeploying} onPress={onDeploy}>
          {deployLabel}
        </Button>
      </Flex>
    ),
    [isDeploying, backLink, navigate, onDeploy, deployLabel],
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
  // A toolset that cannot be applied (a malformed selector, over the inline
  // cap) is fixed on the Tools step; the chart would refuse the release anyway.
  if (!isToolsetValid) {
    return <Navigate to={toolsLink ? toolsLink() : '..'} replace />;
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step {stepNumber} of {stepNumber}: Review & deploy
        </Text>
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
          <SummaryItem label="Name">
            <span className={classes.code}>{state.slug}</span>
          </SummaryItem>
          <SummaryItem label="Installation">
            <span className={classes.code}>{state.installation}</span>
          </SummaryItem>
          <SummaryItem label="Namespace">
            <span className={classes.code}>{namespace}</span>
          </SummaryItem>
          <SummaryItem label="Kind">
            <span className={classes.code}>
              AgentTemplate ({KAGENT_API_VERSION})
            </span>
          </SummaryItem>
          <SummaryItem label="Tools">
            <Text variant="body-small">
              {toolsetSummaryLabel(shape, declared.length)}
            </Text>
            <Text variant="body-x-small" color="secondary">
              <span className={classes.code}>{declared.join(', ')}</span>
            </Text>
          </SummaryItem>
          {/* Named here, not just buried in the values YAML — skills are chosen
              on their own step, so this is the only compact confirmation of
              what that step produced. */}
          {hasRepositories && (
            <SummaryItem label="Skills">
              {state.selectedSkills.length === 0 ? (
                <Text variant="body-small" color="secondary">
                  None
                </Text>
              ) : (
                <Text variant="body-small">
                  {state.selectedSkills.map(skill => skill.name).join(', ')}
                </Text>
              )}
            </SummaryItem>
          )}
        </div>

        <div className={classes.section}>
          <Text
            as="h3"
            variant="title-small"
            weight="bold"
            className={classes.sectionTitle}
          >
            Tools
          </Text>
          <Text as="p" color="secondary" className={classes.sectionDescription}>
            The toolset this agent declares, and what it resolves to for you
            right now. Resolution happens per person: someone with access to
            more servers sees more through the same agent, never less than the
            toolset allows.
          </Text>
          <Flex direction="column" gap="3">
            {shape === 'full' && (
              <Alert
                status="warning"
                title="Full gateway access"
                description="This agent can discover and call every tool the gateway exposes to whoever invokes it — platform administration included."
              />
            )}
            {shape === 'none' && (
              <Alert
                status="info"
                title="No tools"
                description="A chat-only agent: the release carries no gateway entry."
              />
            )}
            {unsignedServers.length > 0 && (
              <Alert
                status="info"
                title="Selected without a sign-in"
                description={`${unsignedServers.join(
                  ', ',
                )} — part of the toolset, resolving for the people who have access to them. The list below is incomplete for you until you sign in to them.`}
              />
            )}
            <ToolsetResolutionList resolution={resolution} servers={servers} />
          </Flex>
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
            as shown, as you: the{' '}
            <span className={classes.code}>AgentTemplate</span> kagent runs the
            agent from and, when a toolset is declared, the{' '}
            <span className={classes.code}>RemoteMCPServer</span> copy of the
            gateway that carries it.
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
                yourself? Save the resources above as one file and run the
                command once against the cluster.
              </Text>
              <CodeBlock content={applyCommand} />
            </div>
          </details>
        </div>
      </div>
    </Content>
  );
}
