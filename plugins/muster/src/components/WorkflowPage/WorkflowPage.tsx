import { ReactElement, ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { Link, Text } from '@backstage/ui';
import {
  BreadcrumbItem,
  countNoun,
  EmptyStateCard,
  type Fact,
  LoadingIndicator,
  MoreActionsMenu,
  type MoreActionsMenuItem,
  Mono,
  ShellDocumentTitle,
  ShellPage,
  ShellPageBadgeSkeleton,
  useFactTextVariant,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
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
import {
  findReferencedBy,
  WORKFLOW_TOOL_PREFIX,
} from '../../lib/workflowReferences';
import { serversOfTools, toolsOfWorkflow } from '../../lib/workflowTools';
import { mcpServerDisplayNames } from '../../lib/serverGrouping';
import {
  customizeExternalRouteRef,
  workflowDetailRouteRef,
} from '../../routes';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { EffectBadge, SessionGate, StateBadge } from '../shared';
// Imported directly: the shared barrel stays free of flux-react.
import { GitOpsEditDialog } from '../shared/GitOpsEditDialog';
import { WorkflowDetailsTab } from './WorkflowDetailsTab';
import { WorkflowManifestDialog } from './WorkflowManifestDialog';
import { WorkflowOverviewTab } from './WorkflowOverviewTab';
import { WorkflowRunTab } from './WorkflowRunTab';
import { workflowRunsAsCaller } from './WorkflowRunTab/workflowRunsAsCaller';
import { WorkflowUsageTab } from './WorkflowUsageTab';
import {
  WorkflowPageTarget,
  WorkflowPageTargetProvider,
} from './workflowPageTarget';
import { WORKFLOW_PAGE_TABS } from './workflowTabs';
import { useRunLeaveGuard } from './useRunLeaveGuard';
import { useWorkflowTool } from './useWorkflowTool';

export type WorkflowPageProps = {
  /**
   * Another plugin's action for this workflow, beside the page's title — the
   * `editAction` input of `sub-page:muster/workflows` (agent-platform's
   * hand-off to the workflow agent). It reads the workflow with
   * `useWorkflowPageTarget`.
   */
  editAction?: ReactElement;
};

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
  const variant = useFactTextVariant();
  const name = workflow.getName();
  const referencedBy = useMemo(
    () => findReferencedBy(name, workflows),
    [name, workflows],
  );
  if (referencedBy.length === 0) {
    return <Text variant={variant}>No other workflow</Text>;
  }
  return (
    <Text variant={variant}>
      {referencedBy.map((ref, index) => {
        const base = detailRoute?.({ name: ref.getName() });
        return (
          <span key={`${ref.cluster}/${ref.getName()}`}>
            {index > 0 && ', '}
            {base ? (
              <Link
                href={`${base}${installationSearch(ref.cluster)}`}
                variant={variant}
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
  const paths = useCustomizePaths();
  const basePath = useSplatBasePath();
  // The address's own query, as it is: the tab links and the redirect keep
  // it, the same while loading and once loaded.
  const { search } = useLocation();
  const { workflows, mcpServers, activeInstallationInfo, installationInfos } =
    useMusterInstance();
  const session = useMusterSession();
  const hasSession =
    session.authenticated || !(activeInstallationInfo?.requiresAuth ?? false);
  // The workflow's own installation, which a fallback by name may make
  // another than the active one.
  const perUserSession =
    installationInfos.find(info => info.name === installation)?.requiresAuth ??
    false;

  const name = workflow.getName();
  const toolName = `${WORKFLOW_TOOL_PREFIX}${name}`;
  const gitOps = isGitOpsManaged(workflow);
  const steps = workflow.getSteps();
  const args = Object.entries(workflow.getArgs());
  const category = workflow.getCategory();
  const prefixes = useMemo(() => serverPrefixInfos(mcpServers), [mcpServers]);
  const stepTools = useMemo(
    () => toolsOfWorkflow(workflow, workflows),
    [workflow, workflows],
  );
  const connectors = useMemo(
    () => serversOfTools(stepTools, prefixes),
    [stepTools, prefixes],
  );
  // Each MCPServer the steps call as Customize and the step lines name it: a
  // family member by its family, whichever member a step may reach.
  const connectorLabels = useMemo(() => {
    const labels = mcpServerDisplayNames(mcpServers);
    const familyOf = new Map(
      mcpServers.map(server => [server.getName(), server.getFamily()]),
    );
    return new Map(
      connectors.map(server => {
        const surface = familyOf.get(server) ?? server;
        return [server, labels.get(surface) ?? surface] as const;
      }),
    );
  }, [connectors, mcpServers]);
  const connectorsUsed = [...new Set(connectorLabels.values())]
    .sort()
    .join(', ');
  const asCaller = useMemo(
    () =>
      workflowRunsAsCaller(
        stepTools,
        workflows,
        prefixes,
        mcpServers,
        installation,
      ),
    [stepTools, workflows, prefixes, mcpServers, installation],
  );
  // A run records runs of this workflow and of each it runs as a step.
  const recordedWorkflows = useMemo(
    () => [
      name,
      ...stepTools
        .filter(tool => tool.startsWith(WORKFLOW_TOOL_PREFIX))
        .map(tool => tool.slice(WORKFLOW_TOOL_PREFIX.length)),
    ],
    [name, stepTools],
  );

  // The badge and the Run it tab's form both read the workflow's tool.
  const workflowTool = useWorkflowTool(name, installation, hasSession);
  const effect = workflowTool.tool ? toolEffect(workflowTool.tool) : undefined;

  // A run in flight shows its result only on Run it: leaving asks first.
  const [running, setRunning] = useState(false);
  const leaveGuard = useRunLeaveGuard(running);

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
      value: <Mono>{toolName}</Mono>,
    },
    ...(connectors.length > 0
      ? [{ label: 'Connectors used', value: connectorsUsed }]
      : []),
    { label: 'Called as a step by', value: <CalledBy workflow={workflow} /> },
  ];

  // Each tab names what it needs the session for.
  const sessionGate = (context: string): ReactNode =>
    hasSession ? undefined : (
      <SessionGate
        session={session}
        installation={installation}
        context={context}
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
        tabs={WORKFLOW_PAGE_TABS}
        tabsSearch={search}
        onTabNavigate={leaveGuard.onTabNavigate}
      >
        <Routes>
          <Route
            index
            element={
              <WorkflowOverviewTab
                workflow={workflow}
                installation={installation}
                hasSession={hasSession}
                sessionGate={sessionGate(
                  'The last run on the flow and the read-only badge need a muster session.',
                )}
                prefixes={prefixes}
              />
            }
          />
          <Route
            path="run"
            element={
              <WorkflowRunTab
                installation={installation}
                connectorLabels={connectorLabels}
                toolName={toolName}
                hasSession={hasSession}
                perUserSession={perUserSession}
                sessionGate={sessionGate(
                  'Running a workflow needs a muster session.',
                )}
                workflowTool={workflowTool}
                asCaller={asCaller}
                connectors={connectors}
                recordedWorkflows={recordedWorkflows}
                onRunningChange={setRunning}
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
                sessionGate={sessionGate('Statistics need a muster session.')}
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
        <WorkflowManifestDialog
          workflow={workflow}
          isOpen={manifestOpen}
          onOpenChange={setManifestOpen}
        />
        {leaveGuard.dialog}
      </ShellPage>
    </WorkflowPageTargetProvider>
  );
}

/**
 * A workflow's page in the agent-platform shell. It has no create, edit or
 * delete forms: changes happen through Git or agents via muster, and the
 * page's one change action (`editAction`, where another plugin attaches one)
 * hands the workflow to the workflow agent. It runs the workflow, though, as
 * a tool's page runs a tool (decision D11, which kept the page read-only, is
 * reversed). Four tabs, each its own address under the page's:
 *
 * - **Overview** (the index): what it is for, when it was created, what it
 *   needs and how it runs (the flow canvas, coloured by the last run — a step
 *   expands in place to its details, the flow can go full screen).
 * - **Run it** (`run`): the tool page's argument form, Run button and result
 *   for the workflow's `workflow_<name>` tool.
 * - **Usage** (`usage`): its statistics — the last run, muster's run totals,
 *   rates and runs per day.
 * - **Details** (`details`): where it comes from and how agents call it, then
 *   the CR's bookkeeping in a "Technical details" fold-out.
 *
 * Any other address under the page's redirects to Overview, keeping its
 * query.
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
  const { search } = useLocation();
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
        tabs={WORKFLOW_PAGE_TABS}
        tabsSearch={search}
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
