import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { Link } from '@backstage/core-components';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex } from '@backstage/ui';
import {
  Agent,
  ErrorsProvider,
  isNotFoundError,
  ModelConfig,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  type BreadcrumbItem,
  DateComponent,
  EmptyStateCard,
  FactsColumn,
  LoadingIndicator,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
  type ShellPageProps,
  ShellPageTitleSkeleton,
  StatusDot,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import { useCreateSession } from '../../hooks/useCreateSession';
import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { useAgentDeletion } from '../../hooks/useAgentDeletion';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { useAgentToolset } from '../../hooks/useAgentToolset';
import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useUpdateAgent } from '../../hooks/useUpdateAgent';
import type { CommitAgentResult } from '../../lib/agentManager';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { AvatarSize } from '../../lib/agentAvatar';
import { clientLookupOf } from '../../lib/serving';
import { toolsetHasTools } from '../../lib/toolset';
import {
  agentEditRouteRef,
  agentsRouteRef,
  sessionDetailRouteRef,
} from '../../routes';
import {
  agentManagerSessionGate,
  AgentRow,
  getAgentRefetchInterval,
  ResolveModelServing,
  toAgentRow,
  TRANSITIONAL_REFETCH_INTERVAL_MS,
} from '../AgentsDataProvider';
import {
  READINESS_PRESENTATION,
  type ReadinessPresentation,
} from '../AgentsTable/readinessStatus';
import { NewSessionDialog } from '../NewSessionDialog';
import { isStartableAgent } from '../../lib/startableAgent';
import { ServingProvider, useServing } from '../ServingProvider';
import { toneOfIntent } from '../../lib/customize';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { AgentCreationProgress } from '../AgentCreationProgress';
import { AgentActionsMenu, agentWriteMode } from './AgentActionsMenu';
import { AgentDeleteDialog, isCommitSettled } from './AgentDeleteDialog';
import { agentTabs } from './AgentDetailTabs';
import { agentFacts, AgentPlainOverview } from './AgentPlainOverview';
import { AgentSessionBlocker } from './AgentSessionBlocker';
import { AgentSessionsCard } from './AgentSessionsCard';
import { AgentToolsetCard } from './AgentToolsetCard';
import { AgentUpdateSkillsDialog } from './AgentUpdateSkillsDialog';
import { AgentUsageTab } from './AgentUsageTab';
import { AgentAvatar } from '../AgentAvatar';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 8000;

/** Matches the list's row avatar: two lines of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 96;

/**
 * The header label for an agent whose HelmRelease exists but whose
 * Agent has not been rendered yet — before there is a readiness to
 * derive. Same neutral hourglass as "Pending", which is the state it becomes.
 */
const DEPLOYING_PRESENTATION: ReadinessPresentation = {
  label: 'Deploying',
  intent: 'neutral',
  icon: READINESS_PRESENTATION.pending.icon,
};

/**
 * Link back to the list.
 *
 * `useRouteRef` returns undefined when the route is not bound — which in practice
 * means the Agent Platform extension is disabled, and then this page isn't
 * rendering either. Rendering nothing is still better than hardcoding the path,
 * which would silently rot if the route moved.
 */
function BackToAgents({ children }: { children: ReactNode }) {
  const agentsRoute = useRouteRef(agentsRouteRef);
  if (!agentsRoute) {
    return null;
  }
  return <Link to={agentsRoute()}>{children}</Link>;
}

/**
 * Where an agent's page sits inside the shell: "Customize / Agents / <agent>",
 * on every tab, as on the connector and skill pages.
 */
function agentBreadcrumbs(title: string): BreadcrumbItem[] {
  return [
    { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
    { label: 'Agents', href: `${SHELL_CUSTOMIZE_PATH}/agents` },
    { label: title },
  ];
}

/**
 * The page's outer frame: the platform-standard page frame (`ShellPage`) —
 * breadcrumbs reading "Customize / Agents / <agent>", the agent's name as the
 * h1 at the standard scale with its avatar and readiness, its actions at the
 * header's right and the routed tabs under it.
 *
 * A component of its own so every exit — loading, deploying, not found,
 * unreadable, and the agent itself — gets the same frame.
 */
function AgentFrame({
  title,
  heading,
  children,
  ...shellProps
}: Omit<ShellPageProps, 'title' | 'breadcrumbs'> & {
  /** The shell header's h1, and the breadcrumbs' last entry. */
  title: string;
  /** The h1 instead of `title`, e.g. its skeleton while the agent is read. */
  heading?: ReactNode;
}) {
  return (
    <ShellPage
      title={heading ?? title}
      breadcrumbs={agentBreadcrumbs(title)}
      {...shellProps}
    >
      {children}
    </ShellPage>
  );
}

/** The derived readiness beside the title, tagged for the tests. */
function ReadinessBadge({ readiness }: { readiness: ReadinessPresentation }) {
  return (
    // Tagged because the derived readiness and the condition it came from
    // share a label ("Ready", "Ready") — this is the derived one.
    // A dot and its label, as the Customize list draws the same state and as
    // the model, session and connector headers draw theirs.
    <span data-testid="agent-readiness">
      <StatusDot
        tone={toneOfIntent(readiness.intent)}
        label={readiness.label}
      />
    </span>
  );
}

function AgentDetailPageContent() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const buildAvatarUrl = useAgentAvatarUrl();

  // Same two tiers as the list: tighten while the agent is converging, relax
  // once it settles or stays broken. This page is where someone watches an
  // agent come up, so the fast tier earns its keep here — and it starts before
  // the Agent exists: while agent-manager says the agent's HelmRelease is
  // there (`isDeploying` below), the read that will eventually find the
  // Agent polls at the fast tier too, instead of the 60 s the helper gives
  // "no data". A ref, because the flag is derived from this read's own outcome
  // and react-query re-evaluates the interval after every fetch.
  const isDeployingRef = useRef(false);
  const refetchInterval = useCallback(
    (query: Parameters<typeof getAgentRefetchInterval>[0]) =>
      isDeployingRef.current
        ? TRANSITIONAL_REFETCH_INTERVAL_MS
        : getAgentRefetchInterval(query),
    [],
  );

  const {
    resource: agent,
    isLoading,
    error,
    errors,
  } = useResource(
    installation,
    Agent,
    { name, namespace, enableDiscovery: false },
    { refetchInterval },
  );

  // "Not yet" against "not there". agent-manager's `create_agent` applies the
  // HelmRelease and returns; helm-controller renders the Agent a few
  // seconds later, and the create flow navigates here in between — so a 404 on
  // the Agent alone does not mean the agent is missing. agent-manager's
  // `get_agent_status` is the HelmRelease-aware read: by its contract it
  // answers `not_found` only when neither the Agent nor the HelmRelease
  // exists; otherwise it reports the release and its verdict. It is the read
  // the creation progress polls after Deploy anyway, runs as the signed-in
  // person (so it needs no Kubernetes read on HelmReleases), and survives a
  // reload of this URL. Asked only once the Agent read has come back empty;
  // without agent-manager on the installation nothing is asked and a 404 stays
  // "not found".
  const isAgentMissing = !isLoading && !agent && errors.some(isNotFoundError);
  const release = useAgentStatus(installation, namespace, name, {
    enabled: isAgentMissing,
  });
  const isDeploying =
    isAgentMissing &&
    (release.status?.helmRelease?.exists === true ||
      release.status?.agent?.exists === true);
  isDeployingRef.current = isDeploying;
  // The status read is still in flight: neither verdict is known, so neither
  // is shown.
  const isAskingAgentManager =
    isAgentMissing &&
    release.isSettling &&
    !release.status &&
    !release.isNotFound;

  // A targeted, namespaced read rather than ModelConfigsProvider's cluster-wide
  // list — that list is admin-only, so reusing it here would deny a non-admin the
  // model name on a page they can otherwise see in full.
  const modelConfigName = agent?.getModelConfigName();
  const { resource: modelConfig } = useResource(
    installation,
    ModelConfig,
    { name: modelConfigName ?? '', namespace, enableDiscovery: false },
    { enabled: Boolean(modelConfigName) },
  );

  // What the serving layer says about the model behind that ModelConfig — the
  // same verdict the Model configs and Agents views show, so "Idle" here is
  // "Idle" there.
  const { servingStateFor } = useServing();
  const resolveServing = useCallback<ResolveModelServing>(
    target => servingStateFor(installation, clientLookupOf(target)),
    [servingStateFor, installation],
  );

  // The row shape the sessions list uses, so this agent's name and avatar resolve
  // identically in both places — and, for the composer, the model's state.
  // Read here, ahead of the row: sessions start through agent-manager as the
  // person, like every write below, so the row carries whether one can, and
  // the header button, the dialog's composer and its option all read that.
  const availability = useAgentManagerAvailability(
    installation ? [installation] : [],
  );
  const agentRow = useMemo(
    () =>
      agent
        ? {
            ...toAgentRow(
              agent,
              modelConfig ? [modelConfig] : [],
              resolveServing,
            ),
            ...agentManagerSessionGate(availability, installation),
          }
        : undefined,
    [agent, modelConfig, resolveServing, availability, installation],
  );
  const sessions = useAgentSessions(installation, namespace, name, agentRow);

  // The write actions — Delete, Edit, Update skills — go through agent-manager
  // over muster as the signed-in person, and are offered when the installation's
  // muster lists agent-manager and the agent is written live — or, for one
  // applied from git, through a pull request when agent-manager can commit
  // (authorization stays the apiserver's, reached through agent-manager).
  // Called here rather than inside the menu: the menu is rendered in the shared
  // plugin header, outside this plugin's `QueryClientProvider`, so react-query
  // has no client there. The dialogs are rendered in the page body for the same
  // reason.
  const presence = availability.presenceOf(installation);
  const isAgentManagerReachable =
    !availability.isUnavailable && presence === 'available';

  // Whether a live write is possible at all, in agent-manager's own words:
  // `managed: 'gitops'` means the agent's HelmRelease is applied by a Flux
  // Kustomization, so every write is refused and its desired state belongs in
  // the GitOps repository. Deliberately not `isGitOpsManaged(agent)` from the
  // labels — that answers "is a reconciler in charge", which is true of every
  // agent this plugin deploys, since the create flow applies a HelmRelease of
  // its own. A read that settles without an answer — not connected, refused —
  // leaves the actions offered: agent-manager then refuses on confirm, as it
  // did before. One still in flight withholds them instead, so they are not
  // shown for a muster round-trip and then taken back.
  const { agent: managerAgent, isLoading: isReadingManagerAgent } =
    useAgentManagerAgent(installation, namespace, name, {
      enabled: isAgentManagerReachable,
    });

  // Commit (a pull request instead of a live write, giantswarm/agent-manager#24)
  // when agent-manager reports the capability — the only way to edit or delete
  // an agent applied from git, and meaningless for any other: a pull request
  // goes to the repository that owns the release, and only those have one.
  const { info: agentManagerInfo, isLoading: isReadingManagerInfo } =
    useAgentManagerInfo(presence === 'available' ? installation : undefined);
  const isGitOpsOwned = managerAgent?.managed === 'gitops';
  const canCommit = agentManagerInfo?.capabilities?.commit === true;

  const agentManagerGate = useMemo(
    () => ({
      presence,
      isUnavailable: availability.isUnavailable,
      isGitOpsOwned,
      canCommit,
      isVerdictPending:
        isReadingManagerAgent || (isGitOpsOwned && isReadingManagerInfo),
    }),
    [
      presence,
      availability.isUnavailable,
      isGitOpsOwned,
      canCommit,
      isReadingManagerAgent,
      isReadingManagerInfo,
    ],
  );

  const writeMode = agentWriteMode(agentManagerGate);
  /**
   * Edit and Update skills are also offered for an agent applied from git when
   * agent-manager can commit: the Edit agent page and the Update skills dialog
   * then open a pull request instead of writing live.
   */
  const canEditAgent = writeMode !== undefined;

  const deletion = useAgentDeletion(installation, namespace, name);
  const updating = useUpdateAgent(installation);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'apply' | 'commit'>('apply');
  const [isUpdateSkillsOpen, setUpdateSkillsOpen] = useState(false);
  const [updateSkillsMode, setUpdateSkillsMode] = useState<'apply' | 'commit'>(
    'apply',
  );
  const [commitResult, setCommitResult] = useState<CommitAgentResult>();
  const toastApi = useApi(toastApiRef);
  const agentsRoute = useRouteRef(agentsRouteRef);
  const agentEditRoute = useRouteRef(agentEditRouteRef);
  const location = useLocation();

  const { reset: resetDeletion } = deletion;
  const openDelete = useCallback(() => {
    // The menu's answer, fixed while the dialog is open, so a re-read of the
    // verdict cannot swap its action under the cursor.
    const mode = agentWriteMode(agentManagerGate);
    if (!mode) {
      return;
    }
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it. A pull request it already opened stays: the agent is only
    // gone once that is merged, and a second one would duplicate it.
    resetDeletion();
    setCommitResult(previous =>
      previous && isCommitSettled(previous) ? previous : undefined,
    );
    setDeleteMode(mode);
    setDeleteOpen(true);
  }, [agentManagerGate, resetDeletion]);
  const { reset: resetUpdating } = updating;
  const openUpdateSkills = useCallback(() => {
    // Fixed while the dialog is open, like Delete's: a re-read of the verdict
    // cannot swap a live write for a pull request (or back) under the cursor.
    const mode = agentWriteMode(agentManagerGate);
    if (!mode) {
      return;
    }
    resetUpdating();
    setUpdateSkillsMode(mode);
    setUpdateSkillsOpen(true);
  }, [agentManagerGate, resetUpdating]);

  // Starting a session from this page. The dialog itself is rendered in the page
  // body, not in the header: the header slot lives outside this plugin's
  // `QueryClientProvider`, so the create mutation has no client there. The button
  // up there can only flip this flag — the same split the session detail page's
  // rename dialog makes.
  const [isNewSessionOpen, setNewSessionOpen] = useState(false);
  const creation = useCreateSession('agentDetail');
  const { reset: resetCreation } = creation;
  const openNewSession = useCallback(() => {
    // Clear a previous attempt's error, so the dialog does not open still showing
    // it.
    resetCreation();
    setNewSessionOpen(true);
  }, [resetCreation]);

  // Only ever this agent, so the picker confirms the target rather than offering a
  // choice — and this page pays for no fleet-wide Agent query to populate one.
  const composerAgents = useMemo(
    () => (agentRow ? [agentRow] : []),
    [agentRow],
  );
  // Remembered for the sessions list's composer, which defaults to whatever was
  // started last — from either entry point.
  const { rememberAgent } = useLastUsedAgent(composerAgents);

  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  // This page is mounted at `…/:name/*`, so the base path is its own URL with
  // the tab segment removed — what the tab strip builds its hrefs from and
  // where an unknown sub-path is sent.
  const basePath = useSplatBasePath();
  // Whether the agent has tools decides the Tools tab, on every tab. The
  // carrier read is shared with the Overview's Connectors section and the
  // toolset card, so it runs once.
  const toolset = useAgentToolset(agent);

  const openEdit = useCallback(() => {
    const href = agentEditRoute?.({ installation, namespace, name });
    if (href) {
      navigate(href);
    }
  }, [agentEditRoute, installation, namespace, name, navigate]);

  const { deleteAgent, commit: commitDeletion } = deletion;
  const confirmDelete = useCallback(async () => {
    try {
      await deleteAgent();
    } catch {
      // Left to the dialog, which stays open and shows agent-manager's message
      // — a GitOps-owned or suspended release, a viewer's Forbidden. No toast:
      // the user is still looking at the modal they pressed Delete in.
      return;
    }
    setDeleteOpen(false);
    toastApi.post({
      // Deliberately not "Agent deleted": the HelmRelease has a finalizer, so
      // all that is certain here is that agent-manager's delete was accepted
      // and helm-controller has started uninstalling. The agent can still be in
      // the list for a few seconds.
      title: `Deleting agent "${agent?.getDisplayName() ?? name}"`,
      description:
        'Flux is uninstalling it; it may take a moment to leave the list.',
      status: 'success',
      // A ToastApi toast without a timeout is permanent, and this is an
      // acknowledgement, not something to dismiss by hand.
      timeout: TOAST_TIMEOUT_MS,
    });
    // An unbound route means the Agent Platform extension is disabled — in
    // which case this page is not rendering either.
    if (agentsRoute) {
      navigate(agentsRoute());
    }
  }, [deleteAgent, toastApi, agent, name, agentsRoute, navigate]);

  const commitDelete = useCallback(async () => {
    setCommitResult(undefined);
    try {
      setCommitResult(await commitDeletion());
    } catch {
      // Left to the dialog.
    }
  }, [commitDeletion]);

  // After Update skills the page watches the new revision converge exactly as
  // it does after a create — through the same handoff, on the same URL.
  const onSkillsUpdated = useCallback(
    (_skills: unknown, requestedBy?: string, fromGeneration?: number) => {
      toastApi.post({
        title: `Updating the skills of "${agent?.getDisplayName() ?? name}"`,
        description: 'Its Harness compiles a new revision.',
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
      navigate(
        { pathname: location.pathname, search: location.search },
        {
          replace: true,
          state: {
            [AGENT_CREATED_STATE_KEY]: {
              installation,
              namespace,
              name,
              requestedBy,
              action: 'skills-updated',
              fromGeneration,
            },
          },
        },
      );
    },
    [
      toastApi,
      agent,
      name,
      navigate,
      location.pathname,
      location.search,
      installation,
      namespace,
    ],
  );

  const { createSession } = creation;
  const onStartSession = useCallback(
    async (target: AgentRow, prompt: string) => {
      let sessionId: string;
      try {
        sessionId = await createSession({ agent: target, prompt });
      } catch {
        // Left to the dialog, which stays open and renders the hook's `error`
        // beside the prompt the user still has.
        return;
      }

      rememberAgent(target);

      const href = sessionDetailRoute?.({
        installation: target.installation,
        sessionId,
      });
      if (!href) {
        setNewSessionOpen(false);
        return;
      }

      // The prompt travels with the navigation and is sent by the session detail
      // page — see "Starting a session" in docs/agent-platform.md. Navigating
      // unmounts this dialog, which is how it closes.
      navigate(href, {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: prompt,
            agentNamespace: target.namespace,
            agentName: target.technicalName,
          },
        },
      });
    },
    [createSession, navigate, rememberAgent, sessionDetailRoute],
  );

  // `agent` is memoized on the fetched JSON, the gate on its two values, and the
  // handlers are stable, so this element's identity only changes when one of
  // them actually does — which is what keeps the header slot from
  // re-registering (and re-rendering) on every poll.
  //
  // The button is withheld for an agent that is not ready: kagent would accept the
  // session and the turn would then fail at the first message. AgentSessionBlocker
  // says why in its place.
  const menu = useMemo(
    () =>
      agent ? (
        <AgentActionsMenu
          agent={agent}
          agentManager={agentManagerGate}
          onUpdateSkills={openUpdateSkills}
          onDelete={openDelete}
        />
      ) : null,
    [agent, agentManagerGate, openUpdateSkills, openDelete],
  );
  // An installation where agent-manager cannot start a session as the person
  // withholds "Use this agent" too, and the note above the tabs says why.
  const sessionBlocker = agentRow?.sessionBlocker;
  const isReady = agentRow ? isStartableAgent(agentRow) : false;
  // The shell header's actions, per the prototype: Edit beside the primary
  // "Use this agent", the rest in the menu. The header is the one place it
  // reads so (PO decision); everywhere else starting from an agent is
  // "Start a session" (T98).
  const shellActions =
    agent && (canEditAgent || isReady) ? (
      <>
        {canEditAgent && (
          <Button variant="secondary" onPress={openEdit}>
            Edit
          </Button>
        )}
        {isReady && (
          <Button variant="primary" onPress={openNewSession}>
            Use this agent
          </Button>
        )}
      </>
    ) : undefined;

  // A failed read while an agent is already in hand is reported through the
  // ErrorsProvider notice, not by replacing the page.
  //
  // This page polls every 5 s while an agent converges, and the plugin's query
  // client deliberately does not retry ServiceUnavailableError / Unauthorized /
  // Forbidden. react-query keeps `data` and sets `error` on a failed *refetch*, so
  // reading `error` as "we have nothing" would let one proxy hiccup blank a fully
  // rendered agent until the next successful poll — up to a minute once polling has
  // backed off. The rendered data is still correct; only its freshness is in doubt.
  //
  // Not-found is excluded because it has its own explanation below, and reporting
  // it twice would be noise.
  const reportableErrors = useMemo(
    () => errors.filter(errorInfo => !isNotFoundError(errorInfo)),
    [errors],
  );
  useShowErrors(reportableErrors);

  const avatarUrl = buildAvatarUrl(installation, name, { size: AVATAR_SIZE });
  const path = location.pathname.replace(/\/$/, '');
  const onOverview = path === basePath;
  const onTools = path === `${basePath}/tools`;

  // Loading only while there is no agent to show. An agent already in the
  // query cache renders at once, even while the persisted cache restores on
  // this provider's mount (`useResource` reports loading throughout that
  // window): replacing it with the loading frame for that moment and back is
  // the flash T95 removed.
  //
  // The loading frame is the loaded page's frame — trail, avatar (its URL is
  // the agent's address), tabs — with skeletons in place of what the read
  // will tell: the name, the readiness, the facts. Nothing moves when it lands.
  if (!agent && (isLoading || isAskingAgentManager)) {
    return (
      <AgentFrame
        title={name || 'Agent'}
        heading={<ShellPageTitleSkeleton label="Loading agent" />}
        leading={
          <AgentAvatar
            size="large"
            purpose="decoration"
            name={name}
            src={avatarUrl ?? ''}
          />
        }
        badges={<ShellPageBadgeSkeleton />}
        // Whether the agent has tools is not known yet: the Tools tab is drawn
        // only where it is the tab asked for, so a deep link keeps its tab
        // selected. Elsewhere it joins the strip once the agent is read.
        tabs={agentTabs({ hasTools: onTools })}
        tabsSearch={location.search}
        aside={onOverview ? <ShellPageFactsSkeleton /> : undefined}
      >
        <LoadingIndicator label="Reading the agent…" />
      </AgentFrame>
    );
  }

  // Every branch below is gated on there being no agent to show. With one in hand
  // the page renders, whatever the last read did.
  if (!agent) {
    // The HelmRelease exists, the Agent does not yet: the agent right after
    // Deploy. The header shows what is known — the name the release was
    // created under and its avatar — and agent-manager's own summary of where
    // the release stands, until the Agent read finds it (polled at the fast
    // tier, see `refetchInterval`) and the page switches to the rendered agent
    // in place. No "Use this agent": there is nothing to start one on yet.
    if (isDeploying) {
      const failed = release.status?.verdict === 'failed';
      return (
        <AgentFrame
          title={name}
          leading={
            <AgentAvatar
              size="large"
              purpose="decoration"
              name={name}
              src={avatarUrl ?? ''}
            />
          }
          badges={<ReadinessBadge readiness={DEPLOYING_PRESENTATION} />}
        >
          <Flex direction="column" gap="4">
            <Alert
              status={failed ? 'danger' : 'info'}
              title={
                failed
                  ? 'The agent’s release did not become ready'
                  : 'Deploying — waiting for kagent to render the agent'
              }
              description={
                release.status?.summary ??
                'agent-manager applied the Helm release.'
              }
            />
          </Flex>
        </AgentFrame>
      );
    }

    // A 404 is an expected outcome here — a stale bookmark, a deleted or renamed
    // agent — so it gets an explanation rather than an error banner. Also covers
    // "no kagent API v2 on this installation": no kagent, or a kagent still on
    // kagent.dev, answers 404 for the `agents` resource.
    if (errors.some(isNotFoundError)) {
      return (
        <AgentFrame title="Agent">
          <EmptyStateCard
            title="Agent not found"
            description={`No agent named "${name}" exists in namespace "${namespace}" on ${
              installation || 'that environment'
            }. It may have been deleted or renamed, or that environment may not run kagent API v2.`}
            actions={<BackToAgents>Back to agents</BackToAgents>}
          />
        </AgentFrame>
      );
    }

    return (
      <AgentFrame title="Agent">
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this agent"
            description={
              (error as Error | null)?.message ??
              'The environment sent an unreadable response. The agent may still exist.'
            }
          />
          <BackToAgents>Back to agents</BackToAgents>
        </Flex>
      </AgentFrame>
    );
  }

  const hasTools = toolset ? toolsetHasTools(toolset.declared) : false;
  const toolsHref = hasTools
    ? `${basePath}/tools${location.search}`
    : undefined;

  /* What a write just made to the agent is doing, and why sessions cannot
     start: true on every tab, so above the routed content. */
  const status = (
    <>
      <AgentCreationProgress
        installation={installation}
        namespace={namespace}
        name={name}
      />

      <AgentSessionBlocker
        agent={agent}
        onEdit={canEditAgent ? openEdit : undefined}
        isGitOpsOwned={agentManagerGate.isGitOpsOwned}
      />

      {sessionBlocker && (
        <Alert
          status="info"
          icon
          title="Sessions and changes are not available from this portal"
          description={`Starting a session, editing, updating skills and deleting go through agent-manager as you. ${sessionBlocker}`}
        />
      )}
    </>
  );

  const dialogs = (
    <>
      {/* In the body rather than beside the header button that opens it: the
          header slot renders outside this plugin's `QueryClientProvider`, so the
          create mutation would have no client there. */}
      <NewSessionDialog
        isOpen={isNewSessionOpen}
        onOpenChange={setNewSessionOpen}
        agents={composerAgents}
        defaultAgent={agentRow}
        isStarting={creation.isCreating}
        error={creation.error ?? undefined}
        onStart={onStartSession}
      />

      {/* The write dialogs, in the body for the same reason: their mutations
          and dry runs are react-query, and the muster sign-in affordance they
          may show needs the plugin's providers. */}
      <AgentDeleteDialog
        installation={installation}
        displayName={agent.getDisplayName()}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        deletion={deletion}
        mode={deleteMode}
        onConfirm={confirmDelete}
        onCommit={commitDelete}
        commitResult={commitResult}
      />
      <AgentUpdateSkillsDialog
        installation={installation}
        namespace={namespace}
        name={name}
        displayName={agent.getDisplayName()}
        isOpen={isUpdateSkillsOpen}
        onOpenChange={setUpdateSkillsOpen}
        skillCount={agent.getSkills().length}
        mode={updateSkillsMode}
        updating={updating}
        onUpdated={onSkillsUpdated}
      />
    </>
  );

  const displayName = agent.getDisplayName();
  const created = agent.getCreatedTimestamp();

  return (
    <AgentFrame
      title={displayName}
      leading={
        <AgentAvatar
          size="large"
          purpose="decoration"
          name={displayName}
          src={avatarUrl ?? ''}
        />
      }
      badges={
        <ReadinessBadge
          readiness={READINESS_PRESENTATION[agent.getReadiness()]}
        />
      }
      meta={
        created ? (
          <>
            Created <DateComponent value={created} />
          </>
        ) : undefined
      }
      actions={shellActions}
      menu={menu}
      tabs={agentTabs({ hasTools })}
      tabsSearch={location.search}
      // The facts belong to the Overview; the other tabs take the whole
      // width.
      aside={
        onOverview ? (
          <FactsColumn
            aria-label="About this agent"
            facts={agentFacts({
              agent,
              installation,
              modelConfig,
              modelServing: agentRow?.modelServing,
            })}
          />
        ) : undefined
      }
    >
      <Flex direction="column" gap="4">
        {status}

        {/* Routed, so each tab is its own URL. Skills are folded into the
              Overview, per the prototype, and a bookmarked `skills` tab lands
              on the Overview that now shows them; so does `tools` for an
              agent without tools. */}
        <Routes>
          <Route
            index
            element={
              <AgentPlainOverview
                agent={agent}
                installation={installation}
                modelConfig={modelConfig}
                modelServing={agentRow?.modelServing}
                toolsHref={toolsHref}
                onUpdateSkills={canEditAgent ? openUpdateSkills : undefined}
                onAddSkills={canEditAgent ? openEdit : undefined}
                isGitOpsOwned={agentManagerGate.isGitOpsOwned}
              />
            }
          />
          <Route
            path="tools"
            element={
              hasTools ? (
                <AgentToolsetCard agent={agent} />
              ) : (
                <Navigate to={`${basePath}${location.search}`} replace />
              )
            }
          />
          <Route
            path="sessions"
            element={
              <AgentSessionsCard
                agentName={displayName}
                sessions={sessions}
                onStartSession={isReady ? openNewSession : undefined}
              />
            }
          />
          <Route
            path="usage"
            element={
              <AgentUsageTab
                installation={installation}
                namespace={namespace}
                name={name}
              />
            }
          />
          <Route
            path="*"
            element={<Navigate to={`${basePath}${location.search}`} replace />}
          />
        </Routes>
      </Flex>
      {dialogs}
    </AgentFrame>
  );
}

/**
 * One kagent agent: what it is, whether it works, and what it has been used for.
 *
 * The prototype's plain-language page: routed tabs — Overview (what it is
 * for, its instructions, skills and connectors, with the Kubernetes detail in
 * a "Technical details" fold-out), Sessions, Tools (for an agent bound to the
 * gateway: its toolset resolved to exact tools) and Usage — under the
 * platform-standard `ShellPage` header, with the model and environment as
 * facts beside the Overview. Overview is the index, so the three-segment URL
 * the rest of the portal links to still opens the agent. The creation
 * progress sits above the tabs: whether a write just made to the agent has
 * converged is true on every tab.
 *
 * The agent can be edited (the header's Edit), have its skills re-pinned and
 * be deleted from the header's actions menu — every write through
 * agent-manager over muster as the signed-in person, offered when the installation's muster lists agent-manager
 * and the agent is not applied from git.
 *
 * What the APUI prototype shows and this deliberately does not, because there is
 * no data behind it: sessions all-time, sessions in the last 30 days, a success
 * rate, and "last activity" across the fleet. kagent keeps no per-agent counters
 * and scopes its session list to the calling user, so any of those would be a
 * number invented from one person's history. Please don't add them speculatively.
 *
 * `ErrorsProvider` is required, not decorative: the shared `GitOpsCard` reports
 * the failures of its Flux lookups through `useShowErrors`, which throws without
 * this context. Every gs details page wraps its content the same way, and it also
 * gives this page the standard retry/dismiss notice for a failed read.
 *
 * `ServingProvider` supplies the serving layer's word on the model behind the
 * agent (the Model row, the composer's warning) from the same query cache the
 * Models tab fills; the Agents tab mounts it at its list, this page at itself.
 */
export function AgentDetailPage() {
  return (
    <ErrorsProvider>
      <ServingProvider>
        <AgentDetailPageContent />
      </ServingProvider>
    </ErrorsProvider>
  );
}
