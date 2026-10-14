import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';

import { Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useQuery } from '@tanstack/react-query';
import {
  BreadcrumbItem,
  countNoun,
  DateComponent,
  EmptyStateCard,
  type Fact,
  LoadingIndicator,
  ManifestDialog,
  MoreActionsMenu,
  type MoreActionsMenuItem,
  RouteTabSpec,
  ShellDocumentTitle,
  ShellPage,
  ShellPageBadgeSkeleton,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { toKubectlYaml } from '@giantswarm/backstage-plugin-kubernetes-react';
import { musterApiRef } from '../../apis';
import { MusterWorkflow } from '../../lib/k8s';
import {
  isFluxReconciled,
  isGitOpsManaged,
  readProvenance,
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
import { EffectBadge, SessionGate, StateBadge } from '../shared';
// Imported directly: the shared barrel stays free of flux-react.
import { GitOpsEditDialog } from '../shared/GitOpsEditDialog';
import { WorkflowDetailsTab } from './WorkflowDetailsTab';
import { WorkflowOverviewTab } from './WorkflowOverviewTab';
import { WorkflowUsageTab } from './WorkflowUsageTab';
import {
  WorkflowPageTarget,
  WorkflowPageTargetProvider,
} from './workflowPageTarget';

const WORKFLOW_TOOL_PREFIX = 'workflow_';

/** The page's tabs; Overview is the index, so the page's own address. */
const TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'usage', path: 'usage', title: 'Usage' },
  { id: 'details', path: 'details', title: 'Details' },
];

export type WorkflowPageProps = {
  /**
   * Another plugin's action for this workflow, beside the page's title — the
   * `editAction` input of `sub-page:muster/workflows` (agent-platform's
   * hand-off to the workflow agent). It reads the workflow with
   * `useWorkflowPageTarget`.
   */
  editAction?: ReactElement;
};

const useStyles = makeStyles({
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all',
  },
});

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

/** The other workflows that run this one as a step, linked to their pages. */
function CalledBy({ workflow }: { workflow: MusterWorkflow }) {
  const detailRoute = useRouteRef(workflowDetailRouteRef);
  const { workflows } = useMusterInstance();
  const name = workflow.getName();
  const referencedBy = useMemo(
    () => findReferencedBy(name, workflows),
    [name, workflows],
  );
  if (referencedBy.length === 0) {
    return <Text variant="body-small">No other workflow</Text>;
  }
  return (
    <Text variant="body-small">
      {referencedBy.map((ref, index) => {
        const base = detailRoute?.({ name: ref.getName() });
        return (
          <span key={`${ref.cluster}/${ref.getName()}`}>
            {index > 0 && ', '}
            {base ? (
              <Link
                href={`${base}${installationSearch(ref.cluster)}`}
                variant="body-small"
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
  const basePath = useSplatBasePath();
  const { workflows, mcpServers, activeInstallationInfo } = useMusterInstance();
  const session = useMusterSession();
  const hasSession =
    session.authenticated || !(activeInstallationInfo?.requiresAuth ?? false);

  const name = workflow.getName();
  const toolName = `${WORKFLOW_TOOL_PREFIX}${name}`;
  const gitOps = isGitOpsManaged(workflow);
  const steps = workflow.getSteps();
  const args = Object.entries(workflow.getArgs());
  const created = workflow.getCreatedTimestamp();
  const category = workflow.getCategory();
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const connectors = useMemo(
    () => serversOfTools(toolsOfWorkflow(workflow, workflows), prefixes),
    [workflow, workflows, prefixes],
  );
  const search = installationSearch(installation);

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

  // The ⋮ menu: the manifest for every workflow and, where Flux reconciles
  // it, where in Git to change it, as on a GitOps-managed connector's page.
  // A chart installed by hand with `helm install` is not changed through Git.
  const [gitOpsOpen, setGitOpsOpen] = useState(false);
  const [manifestOpen, setManifestOpen] = useState(false);
  const inGit = isFluxReconciled(readProvenance(workflow));
  const manifest = useMemo(() => toKubectlYaml(workflow), [workflow]);
  const menu: MoreActionsMenuItem[] = [];
  if (inGit) {
    menu.push({
      id: 'edit-in-git',
      label: 'Edit in Git…',
      onAction: () => setGitOpsOpen(true),
    });
  }
  menu.push({
    id: 'view-manifest',
    label: 'View manifest',
    onAction: () => setManifestOpen(true),
  });

  const facts: Fact[] = [
    {
      label: 'Source',
      value: gitOps
        ? 'GitOps — changed through Git and agents, not here'
        : 'Manually added — changed by agents through muster, not here',
    },
    ...(category ? [{ label: 'Category', value: category }] : []),
    {
      label: 'Tool name',
      value: <code className={classes.mono}>{toolName}</code>,
    },
    ...(connectors.length > 0
      ? [{ label: 'Connectors used', value: connectors.join(', ') }]
      : []),
    { label: 'Called as a step by', value: <CalledBy workflow={workflow} /> },
    ...(created
      ? [
          {
            label: 'Created',
            value: <DateComponent value={created} relative tooltip />,
          },
        ]
      : []),
  ];

  const sessionGate: ReactNode = hasSession ? undefined : (
    <SessionGate
      session={session}
      installation={installation}
      context="Statistics, the last run and the read-only badge need a muster session."
    />
  );

  return (
    <WorkflowPageTargetProvider target={target}>
      <ShellPage
        title={name}
        breadcrumbs={breadcrumbs}
        actions={editAction}
        menu={<MoreActionsMenu items={menu} />}
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
        // header's actions then wrap under it at the left. Overview opens
        // with it instead.
        tabs={TABS}
        tabsSearch={search}
      >
        <Routes>
          <Route
            index
            element={
              <WorkflowOverviewTab
                workflow={workflow}
                installation={installation}
                hasSession={hasSession}
                sessionGate={sessionGate}
                prefixes={prefixes}
              />
            }
          />
          <Route
            path="usage"
            element={
              <WorkflowUsageTab
                name={name}
                installation={installation}
                hasSession={hasSession}
                sessionGate={sessionGate}
              />
            }
          />
          <Route
            path="details"
            element={<WorkflowDetailsTab workflow={workflow} facts={facts} />}
          />
          {/* An address the page no longer has lands on Overview. */}
          <Route
            path="*"
            element={<Navigate to={`${basePath}${search}`} replace />}
          />
        </Routes>
        {inGit && (
          <GitOpsEditDialog
            resource={workflow}
            isOpen={gitOpsOpen}
            onOpenChange={setGitOpsOpen}
          />
        )}
        <ManifestDialog
          isOpen={manifestOpen}
          onOpenChange={setManifestOpen}
          title="Workflow manifest"
          manifest={manifest}
          description={
            workflow.cluster ? (
              <>
                As stored on cluster <strong>{workflow.cluster}</strong>, minus
                server-side-apply bookkeeping.
              </>
            ) : (
              'As stored on the cluster, minus server-side-apply bookkeeping.'
            )
          }
        />
      </ShellPage>
    </WorkflowPageTargetProvider>
  );
}

/**
 * A workflow's page in the agent-platform shell — read-only by decision D11:
 * no create, edit or delete forms; changes happen through Git or agents via
 * muster, and the page's one change action (`editAction`, where another
 * plugin attaches one) hands the workflow to the workflow agent. Three tabs,
 * each its own address under the page's:
 *
 * - **Overview** (the index): what it is for, when it was created, what it
 *   needs and how it runs (the flow canvas, coloured by the last run — a step
 *   expands in place to its details, the flow can go full screen).
 * - **Usage** (`usage`): its statistics — the last run, muster's run totals,
 *   rates and runs per day.
 * - **Details** (`details`): where it comes from and how agents call it, then
 *   the CR's bookkeeping in a "Technical details" fold-out.
 *
 * The ⋮ menu shows the CR's manifest and, for a workflow Flux reconciles,
 * where in Git to change it. Technical detail is disclosed where it belongs,
 * never by a page-wide toggle: each step's own fold-out (exact tool,
 * templated arguments, condition spec) and the Details tab's fold-out.
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
    // The loaded page's frame from the first paint — trail, badge row, tab
    // strip — with skeletons where the read will fill in (T95).
    return (
      <ShellPage
        title={name}
        breadcrumbs={[
          { label: 'Customize', href: paths.customize },
          { label: 'Workflows', href: paths.workflows },
          { label: name },
        ]}
        badges={<ShellPageBadgeSkeleton />}
        tabs={TABS}
        tabsSearch={installationSearch(installationParam)}
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
