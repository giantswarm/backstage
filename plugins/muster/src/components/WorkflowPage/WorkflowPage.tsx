import { ReactElement, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';

import { Alert, Box, Flex, Link, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useQuery } from '@tanstack/react-query';
import {
  BreadcrumbItem,
  countNoun,
  DateComponent,
  EmptyStateCard,
  FactsColumn,
  LoadingIndicator,
  SectionHeader,
  ShellDocumentTitle,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { MusterWorkflow } from '../../lib/k8s';
import {
  isGitOpsManaged,
  toManifestYaml,
  toWorkflowDefinition,
  toYaml,
} from '../../lib/gitops';
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
  EffectBadge,
  SessionGate,
  StateBadge,
} from '../shared';
import { WorkflowFlowCanvas } from './WorkflowFlowCanvas';
import { WorkflowRunAction } from './WorkflowRunAction';
import { WorkflowStatistics } from './WorkflowStatistics';
import {
  WorkflowPageTarget,
  WorkflowPageTargetProvider,
} from './workflowPageTarget';

const WORKFLOW_TOOL_PREFIX = 'workflow_';

export type WorkflowPageProps = {
  /**
   * Another plugin's action for this workflow, beside the page's title — the
   * `editAction` input of `sub-page:muster/workflows` (agent-platform's
   * hand-off to the workflow agent). It reads the workflow with
   * `useWorkflowPageTarget`.
   */
  editAction?: ReactElement;
};

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
    // Never wider than the row: a long default wraps inside its pill.
    minWidth: 0,
    maxWidth: '100%',
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
    boxSizing: 'border-box',
    minHeight: 20,
    maxWidth: '100%',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1.3,
    backgroundColor: theme.palette.action.selected,
    color: 'var(--bui-fg-secondary)',
  },
  // A default can be a long JSON object or URL; the list clips what
  // overflows it, so the value wraps instead of running out of sight.
  pillValue: {
    display: 'inline',
    minWidth: 0,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  // The Advanced disclosure's summary: a section-sized name over what it
  // holds. Spans, not a Flex: it renders inside the trigger's button.
  advancedSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    textAlign: 'left',
    padding: theme.spacing(0.5, 0),
  },
  advancedBody: {
    paddingTop: theme.spacing(1),
  },
  description: {
    margin: 0,
    overflowWrap: 'anywhere',
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
              <span className={classes.pill} data-testid="arg-default">
                <span className={classes.pillValue}>
                  default:{' '}
                  <code>
                    {typeof def.default === 'object'
                      ? JSON.stringify(def.default)
                      : String(def.default)}
                  </code>
                </span>
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
 * The technical-details block: the CR's namespace and labels, the exact
 * referenced tools, and the raw definition YAML (muster's `/workflows/:name`
 * already returns it; without a session the CR manifest stands in). It sits
 * inside the page's Advanced disclosure, which mounts it — and so reads the
 * definition — only when opened.
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
  editAction,
}: {
  workflow: MusterWorkflow;
  installation?: string;
} & WorkflowPageProps) {
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
  const description = workflow.getDescription();
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

  const target = useMemo<WorkflowPageTarget>(
    () => ({
      name,
      installation,
      toolName,
      gitOps,
      definitionYaml: toYaml(toWorkflowDefinition(workflow)),
    }),
    [name, installation, toolName, gitOps, workflow],
  );

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
    <WorkflowPageTargetProvider target={target}>
      <ShellPage
        title={name}
        breadcrumbs={breadcrumbs}
        actions={
          <>
            <WorkflowRunAction
              name={name}
              toolName={toolName}
              installation={installation}
              hasSession={hasSession}
            />
            {editAction}
          </>
        }
        badges={
          <>
            {effect && <EffectBadge effect={effect} subject="workflow" />}
            {workflow.hasValidationWarning() && (
              <StateBadge tone="warning" label="Validation warning" />
            )}
          </>
        }
        meta={`${countNoun(steps.length, 'step')} · ${
          args.length
        } input${args.length === 1 ? '' : 's'}`}
        // No description in the header — the agent and skill pages carry none
        // either (T53): a long one takes the title block's whole row, and the
        // header's actions then wrap under it at the left. It opens the
        // content instead.
        aside={<FactsColumn facts={facts} aria-label="Workflow details" />}
      >
        <Flex direction="column" gap="6">
          {description && (
            // Plain text, not GSMarkdownContent: the definition's description
            // is a sentence, and the page renders it as written.
            <Text
              as="p"
              variant="body-medium"
              color="secondary"
              className={classes.description}
            >
              {description}
            </Text>
          )}
          {!hasSession && (
            <SessionGate
              session={session}
              installation={installation}
              context="Running it, its statistics, the last run and the read-only badge need a muster session."
            />
          )}

          {workflow.hasValidationWarning() && (
            <Alert
              status="warning"
              description={
                <>
                  muster's validator flagged this definition. The workflow can
                  still run.
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
              as="h2"
              variant="title-x-small"
              title="What it needs"
              description="An agent passes these inputs when running it."
            />
            <ArgumentsList workflow={workflow} />
          </Box>

          <Box>
            <SectionHeader
              as="h2"
              variant="title-x-small"
              title="How it runs"
              description="Steps in order. A step whose condition does not hold is skipped — there is no branching."
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
              as="h2"
              variant="title-x-small"
              title="Statistics"
              description="Every run counts, whether an agent, another workflow or a person started it."
            />
            <WorkflowStatistics
              name={name}
              installation={installation}
              hasSession={hasSession}
            />
          </Box>

          <DisclosureAccordion
            summary={
              <span className={classes.advancedSummary}>
                <Text as="span" variant="body-large" weight="bold">
                  Advanced
                </Text>
                <Text as="span" variant="body-small" color="secondary">
                  Shows where agents use it, the raw definition and the CR's
                  bookkeeping.
                </Text>
              </span>
            }
          >
            <Flex direction="column" gap="6" className={classes.advancedBody}>
              <Box>
                <SectionHeader
                  variant="title-x-small"
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
                  variant="title-x-small"
                  title="Technical details"
                  description="Shows the bookkeeping, referenced tools and the raw definition."
                />
                <TechnicalDetails
                  workflow={workflow}
                  installation={installation}
                  hasSession={hasSession}
                />
              </Box>
            </Flex>
          </DisclosureAccordion>
        </Flex>
      </ShellPage>
    </WorkflowPageTargetProvider>
  );
}

/**
 * A workflow's page in the agent-platform shell. Its definition is read-only
 * here (decision D11): no create, edit or delete forms; changes happen through
 * Git or agents via muster, and the page's one change action (`editAction`,
 * where another plugin attaches one) hands the workflow to the workflow
 * agent. "Run now" runs it as the signed-in person. Plain level,
 * in order: what it needs, how it runs (the flow canvas, coloured by the last
 * run — a step expands in place to its details, the flow can go full
 * screen), and its statistics (the last run, muster's run totals, rates and
 * runs per day). Everything else is one "Advanced" disclosure at the bottom:
 * where agents use it and the technical details (the CR's bookkeeping and
 * the raw definition). Technical detail is disclosed where it belongs, never
 * by a page-wide toggle: each step's own fold-out (exact tool, templated
 * arguments, condition spec) and the Advanced disclosure.
 */
export function WorkflowPage({ editAction }: WorkflowPageProps = {}) {
  const { name = '' } = useParams<{ name: string }>();
  // Set here, above every state the page can be in, so a client-side visit
  // never keeps the previous page's title (live round 2, R5) — the same form
  // as an agent's page: "<name> · Agents · Agent Platform".
  return (
    <>
      <ShellDocumentTitle title={[name, 'Workflows']} />
      <WorkflowPageBody name={name} editAction={editAction} />
    </>
  );
}

function WorkflowPageBody({
  name,
  editAction,
}: { name: string } & WorkflowPageProps) {
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
    // The loaded page's frame from the first paint — trail, badge row, facts
    // column — with skeletons where the read will fill in (T95).
    return (
      <ShellPage
        title={name}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Workflows', href: paths.workflows },
          { label: name },
        ]}
        badges={<ShellPageBadgeSkeleton />}
        aside={<ShellPageFactsSkeleton />}
      >
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
        <EmptyStateCard
          title={
            activeInstallation
              ? `No workflow “${name}” on ${activeInstallation}`
              : `No workflow “${name}”`
          }
          description={
            activeInstallation
              ? 'It may be on another environment, or removed.'
              : "None of this portal's environments runs muster."
          }
          actions={
            paths.workflows ? (
              <Link href={paths.workflows}>Back to workflows</Link>
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
      editAction={editAction}
    />
  );
}
