import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { EmptyState } from '@backstage/core-components';
import { Alert, Box, Flex, Link, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import BarChart from '@material-ui/icons/BarChart';
import Code from '@material-ui/icons/Code';
import History from '@material-ui/icons/History';
import FormatListNumbered from '@material-ui/icons/FormatListNumbered';
import Share from '@material-ui/icons/Share';
import Tune from '@material-ui/icons/Tune';
import { useQuery } from '@tanstack/react-query';
import {
  BreadcrumbItem,
  DateComponent,
  FactsColumn,
  LoadingIndicator,
  ShellPage,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { MusterWorkflow } from '../../lib/k8s';
import { isGitOpsManaged, toManifestYaml } from '../../lib/gitops';
import { toolEffect } from '../../lib/toolAnnotations';
import { serverPrefixInfos } from '../../lib/toolGrouping';
import { findReferencedBy } from '../../lib/workflowReferences';
import { serversOfTools, toolsOfWorkflow } from '../../lib/workflowTools';
import {
  customizeExternalRouteRef,
  workflowDetailRouteRef,
} from '../../routes';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import {
  DisclosureAccordion,
  SectionHeader,
  SessionGate,
  StateBadge,
} from '../shared';
import { WorkflowStatsPanel } from '../WorkflowDetailPage/WorkflowStatsPanel';
import { WorkflowEffectBadge } from './WorkflowEffectBadge';
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas';
import { useRunCounts } from './useRecentRuns';
import { WorkflowRunsSection } from './WorkflowRunsSection';

const WORKFLOW_TOOL_PREFIX = 'workflow_';

const useStyles = makeStyles((theme: Theme) => ({
  argList: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  argRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1.25, 1.5),
    borderTop: '1px solid var(--bui-border-1)',
    '&:first-child': { borderTop: 'none' },
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing(1.5),
    },
  },
  argHead: {
    flexShrink: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    backgroundColor: theme.palette.action.selected,
    color: 'var(--bui-fg-secondary)',
  },
  pillRequired: {
    backgroundColor: 'transparent',
    border: '1px solid var(--bui-border-1)',
    color: theme.palette.warning.dark,
  },
}));

/** The shell's Customize page and its Workflows tab, where the app binds them. */
function useCustomizePaths(): { customize?: string; workflows?: string } {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  return {
    customize,
    workflows: customize ? `${customize}/workflows` : undefined,
  };
}

/** `?installation=<inst>`, or nothing without one. */
function installationSearch(installation?: string): string {
  return installation
    ? `?installation=${encodeURIComponent(installation)}`
    : '';
}

/** The workflow's inputs as a friendly list: name, type, required, default. */
function ArgumentsList({ workflow }: { workflow: MusterWorkflow }) {
  const classes = useStyles();
  const entries = Object.entries(workflow.getArgs());
  if (entries.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        This workflow takes no inputs.
      </Text>
    );
  }
  return (
    <div className={classes.argList}>
      {entries.map(([name, def]) => (
        <div key={name} className={classes.argRow}>
          <div className={classes.argHead}>
            <code className={classes.mono}>{name}</code>
            <span className={classes.pill}>{def.type ?? 'string'}</span>
            {def.required && (
              <span className={`${classes.pill} ${classes.pillRequired}`}>
                required
              </span>
            )}
            {def.default !== undefined && (
              <span className={classes.pill}>
                default:&nbsp;
                <code>
                  {typeof def.default === 'object'
                    ? JSON.stringify(def.default)
                    : String(def.default)}
                </code>
              </span>
            )}
          </div>
          {def.description && (
            <Text variant="body-small" color="secondary">
              {def.description}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The technical-details block: the raw definition YAML (muster's
 * `/workflows/:name` already returns it; without a session the CR manifest
 * stands in), the exact referenced tools, and the CR's namespace and labels.
 */
function TechnicalDetails({
  workflow,
  installation,
  hasSession,
}: {
  workflow: MusterWorkflow;
  installation?: string;
  hasSession: boolean;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const name = workflow.getName();
  const { data, isLoading } = useQuery({
    queryKey: ['muster', 'workflow-definition', installation, name],
    queryFn: () => musterApi.getWorkflow(name, installation),
    enabled: hasSession,
  });

  const yaml =
    data?.yaml ?? (hasSession ? undefined : toManifestYaml(workflow));
  const referencedTools = workflow.getReferencedTools();
  const labels = Object.entries(workflow.getLabels() ?? {});

  return (
    <Flex direction="column" gap="3">
      <Text as="p" variant="body-small" color="secondary">
        Namespace{' '}
        <code className={classes.mono}>{workflow.getNamespace() ?? '—'}</code>
        {labels.length > 0 && (
          <>
            {' · labels '}
            {labels.map(([key, value], index) => (
              <span key={key}>
                {index > 0 && ', '}
                <code className={classes.mono}>
                  {key}={value}
                </code>
              </span>
            ))}
          </>
        )}
      </Text>
      {referencedTools.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          Referenced tools:{' '}
          {referencedTools.map((tool, index) => (
            <span key={tool}>
              {index > 0 && ', '}
              <code className={classes.mono}>{tool}</code>
            </span>
          ))}
        </Text>
      )}
      {isLoading && <LoadingIndicator label="Reading the definition…" />}
      {yaml && (
        <YamlEditorFormField
          label="Definition (YAML)"
          value={yaml}
          readOnly
          height={360}
          maxHeight={360}
        />
      )}
    </Flex>
  );
}

function WorkflowPageContent({
  workflow,
  installation,
}: {
  workflow: MusterWorkflow;
  installation?: string;
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const paths = useCustomizePaths();
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  const { workflows, mcpServers, activeInstallationInfo } = useMusterInstance();
  const session = useMusterSession();
  const hasSession =
    session.authenticated || !(activeInstallationInfo?.requiresAuth ?? false);

  const name = workflow.getName();
  const toolName = `${WORKFLOW_TOOL_PREFIX}${name}`;
  const gitOps = isGitOpsManaged(workflow);
  const steps = workflow.getSteps();
  const onFailure = workflow.getOnFailureSteps();
  const args = Object.entries(workflow.getArgs());
  const created = workflow.getCreatedTimestamp();
  const category = workflow.getCategory();
  const validationErrors = workflow.getValidationErrors();
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const referencedBy = useMemo(
    () => findReferencedBy(name, workflows),
    [name, workflows],
  );
  const connectors = useMemo(
    () => serversOfTools(toolsOfWorkflow(workflow, workflows), prefixes),
    [workflow, workflows, prefixes],
  );

  // The read-only hint is derived per session by the aggregator on the
  // workflow's tool, so it is read off the tools endpoint, never the CR.
  const toolQuery = useQuery({
    queryKey: ['muster', 'workflow-tool', installation, toolName],
    queryFn: () => musterApi.describeTool(toolName, installation),
    enabled: hasSession,
    staleTime: 30_000,
  });
  const effect = toolQuery.data ? toolEffect(toolQuery.data) : undefined;
  // muster's own per-status totals: the run list itself stays a handful.
  const runCounts = useRunCounts(name, installation, hasSession);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: paths.customize },
    { label: 'Workflows', href: paths.workflows },
    { label: name },
  ];

  const facts = [
    {
      label: 'Source',
      value: gitOps ? (
        <Text variant="body-small">
          GitOps — changed through Git and agents, not here
        </Text>
      ) : (
        <Text variant="body-small">
          Manually added — changed by agents through muster, not here
        </Text>
      ),
    },
    ...(category ? [{ label: 'Category', value: category }] : []),
    {
      label: 'Tool name',
      value: <code className={classes.mono}>{toolName}</code>,
    },
    ...(runCounts
      ? [
          {
            label: 'Runs',
            value: (
              <Text variant="body-small">
                {runCounts.succeeded.toLocaleString('en-US')} succeeded ·{' '}
                {runCounts.failed.toLocaleString('en-US')} failed
              </Text>
            ),
          },
        ]
      : []),
    ...(created
      ? [
          {
            label: 'Created',
            value: <DateComponent value={created} relative tooltip />,
          },
        ]
      : []),
  ];

  return (
    <ShellPage
      title={name}
      breadcrumbs={breadcrumbs}
      badges={
        <>
          {effect && <WorkflowEffectBadge effect={effect} />}
          {workflow.hasValidationWarning() && (
            <StateBadge tone="warning" label="Validation warning" />
          )}
        </>
      }
      meta={`${steps.length} step${steps.length === 1 ? '' : 's'} · ${
        args.length
      } input${args.length === 1 ? '' : 's'}`}
      // Plain text, not GSMarkdownContent: ShellPage wraps the description in
      // a `<p>`, and a markdown block's `<div>` inside it is invalid HTML.
      description={workflow.getDescription()}
      aside={<FactsColumn facts={facts} aria-label="Workflow details" />}
    >
      <Flex direction="column" gap="6">
        {!hasSession && (
          <SessionGate
            session={session}
            installation={installation}
            context="Run history, statistics and the read-only badge are read through your muster session."
          />
        )}

        {workflow.hasValidationWarning() && (
          <Alert
            status="warning"
            description={
              <>
                muster's validator flagged this workflow's definition. It can
                still run — this is a non-blocking warning.
                {validationErrors.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {validationErrors.map(error => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}
              </>
            }
          />
        )}

        <Box>
          <SectionHeader
            icon={<Tune />}
            title="What it needs"
            description="The inputs an agent passes when it runs this workflow."
          />
          <ArgumentsList workflow={workflow} />
        </Box>

        <Box>
          <SectionHeader
            icon={<FormatListNumbered />}
            title="How it runs"
            description="The steps, in order. A step with a condition is skipped when the condition does not hold — it never branches to another path."
          />
          <WorkflowFlowCanvas
            name={name}
            steps={steps}
            onFailure={onFailure}
            prefixes={prefixes}
            installation={installation}
            hasSession={hasSession}
          />
        </Box>

        <Box>
          <SectionHeader
            icon={<History />}
            title="Recent runs"
            description="Every run counts, whether an agent, another workflow or a person started it."
          />
          <WorkflowRunsSection
            name={name}
            installation={installation}
            hasSession={hasSession}
            prefixes={prefixes}
          />
        </Box>

        <Box>
          <SectionHeader
            icon={<BarChart />}
            title="Statistics"
            description="How often this workflow runs and how reliably, over a recent sample of its executions."
          />
          {hasSession ? (
            <WorkflowStatsPanel name={name} installation={installation} />
          ) : (
            <Text as="p" variant="body-medium" color="secondary">
              Statistics are read through your muster session — connect above to
              see them.
            </Text>
          )}
        </Box>

        <Box>
          <SectionHeader
            icon={<Share />}
            title="Where agents use it"
            description={`Agents run this workflow by calling the tool ${toolName}.`}
          />
          <Flex direction="column" gap="2">
            {connectors.length > 0 && (
              <Text as="p" variant="body-medium" color="secondary">
                Its steps use tools from: {connectors.join(', ')}.
              </Text>
            )}
            {referencedBy.length > 0 ? (
              <Text as="p" variant="body-medium" color="secondary">
                Called as a step by:{' '}
                {referencedBy.map((ref, index) => {
                  const base = detailRoute?.({ name: ref.getName() });
                  return (
                    <span key={`${ref.cluster}/${ref.getName()}`}>
                      {index > 0 && ', '}
                      {base ? (
                        <Link
                          href={`${base}${installationSearch(ref.cluster)}`}
                          variant="body-medium"
                        >
                          {ref.getName()}
                        </Link>
                      ) : (
                        ref.getName()
                      )}
                    </span>
                  );
                })}
              </Text>
            ) : (
              <Text as="p" variant="body-medium" color="secondary">
                No other workflow calls this one as a step.
              </Text>
            )}
          </Flex>
        </Box>

        <Box>
          <SectionHeader
            icon={<Code />}
            title="Technical details"
            description="The raw definition and the CR's bookkeeping."
          />
          <DisclosureAccordion summary="Show the raw definition">
            <TechnicalDetails
              workflow={workflow}
              installation={installation}
              hasSession={hasSession}
            />
          </DisclosureAccordion>
        </Box>
      </Flex>
    </ShellPage>
  );
}

/**
 * A workflow's page in the agent-platform shell — read-only by decision D11:
 * no create, edit or delete affordances; changes happen through Git or agents
 * via muster. Plain level: what it needs, how it runs (the flow canvas — a
 * step opens its details on click), the latest few runs, statistics and where
 * agents use it. Technical detail is disclosed where it belongs, never by a
 * page-wide toggle: each step's own fold-out (exact tool, templated
 * arguments, condition spec), each run's (execution JSON), and the raw
 * definition at the bottom.
 */
export function WorkflowPage() {
  const { name = '' } = useParams<{ name: string }>();
  // Set here, above every state the page can be in, so a client-side visit
  // never keeps the previous page's title (live round 2, R5) — the same form
  // as an agent's page: "<name> · Agents · Agent Platform".
  return (
    <>
      <Helmet title={`${name} · Workflows · Agent Platform`} />
      <WorkflowPageBody name={name} />
    </>
  );
}

function WorkflowPageBody({ name }: { name: string }) {
  const [searchParams] = useSearchParams();
  const installationParam = searchParams.get('installation') ?? undefined;
  const paths = useCustomizePaths();
  const { workflows, isLoading, isLoadingInstallations, activeInstallation } =
    useMusterInstance();

  const workflow = useMemo(() => {
    const byNameAndInstallation = workflows.find(
      w =>
        w.getName() === name &&
        (!installationParam || w.cluster === installationParam),
    );
    return byNameAndInstallation ?? workflows.find(w => w.getName() === name);
  }, [workflows, name, installationParam]);

  if (isLoadingInstallations || isLoading) {
    return (
      <ShellPage title={name}>
        <LoadingIndicator label="Reading the workflow…" />
      </ShellPage>
    );
  }
  if (!workflow) {
    return (
      <ShellPage
        title={name}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Workflows', href: paths.workflows },
          { label: name },
        ]}
      >
        <EmptyState
          missing="data"
          title={
            activeInstallation
              ? `No workflow “${name}” on ${activeInstallation}`
              : `No workflow “${name}”`
          }
          description={
            activeInstallation
              ? `The environment ${activeInstallation} has no workflow with this name. It may run on another environment, or it may have been removed.`
              : 'None of the environments this portal knows runs muster.'
          }
          action={
            paths.workflows ? (
              <Link href={paths.workflows}>Back to the workflows</Link>
            ) : undefined
          }
        />
      </ShellPage>
    );
  }

  return (
    <WorkflowPageContent
      key={`${workflow.cluster}/${name}`}
      workflow={workflow}
      installation={workflow.cluster ?? installationParam}
    />
  );
}
