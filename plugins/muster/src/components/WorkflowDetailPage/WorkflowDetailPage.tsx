import { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Content, EmptyState } from '@backstage/core-components';
import { Flex, Link } from '@backstage/ui';
import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import {
  Breadcrumbs,
  DateComponent,
  GSMarkdownContent,
  LoadingIndicator,
  RouteTabs,
  RouteTabSpec,
  useProvidePageHeaderActions,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { workflowsRouteRef } from '../../routes';
import { isGitOpsManaged } from '../../lib/gitops';
import {
  WorkflowDialog,
  WorkflowDialogs,
  WorkflowHeaderActions,
  WorkflowMutationActions,
} from '../WorkflowsListPage/WorkflowMutationActions';
import { useMusterInstance } from '../MusterInstanceProvider';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { AvailabilityBadge, StateBadge } from '../shared';
import { WorkflowOverviewTab } from './WorkflowOverviewTab';
import { WorkflowRunTab } from './WorkflowRunTab';

const useStyles = makeStyles((theme: Theme) => ({
  // Reading-capped column (mockup `max-w-5xl`).
  column: {
    maxWidth: 1024,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  title: {
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  headerActions: {
    marginTop: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  description: {
    marginTop: theme.spacing(1.5),
    maxWidth: '80ch',
    color: theme.palette.text.secondary,
  },
  metaRow: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.5, 3),
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
  mono: {
    fontFamily: 'monospace',
    color: theme.palette.text.primary,
  },
}));

const TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'run', path: 'run', title: 'Run' },
];

/** `?installation=<inst>`, or nothing without one. */
function installationSearch(installation?: string): string {
  return installation
    ? `?installation=${encodeURIComponent(installation)}`
    : '';
}

function WorkflowDetailContent() {
  const classes = useStyles();
  const { name = '' } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const installationParam = searchParams.get('installation') ?? undefined;
  const basePath = useSplatBasePath();
  const workflowsLink = useRouteRef(workflowsRouteRef);
  const { workflows, isLoading, activeInstallation } = useMusterInstance();

  const workflow = useMemo(() => {
    const byNameAndInstallation = workflows.find(
      w =>
        w.getName() === name &&
        (!installationParam || w.cluster === installationParam),
    );
    return byNameAndInstallation ?? workflows.find(w => w.getName() === name);
  }, [workflows, name, installationParam]);

  const installation = workflow?.cluster ?? installationParam;

  // A manually-added workflow's Edit and Delete sit in the page header; it
  // renders outside muster's providers, so it only opens the page's dialogs.
  const [dialog, setDialog] = useState<WorkflowDialog>();
  // A deleted workflow leaves the page; its dialog must not reopen should one
  // of the same name come back.
  useEffect(() => {
    if (!workflow) {
      setDialog(undefined);
    }
  }, [workflow]);
  const editable = Boolean(workflow && !isGitOpsManaged(workflow));
  const headerActions = useMemo(
    () => (editable ? <WorkflowHeaderActions onOpen={setDialog} /> : null),
    [editable],
  );
  useProvidePageHeaderActions(headerActions);
  const listHref = workflowsLink
    ? `${workflowsLink()}${installationSearch(installation ?? activeInstallation)}`
    : undefined;
  const trail = (
    <Breadcrumbs
      items={[{ label: 'Workflows', href: listHref }, { label: name }]}
    />
  );

  if (isLoading) {
    return (
      <Content>
        <ActiveInstallationNote />
        <LoadingIndicator label="Reading the workflow…" />
      </Content>
    );
  }

  if (!workflow) {
    return (
      <Content>
        <ActiveInstallationNote />
        <Flex direction="column" gap="4">
          {trail}
          <EmptyState
            missing="data"
            title={
              activeInstallation
                ? `No workflow “${name}” on ${activeInstallation}`
                : `No workflow “${name}”`
            }
            description={
              !activeInstallation
                ? 'None of the installations this portal knows runs muster.'
                : `The installation ${activeInstallation} has no Workflow CR with this name. It may run on another installation — pick it in the page header.`
            }
            action={
              listHref ? (
                <Link href={listHref}>Back to the workflows</Link>
              ) : undefined
            }
          />
        </Flex>
      </Content>
    );
  }

  const argEntries = Object.entries(workflow.getArgs());
  const steps = workflow.getSteps();
  const created = workflow.getCreatedTimestamp();
  const search = installationSearch(installation);

  return (
    <Content>
      <ActiveInstallationNote />

      <Flex direction="column" gap="4" className={classes.column}>
        {trail}

        <Box>
          <Box className={classes.titleRow}>
            <Typography variant="h4" className={classes.title}>
              {name}
            </Typography>
            <AvailabilityBadge available={workflow.isRunnable()} />
            {workflow.hasValidationWarning() && (
              <StateBadge tone="warning" label="Validation warning" />
            )}
          </Box>

          {workflow.getDescription() && (
            <GSMarkdownContent
              content={workflow.getDescription()!}
              className={classes.description}
            />
          )}

          <Box className={classes.metaRow}>
            <span>
              namespace{' '}
              <code className={classes.mono}>
                {workflow.getNamespace() ?? '—'}
              </code>
            </span>
            <span>
              {steps.length} step{steps.length === 1 ? '' : 's'} ·{' '}
              {argEntries.length} argument{argEntries.length === 1 ? '' : 's'}
            </span>
            {created && (
              <span>
                Created <DateComponent value={created} relative tooltip />
              </span>
            )}
          </Box>

          {!editable && (
            <Box className={classes.headerActions}>
              <WorkflowMutationActions workflow={workflow} />
            </Box>
          )}
        </Box>

        <RouteTabs tabs={TABS} search={search} />

        <Routes>
          <Route
            index
            element={
              <WorkflowOverviewTab
                workflow={workflow}
                workflows={workflows}
                installation={installation}
              />
            }
          />
          <Route
            path="run"
            element={
              <WorkflowRunTab workflow={workflow} installation={installation} />
            }
          />
          <Route
            path="*"
            element={<Navigate to={`${basePath}${search}`} replace />}
          />
        </Routes>
      </Flex>

      <WorkflowDialogs
        workflow={workflow}
        open={dialog}
        onClose={() => setDialog(undefined)}
      />
    </Content>
  );
}

/**
 * A workflow's page, beneath the Workflows tab: its header (state, description,
 * the edit and delete actions) over the tabs Overview (the index) and Run (the
 * argument form for its `workflow_<name>` tool). The structure comes from the
 * Workflow CR the MusterInstanceProvider loads; statistics and runs go through
 * the muster proxy.
 */
export function WorkflowDetailPage() {
  // Rendered inside the Workflows tab, which the workflows sub-page already
  // wraps in MusterProviders (shared muster instance + session) — so this is
  // just the content. The NFS app shell owns the plugin header and page scroll.
  return <WorkflowDetailContent />;
}
