import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Avatar, Button, Flex, Grid, Text } from '@backstage/ui';
import {
  Agent,
  ErrorsProvider,
  isGitOpsManaged,
  isNotFoundError,
  ModelConfig,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from '@giantswarm/backstage-plugin-flux-react';
import {
  DateComponent,
  StatusLabel,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentSessions } from '../../hooks/useAgentSessions';
import { useCreateSession } from '../../hooks/useCreateSession';
import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { useAgentDeletion } from '../../hooks/useAgentDeletion';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import { useUpdateAgent } from '../../hooks/useUpdateAgent';
import type { CommitAgentResult } from '../../lib/agentManager';
import { useLastUsedAgent } from '../../hooks/useLastUsedAgent';
import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import { AvatarSize } from '../../lib/agentAvatar';
import { clientLookupOf } from '../../lib/serving';
import {
  agentEditRouteRef,
  agentsRouteRef,
  sessionDetailRouteRef,
} from '../../routes';
import {
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
import { InstallationChip } from '../InstallationChip';
import { NewSessionDialog } from '../NewSessionDialog';
import { ServingProvider, useServing } from '../ServingProvider';
import { AgentCreationProgress } from '../AgentCreationProgress';
import { AgentActionsMenu } from './AgentActionsMenu';
import { AgentConfigurationCard } from './AgentConfigurationCard';
import { AgentDeleteDialog } from './AgentDeleteDialog';
import { AgentSessionsCard } from './AgentSessionsCard';
import { AgentSkillsCard } from './AgentSkillsCard';
import { AgentStatusCard } from './AgentStatusCard';
import { AgentSystemPromptCard } from './AgentSystemPromptCard';
import { AgentToolsetCard } from './AgentToolsetCard';
import { AgentUpdateSkillsDialog } from './AgentUpdateSkillsDialog';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 8000;

/** Matches the list's row avatar: two lines of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 96;

/**
 * The header label for an agent whose HelmRelease exists but whose
 * AgentTemplate has not been rendered yet — before there is a readiness to
 * derive. Same neutral hourglass as "Pending", which is the state it becomes.
 */
const DEPLOYING_PRESENTATION: ReadinessPresentation = {
  label: 'Deploying',
  intent: 'neutral',
  icon: READINESS_PRESENTATION.pending.icon,
};

/**
 * The page header: avatar, name, the derived readiness, where the agent runs,
 * and — once the template exists — when it was created and what it is for.
 */
function AgentHeader({
  displayName,
  avatarUrl,
  readiness,
  name,
  installation,
  namespace,
  created,
  description,
}: {
  displayName: string;
  avatarUrl: string | undefined;
  readiness: ReadinessPresentation;
  name: string;
  installation: string;
  namespace: string;
  created?: string;
  description?: string;
}) {
  return (
    <Flex direction="column" gap="2">
      <BackToAgents>← Agents</BackToAgents>

      <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
        <Avatar
          size="large"
          purpose="decoration"
          name={displayName}
          src={avatarUrl ?? ''}
        />
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            <Text variant="title-medium">{displayName}</Text>
            {/* Tagged because the derived readiness and the condition it came
                from share a label ("Ready", "Ready") — this is the derived
                one, distinct from the entries in the conditions list. */}
            <span data-testid="agent-readiness">
              <StatusLabel
                label={readiness.label}
                intent={readiness.intent}
                icon={readiness.icon}
              />
            </span>
            {/* Where the agent runs, where a person reads: two agents may
                share a name across installations. */}
            <InstallationChip installation={installation} />
          </Flex>

          <Text variant="body-small" color="secondary">
            <span style={{ fontFamily: 'monospace' }}>{name}</span>
            {' · '}
            {installation}
            {namespace ? ` / ${namespace}` : ''}
            {created ? ' · created ' : ''}
            {created ? <DateComponent value={created} relative /> : null}
          </Text>
        </Flex>
      </Flex>

      {description && <Text variant="body-medium">{description}</Text>}
    </Flex>
  );
}

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

function AgentDetailPageContent() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const buildAvatarUrl = useAgentAvatarUrl();

  // Same two tiers as the list: tighten while the agent is converging, relax
  // once it settles or stays broken. This page is where someone watches an
  // agent come up, so the fast tier earns its keep here — and it starts before
  // the template exists: while agent-manager says the agent's HelmRelease is
  // there (`isDeploying` below), the read that will eventually find the
  // template polls at the fast tier too, instead of the 60 s the helper gives
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
  // HelmRelease and returns; helm-controller renders the AgentTemplate a few
  // seconds later, and the create flow navigates here in between — so a 404 on
  // the template alone does not mean the agent is missing. agent-manager's
  // `get_agent_status` is the HelmRelease-aware read: by its contract it
  // answers `not_found` only when neither the template nor the HelmRelease
  // exists; otherwise it reports the release and its verdict. It is the read
  // the creation progress polls after Deploy anyway, runs as the signed-in
  // person (so it needs no Kubernetes read on HelmReleases), and survives a
  // reload of this URL. Asked only once the template read has come back empty;
  // without agent-manager on the installation nothing is asked and a 404 stays
  // "not found".
  const isTemplateMissing =
    !isLoading && !agent && errors.some(isNotFoundError);
  const release = useAgentStatus(installation, namespace, name, {
    enabled: isTemplateMissing,
  });
  const isDeploying =
    isTemplateMissing &&
    (release.status?.helmRelease?.exists === true ||
      release.status?.template?.exists === true);
  isDeployingRef.current = isDeploying;
  // The status read is still in flight: neither verdict is known, so neither
  // is shown.
  const isAskingAgentManager =
    isTemplateMissing &&
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
  const agentRow = useMemo(
    () =>
      agent
        ? toAgentRow(agent, modelConfig ? [modelConfig] : [], resolveServing)
        : undefined,
    [agent, modelConfig, resolveServing],
  );
  const sessions = useAgentSessions(installation, namespace, name, agentRow);

  // The write actions — Delete, Edit, Update skills — go through agent-manager
  // over muster as the signed-in person, and are offered when the installation's
  // muster lists agent-manager (feature detection; authorization stays the
  // apiserver's, reached through agent-manager). Called here rather than inside
  // the menu: the menu is rendered in the shared plugin header, outside this
  // plugin's `QueryClientProvider`, so react-query has no client there. The
  // dialogs are rendered in the page body for the same reason.
  const availability = useAgentManagerAvailability(
    installation ? [installation] : [],
  );
  const agentManagerGate = useMemo(
    () => ({
      presence: availability.presenceOf(installation),
      isUnavailable: availability.isUnavailable,
    }),
    [availability, installation],
  );
  const { info: agentManagerInfo } = useAgentManagerInfo(
    agentManagerGate.presence === 'available' ? installation : undefined,
  );
  // Commit (a pull request instead of a live write, giantswarm/agent-manager#24)
  // shows only when agent-manager reports the capability.
  const canCommit = agentManagerInfo?.capabilities?.commit === true;

  const deletion = useAgentDeletion(installation, namespace, name);
  const updating = useUpdateAgent(installation);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isUpdateSkillsOpen, setUpdateSkillsOpen] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitAgentResult>();
  const toastApi = useApi(toastApiRef);
  const agentsRoute = useRouteRef(agentsRouteRef);
  const agentEditRoute = useRouteRef(agentEditRouteRef);
  const location = useLocation();

  const { reset: resetDeletion } = deletion;
  const openDelete = useCallback(() => {
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it.
    resetDeletion();
    setCommitResult(undefined);
    setDeleteOpen(true);
  }, [resetDeletion]);
  const { reset: resetUpdating } = updating;
  const openUpdateSkills = useCallback(() => {
    resetUpdating();
    setUpdateSkillsOpen(true);
  }, [resetUpdating]);

  // Starting a session from this page. The dialog itself is rendered in the page
  // body, not in the header: the header slot lives outside this plugin's
  // `QueryClientProvider`, so the create mutation has no client there. The button
  // up there can only flip this flag — the same split the session detail page's
  // rename dialog makes.
  const [isNewSessionOpen, setNewSessionOpen] = useState(false);
  const creation = useCreateSession();
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

  const openEdit = useCallback(() => {
    const href = agentEditRoute?.({ installation, namespace, name });
    if (href) {
      navigate(href);
    }
  }, [agentEditRoute, installation, namespace, name, navigate]);

  const { deleteAgent, commit: commitDeletion } = deletion;
  const confirmDelete = useCallback(async () => {
    let result;
    try {
      result = await deleteAgent();
    } catch {
      // Left to the dialog, which stays open and shows agent-manager's message
      // — a GitOps-owned or suspended release, a viewer's Forbidden. No toast:
      // the user is still looking at the modal they pressed Delete in.
      return;
    }
    setDeleteOpen(false);
    const as = result.requestedBy ? ` as ${result.requestedBy}` : '';
    toastApi.post({
      // Deliberately not "Agent deleted": the HelmRelease has a finalizer, so
      // all that is certain here is that agent-manager's delete was accepted
      // and helm-controller has started uninstalling. The agent can still be in
      // the list for a few seconds.
      title: `Deleting agent "${agent?.getDisplayName() ?? name}"`,
      description: `agent-manager deleted its Helm release${as}; Flux is uninstalling it, so it may take a moment to disappear from the list.${
        result.ociRepositoryKept
          ? ` The namespace's shared chart source stays: ${result.ociRepositoryKept}.`
          : ''
      }`,
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
    (_skills: unknown, requestedBy?: string) => {
      toastApi.post({
        title: `Updating the skills of "${agent?.getDisplayName() ?? name}"`,
        description: `agent-manager re-pinned the git skills${
          requestedBy ? ` as ${requestedBy}` : ''
        }; the platform Harness compiles a new revision.`,
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
  // session and the turn would then fail at the first message, with the readiness
  // this very page already explains as the reason.
  const actions = useMemo(
    () =>
      agent ? (
        <Flex align="center" gap="2">
          {agentRow?.readiness === 'ready' && (
            <Button variant="primary" onPress={openNewSession}>
              Start a session
            </Button>
          )}
          <AgentActionsMenu
            agent={agent}
            agentManager={agentManagerGate}
            onEdit={openEdit}
            onUpdateSkills={openUpdateSkills}
            onDelete={openDelete}
          />
        </Flex>
      ) : null,
    [
      agent,
      agentRow?.readiness,
      agentManagerGate,
      openEdit,
      openUpdateSkills,
      openDelete,
      openNewSession,
    ],
  );
  useProvidePageHeaderActions(actions);

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

  if (isLoading || isAskingAgentManager) {
    return (
      <Content>
        <Progress aria-label="Loading agent" />
      </Content>
    );
  }

  const avatarUrl = buildAvatarUrl(installation, name, { size: AVATAR_SIZE });

  // Every branch below is gated on there being no agent to show. With one in hand
  // the page renders, whatever the last read did.
  if (!agent) {
    // The HelmRelease exists, the template does not yet: the agent right after
    // Deploy. The header shows what is known — the name the release was
    // created under and its avatar — and agent-manager's own summary of where
    // the release stands, until the template read finds it (polled at the fast
    // tier, see `refetchInterval`) and the page switches to the rendered agent
    // in place. No "Start a session": there is nothing to start one on yet.
    if (isDeploying) {
      const failed = release.status?.verdict === 'failed';
      return (
        <Content>
          <Flex direction="column" gap="4">
            <AgentHeader
              displayName={name}
              avatarUrl={avatarUrl}
              readiness={DEPLOYING_PRESENTATION}
              name={name}
              installation={installation}
              namespace={namespace}
            />
            <Alert
              status={failed ? 'danger' : 'info'}
              title={
                failed
                  ? 'The agent’s release did not become ready'
                  : 'Deploying — waiting for kagent to render the template'
              }
              description={
                release.status?.summary ??
                'agent-manager applied the Helm release; Flux and kagent have not rendered the AgentTemplate yet.'
              }
            />
          </Flex>
        </Content>
      );
    }

    // A 404 is an expected outcome here — a stale bookmark, a deleted or renamed
    // agent — so it gets an explanation rather than an error banner. Also covers
    // "no kagent API v2 on this installation": no kagent, or a kagent still on
    // 0.10, answers 404 for the `agenttemplates` resource.
    if (errors.some(isNotFoundError)) {
      return (
        <Content>
          <EmptyState
            missing="data"
            title="Agent not found"
            description={`No agent named "${name}" exists in namespace "${namespace}" on ${
              installation || 'that installation'
            }. It may have been deleted or renamed, or that installation may not run kagent API v2.`}
            action={<BackToAgents>Back to agents</BackToAgents>}
          />
        </Content>
      );
    }

    return (
      <Content>
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this agent"
            description={
              (error as Error | null)?.message ??
              'The installation returned a response we could not read. The agent may still exist.'
            }
          />
          <BackToAgents>Back to agents</BackToAgents>
        </Flex>
      </Content>
    );
  }

  return (
    <Content>
      <Flex direction="column" gap="4">
        <AgentHeader
          displayName={agent.getDisplayName()}
          avatarUrl={avatarUrl}
          readiness={READINESS_PRESENTATION[agent.getReadiness()]}
          name={name}
          installation={installation}
          namespace={namespace}
          created={agent.getCreatedTimestamp()}
          description={agent.getDescription()}
        />

        <AgentCreationProgress
          installation={installation}
          namespace={namespace}
          name={name}
        />

        {/* A cheap pre-check only: no Flux or Helm marker at all means there is
            nothing to resolve, so skip the lookups entirely. Whether the agent is
            *actually* GitOps-managed is the card's own decision — it walks
            Agent → HelmRelease → Kustomization → GitRepository and renders nothing
            unless that ends in Git. An agent created by this plugin's own flow is
            reconciled by a HelmRelease the scaffolder applied, which is not in Git,
            so it correctly shows no card; the "Deployed by" row above is the whole
            truth about where it came from. */}
        {isGitOpsManaged(agent) && (
          <GitOpsCard resource={agent} installationName={installation} />
        )}

        {/* Status sits in a third of the width, beside the configuration. A
            controller message is prose — a rejected spec can carry several
            hundred words of admission-webhook output — and across the full page
            it runs to line lengths nobody can follow. A narrower column is the
            fix, so the status card is the one thing that does not want the whole
            width.

            The sections below it do, and take it: a skills grid fits three cards
            per row, and the sessions table has four columns to place. One column
            below `lg`, where there is no width to divide. */}
        {/* Document order is the layout order — no `colStart`. Grid's sparse
            auto-placement moves the cursor to the next row whenever an item's
            definite column-start is before the cursor's current column, so
            placing the status in column 3 first and then pinning the
            configuration to column 1 drops the configuration to a second row and
            leaves the top-left of the page empty.

            The consequence is that stacking below `lg` puts the configuration
            above the status. Acceptable: the readiness label is already in the
            page header, so the state is visible before either card. */}
        <Grid.Root columns={{ initial: '1', lg: '3' }} gap="4">
          <Grid.Item colSpan={{ initial: '1', lg: '2' }}>
            <AgentConfigurationCard
              agent={agent}
              modelConfig={modelConfig}
              modelServing={agentRow?.modelServing}
            />
          </Grid.Item>
          <Grid.Item colSpan="1">
            <AgentStatusCard agent={agent} />
          </Grid.Item>
        </Grid.Root>

        <AgentSystemPromptCard agent={agent} />
        <AgentToolsetCard agent={agent} />
        <AgentSkillsCard
          agent={agent}
          onUpdateSkills={
            agentManagerGate.presence === 'available' &&
            !agentManagerGate.isUnavailable
              ? openUpdateSkills
              : undefined
          }
        />
        <AgentSessionsCard sessions={sessions} />
      </Flex>

      {/* In the body rather than beside the header button that opens it: the
          header slot renders outside this plugin's `QueryClientProvider`, so the
          create mutation would have no client there. */}
      <NewSessionDialog
        isOpen={isNewSessionOpen}
        onOpenChange={setNewSessionOpen}
        agents={composerAgents}
        defaultAgent={agentRow}
        isStarting={creation.isCreating}
        error={creation.error?.message}
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
        canCommit={canCommit}
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
        updating={updating}
        onUpdated={onSkillsUpdated}
      />
    </Content>
  );
}

/**
 * One kagent agent: what it is, whether it works, and what it has been used for.
 *
 * The agent can be edited, have its skills re-pinned and be deleted from the
 * header's actions menu — every write through agent-manager over muster as the
 * signed-in person, offered when the installation's muster lists agent-manager.
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
