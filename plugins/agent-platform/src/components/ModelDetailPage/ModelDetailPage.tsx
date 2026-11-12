import { ReactNode, useCallback, useMemo } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Badge, Button, Flex, Link, Text } from '@backstage/ui';
import {
  ErrorsProvider,
  ModelConfig,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import {
  DateComponent,
  EmptyStateCard,
  type Fact,
  LoadingIndicator,
  type RouteTabSpec,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageTitleSkeleton,
  StatusDot,
  useFactTextVariant,
  useProvidePageHeaderActions,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  modelConfigEditOwner,
  modelConfigFormValues,
  modelConfigOwner,
} from '../../lib/modelConfigs';
import {
  type ContextWindowLookup,
  lookUpContextWindow,
} from '../../lib/contextWindows';
import { modelStatus } from '../../lib/customize';
import { markedIn, defaultIn, listed } from '../../lib/defaultModel';
import { tenantInSentence } from '../../lib/tenants';
import { useSetDefaultModelConfig } from '../../hooks/useSetDefaultModelConfig';
import { modelProblem } from '../../lib/modelProblem';
import {
  AgentManagerError,
  AgentManagerNotConnectedError,
} from '../../lib/agentManager';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useDeleteModelConfig } from '../../hooks/useDeleteModelConfig';
import { clientLookupOf } from '../../lib/serving';
import { modelEditRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { InstallationChip } from '../InstallationChip';
import { useModelConfigs } from '../ModelConfigsProvider';
import { toModelRow, toModelServedBy } from '../ModelsTable';
import { useServing } from '../ServingProvider';
import { ModelActionsMenu } from './ModelActionsMenu';
import { ModelOverviewTab } from './ModelOverviewTab';
import { modelPageTabs } from './modelTabs';
import { ModelUsageTab } from './ModelUsageTab';
import { ModelUsedByTab } from './ModelUsedByTab';
import {
  agentsUsingModel,
  describeContextWindow,
  modelConfigIdOf,
} from './modelUsage';
import { useModelUsage } from './useModelUsage';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

/**
 * The page's outer frame: the platform-standard page frame (`ShellPage`) —
 * breadcrumbs reading "Customize / Models / <model>", the
 * model's name as the h1 at the standard scale, its status, environment and
 * provider beside it, and the tabs under it. The actions the page registers
 * land in that header's slot.
 *
 * A component of its own so every exit — loading, not found, and the model
 * itself — gets the same frame.
 */
function ModelFrame({
  title,
  heading,
  badges,
  meta,
  tabs,
  children,
}: {
  /** The shell header's h1, and the breadcrumbs' last entry. */
  title: string;
  /** The h1 instead of `title`, e.g. its skeleton while the model is read. */
  heading?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  tabs?: RouteTabSpec[];
  children: ReactNode;
}) {
  const paths = useCustomizePaths();
  const { search } = useLocation();
  return (
    <ShellPage
      title={heading ?? title}
      breadcrumbs={[
        { label: 'Customize', href: paths.customize },
        { label: 'Models', href: paths.models },
        { label: title },
      ]}
      badges={badges}
      meta={meta}
      tabs={tabs}
      // The tab links keep the address's query, as on the workflow page.
      tabsSearch={search}
    >
      {children}
    </ShellPage>
  );
}

/**
 * The tool that owns the model, and what that means here: no Edit, since the
 * tool would revert it. The page's header offers none, and this says why.
 * An organization's model agent-manager wrote is the exception
 * (`savesEdits`): Edit saves it through agent-manager.
 */
function ManagedByValue({
  owner,
  savesEdits = false,
}: {
  owner: string;
  savesEdits?: boolean;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant={useFactTextVariant()}>{owner}</Text>
      <Text variant="body-small" color="secondary">
        {savesEdits
          ? `Edits made here are saved through ${owner}.`
          : `${owner} would revert edits made here, so change the model where ${owner} is configured.`}
      </Text>
    </Flex>
  );
}

/** Whether the model is its namespace's default, and how it would become it. */
export type ModelDefaultState = {
  isDefault: boolean;
  /** The other models marked as the default there (`markedIn`). */
  otherMarks: string[];
  /** The owner inside a sentence (`tenantInSentence`). */
  where: string;
};

/** The Default model fact's value: yes or no, and what that means here. */
function DefaultModelValue({
  state,
  owner,
}: {
  state: ModelDefaultState;
  owner?: string;
}) {
  let note: string;
  if (state.isDefault) {
    note = `New agents for ${state.where} start with this model.`;
  } else if (owner === 'Helm') {
    note =
      "Helm manages this model: make it the default in its release's values.";
  } else if (owner) {
    note = `${owner} manages this model: make it the default where ${owner} is configured.`;
  } else if (state.otherMarks.length > 1) {
    note = `${state.where.charAt(0).toUpperCase()}${state.where.slice(1)} has no default: ${listed(state.otherMarks)} are all marked as the default.`;
  } else if (state.otherMarks.length === 1) {
    note = `The default for ${state.where} is ${state.otherMarks[0]}.`;
  } else {
    note = `${state.where.charAt(0).toUpperCase()}${state.where.slice(1)} has no default model.`;
  }
  return (
    <Flex direction="column" gap="1">
      <Text variant={useFactTextVariant()}>
        {state.isDefault ? 'Yes' : 'No'}
      </Text>
      <Text variant="body-small" color="secondary">
        {note}
      </Text>
    </Flex>
  );
}

/**
 * Why the default did not move. agent-manager's refusal of a person who may
 * not change an organization's models names who can; any other failure is
 * said as it came.
 */
function SetDefaultError({
  error,
  installation,
  organization,
  onSignedIn,
}: {
  error: Error;
  installation: string;
  /** The organization the model is in, when it is one's. */
  organization?: string;
  /** Clears the refusal once the person signed in to agent-manager. */
  onSignedIn: () => void;
}) {
  // The call declares no URL elicitation, so a missing sign-in comes back
  // as this error, with the sign-in offered here.
  if (error instanceof AgentManagerNotConnectedError) {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={error.message}
        action="An organization's default model is set"
        signInRequired={error.signInRequired}
        onSignedIn={onSignedIn}
      />
    );
  }
  if (
    organization &&
    error instanceof AgentManagerError &&
    error.code === 'forbidden'
  ) {
    return (
      <Alert
        status="danger"
        title="Not permitted"
        description={`Only an admin of the organization ${organization} sets its default model. Ask one of its admins to make the change, or to make you an admin. agent-manager answered: ${error.message}`}
      />
    );
  }
  return (
    <Alert
      status="danger"
      title="Could not make this the default model"
      description={error.message}
    />
  );
}

/** Overview's plain facts: what it calls, where, who owns it, and since when. */
export function modelFacts({
  modelConfig,
  installation,
  contextWindow,
  owner,
  ownerSavesEdits,
  defaultState,
}: {
  modelConfig: ModelConfig;
  installation: string;
  /** What the context-window table says about the model, when that is known. */
  contextWindow: ContextWindowLookup | undefined;
  /** The tool that asserts the model (`modelConfigOwner`), if any. */
  owner?: string;
  /** Edits are saved through `owner` (`modelConfigEditOwner`). */
  ownerSavesEdits?: boolean;
  /** Whether it is the default, once the namespace's models are read. */
  defaultState?: ModelDefaultState;
}): Fact[] {
  const created = modelConfig.getCreatedTimestamp();
  const provider = modelConfig.getProvider();
  const facts: Fact[] = [
    ...(provider ? [{ label: 'Provider', value: provider }] : []),
    { label: 'Model ID', value: modelConfig.getModel() ?? '—' },
    {
      label: 'Endpoint',
      value: modelConfig.getEndpoint() ?? 'Provider default',
    },
  ];
  if (contextWindow?.kind === 'window') {
    facts.push({
      label: 'Context window',
      value: describeContextWindow(contextWindow.tokens),
    });
  }
  facts.push({ label: 'Environment', value: installation });
  if (defaultState) {
    facts.push({
      label: 'Default model',
      value: (
        <DefaultModelValue
          state={defaultState}
          // An owner whose edits are saved through it (agent-manager, for an
          // organization's model) is no reason to move the mark elsewhere.
          owner={ownerSavesEdits ? undefined : owner}
        />
      ),
    });
  }
  if (owner) {
    facts.push({
      label: 'Managed by',
      value: <ManagedByValue owner={owner} savesEdits={ownerSavesEdits} />,
    });
  }
  if (created) {
    facts.push({
      label: 'Created',
      // Relative, as the shell's other "Created" facts; the shell's local
      // clock puts the full timestamp in its title.
      value: <DateComponent value={created} relative />,
    });
  }
  return facts;
}

function ModelDetailPageContent() {
  const navigate = useNavigate();
  const modelEditRoute = useRouteRef(modelEditRouteRef);
  const paths = useCustomizePaths();
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const { config } = useSignedInConfig();
  const {
    installation = '',
    namespace = '',
    name = '',
  } = useParams<'installation' | 'namespace' | 'name'>();

  const {
    resource: modelConfig,
    isLoading,
    errors,
  } = useResource(
    installation,
    ModelConfig,
    // We type against a single version (v1alpha3), so skip API discovery —
    // same reasoning as ModelConfigsProvider.
    { name, namespace, enableDiscovery: false },
  );

  const owner = modelConfig ? modelConfigOwner(modelConfig) : undefined;
  const isUnsupportedProvider = modelConfig
    ? !modelConfigFormValues(modelConfig)
    : false;

  // What the serving layer says about the model behind this config, for the
  // status badge and the Overview's serving block.
  const { servingStateFor, capabilitiesFor, backends } = useServing();
  const servingState = modelConfig
    ? servingStateFor(installation, clientLookupOf(modelConfig))
    : undefined;
  // The served model's own backend where one is found: an installation may
  // run several behind one model-manager.
  const servedBy = servingState
    ? toModelServedBy(
        servingState,
        capabilitiesFor(installation, servingState.model?.backend),
        servingState.model?.backend ?? backends[installation],
      )
    : undefined;

  const { allowed: mayUpdate, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      installation,
      {
        group: ModelConfig.group,
        resource: ModelConfig.plural,
        namespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name,
        verb: 'update',
      },
      { enabled: Boolean(modelConfig) },
    );

  const deletion = useDeleteModelConfig(modelConfig);

  // The default as the marks say it (`markedIn`): this model as just
  // read, the namespace's others as listed. Unknown until the list has
  // answered.
  const toastApi = useApi(toastApiRef);
  const { modelConfigsFor, isLoading: isLoadingModels } = useModelConfigs();
  const { directory } = useOrganizationDirectory();
  const defaultState = useMemo<ModelDefaultState | undefined>(() => {
    if (!modelConfig || isLoadingModels) {
      return undefined;
    }
    const namespaceModels = [
      ...modelConfigsFor(installation).filter(
        mc => (mc.getNamespace() ?? '') === namespace && mc.getName() !== name,
      ),
      modelConfig,
    ];
    return {
      isDefault: defaultIn(namespaceModels, namespace) === name,
      otherMarks: markedIn(namespaceModels, namespace).filter(
        mark => mark !== name,
      ),
      where: tenantInSentence(namespace, directory),
    };
  }, [
    modelConfig,
    isLoadingModels,
    modelConfigsFor,
    installation,
    namespace,
    directory,
    name,
  ]);
  // An organization's model agent-manager wrote is edited, and made the
  // default, through it: agent-manager is no owner that withholds either.
  const ownerSavesEdits = Boolean(
    owner && modelConfig && !modelConfigEditOwner(modelConfig, directory),
  );
  const settingDefault = useSetDefaultModelConfig();
  const { setDefault, isSetting, reset: resetSetDefault } = settingDefault;
  const canSetDefault =
    Boolean(defaultState) &&
    !defaultState?.isDefault &&
    mayUpdate &&
    !isCheckingPermission;
  const onSetDefault = useCallback(async () => {
    if (!modelConfig || !defaultState) {
      return;
    }
    resetSetDefault();
    let form: string | undefined;
    try {
      ({ form } = await setDefault({
        modelConfig,
        expected: defaultState.otherMarks,
      }));
    } catch {
      // Left on the page: the error renders in the alert above the tabs.
      return;
    }
    if (form) {
      // The model has no key yet: the move finishes on the credential form.
      navigate(form);
      return;
    }
    toastApi.post({
      title: `${modelConfig.getDisplayName()} is now the default model`,
      description: `New agents for ${defaultState.where} start with it. Agents that already run on another model keep it.`,
      status: 'success',
      timeout: 6000,
    });
  }, [
    modelConfig,
    defaultState,
    resetSetDefault,
    setDefault,
    toastApi,
    navigate,
  ]);

  // Read here, above the tabs, so Used by and the Usage tab share one
  // result. Only for a model there is: the not-found and error frames
  // never show it.
  const usage = useModelUsage(
    modelConfig ? installation : undefined,
    modelConfig?.getModel(),
    modelConfig?.getDisplayName() ?? name,
  );

  // The agents whose spec names this ModelConfig, for Used by and its count.
  const {
    rows: agentRows,
    isLoading: agentsLoading,
    unreachableInstallations,
  } = useAgents();
  const using = useMemo(
    () =>
      agentsUsingModel(
        agentRows,
        modelConfigIdOf(installation, namespace, name),
      ),
    [agentRows, installation, namespace, name],
  );
  const agentsUnreachable = unreachableInstallations.includes(installation);

  const isEditable =
    Boolean(modelConfig) &&
    (!owner || ownerSavesEdits) &&
    !isUnsupportedProvider &&
    mayUpdate &&
    !isCheckingPermission;

  const openEdit = useCallback(() => {
    const href = modelEditRoute?.({ installation, namespace, name });
    if (href) {
      navigate(href);
    }
  }, [modelEditRoute, installation, namespace, name, navigate]);

  // Memoized so the header actions slot only updates when the handlers change.
  // The kebab gets the page's deletion result as a prop: it renders in the
  // shared header, outside the plugin's QueryClientProvider.
  const actions = useMemo(
    () => (
      <Flex gap="2" align="center">
        {canSetDefault && (
          <Button
            variant="secondary"
            onPress={onSetDefault}
            isDisabled={(Boolean(owner) && !ownerSavesEdits) || isSetting}
          >
            {isSetting ? 'Setting as default…' : 'Set as default'}
          </Button>
        )}
        {isEditable && modelEditRoute && (
          <Button variant="secondary" onPress={openEdit}>
            Edit
          </Button>
        )}
        {modelConfig && (
          <ModelActionsMenu modelConfig={modelConfig} deletion={deletion} />
        )}
      </Flex>
    ),
    [
      canSetDefault,
      onSetDefault,
      owner,
      ownerSavesEdits,
      isSetting,
      isEditable,
      modelEditRoute,
      openEdit,
      modelConfig,
      deletion,
    ],
  );
  useProvidePageHeaderActions(actions);

  // Loading only while there is no model to show: one already in the query
  // cache renders at once, even while the persisted cache restores on the
  // provider's mount. Meanwhile the loaded page's frame, with skeletons where
  // the read will fill in (T95).
  if (isLoading && !modelConfig) {
    return (
      <ModelFrame
        title="Model"
        heading={<ShellPageTitleSkeleton label="Loading model" />}
        badges={<ShellPageBadgeSkeleton />}
        tabs={modelPageTabs({ usedBy: undefined, isLoading: true })}
      >
        <LoadingIndicator label="Reading the model…" />
      </ModelFrame>
    );
  }

  if (!modelConfig) {
    return (
      <ModelFrame title="Model">
        {/* As the agent page: a failed read is an error with the way back, a
            model that is not there an empty state with it. */}
        {errors.length > 0 ? (
          <Flex direction="column" gap="3">
            <Alert
              status="danger"
              title="Could not load this model"
              description={`ModelConfig ${namespace}/${name} on ${installation} could not be read. It may have been deleted, or you may not have permission to read it.`}
            />
            {paths.models && <Link href={paths.models}>Back to models</Link>}
          </Flex>
        ) : (
          <EmptyStateCard
            title="Model not found"
            description={`ModelConfig ${namespace}/${name} does not exist on ${installation}.`}
            actions={
              paths.models && <Link href={paths.models}>Back to models</Link>
            }
          />
        )}
      </ModelFrame>
    );
  }

  const status = modelStatus(toModelRow(modelConfig, servedBy));
  // Unknown while the signed-in config loads, and when it has no table at
  // all: app-config.yaml ships one, so a missing table means the config did
  // not load (the loader publishes an empty one once its retries run out), not
  // that no model has a window. Unknown, too, for a model without a model id,
  // which no pattern can name. Unknown says nothing either way.
  const contextWindowTable = config?.getOptional<Record<string, unknown>>(
    'agentPlatform.models.contextWindows',
  );
  const modelId = modelConfig.getModel();
  const contextWindow =
    contextWindowTable && modelId
      ? lookUpContextWindow(modelId, contextWindowTable)
      : undefined;
  const facts = modelFacts({
    modelConfig,
    installation,
    contextWindow,
    owner,
    ownerSavesEdits,
    defaultState,
  });

  return (
    <ModelFrame
      title={modelConfig.getDisplayName()}
      badges={
        <>
          <StatusDot tone={status.tone} label={status.label} />
          {defaultState?.isDefault && <Badge size="small">Default</Badge>}
          <InstallationChip installation={installation} />
        </>
      }
      meta={modelConfig.getProvider()}
      tabs={modelPageTabs({
        usedBy: agentsUnreachable ? undefined : using.length,
        isLoading: agentsLoading,
      })}
    >
      {settingDefault.error && (
        <SetDefaultError
          error={settingDefault.error}
          installation={installation}
          organization={directory.get(namespace)?.organization}
          onSignedIn={resetSetDefault}
        />
      )}
      <Routes>
        <Route
          index
          element={
            <ModelOverviewTab
              // Technical details start afresh per model.
              key={`${installation}/${namespace}/${name}`}
              modelConfig={modelConfig}
              installation={installation}
              facts={facts}
              contextWindow={contextWindow}
              servedBy={servedBy}
              owner={owner}
              isUnsupportedProvider={isUnsupportedProvider}
              problem={modelProblem(modelConfig, {
                canEdit: isEditable && Boolean(modelEditRoute),
                owner,
              })}
            />
          }
        />
        <Route
          path="usage"
          element={
            <ModelUsageTab
              installation={installation}
              model={modelConfig.getModel()}
              usage={usage}
            />
          }
        />
        <Route
          path="used-by"
          element={
            <ModelUsedByTab
              installation={installation}
              using={using}
              isLoading={agentsLoading}
              isUnreachable={agentsUnreachable}
              usage={usage}
            />
          }
        />
        {/* An address the page no longer has lands on Overview. */}
        <Route
          path="*"
          element={<Navigate to={`${basePath}${search}`} replace />}
        />
      </Routes>
    </ModelFrame>
  );
}

/**
 * One model (`<customize>/models/<installation>/<namespace>/<name>`, routed
 * by the app's Customize page), as a read view with Edit as an action, in
 * three tabs, each its own address under the model's:
 *
 * - **Overview** (the index): whether the serving layer serves it, why it
 *   cannot be edited here, what it calls, where and since when, then
 *   "Technical details" with the resource and the controller's conditions.
 * - **Usage** (`usage`): the gateway's figures for the model over the last
 *   30 days and its spend per day.
 * - **Used by** (`used-by`), counted in the tab: the agents that run on it,
 *   each with what it spent on the model.
 *
 * Any other address under the model's, the former `details` among them,
 * redirects to Overview. A model agents cannot use yet says why at the top
 * of Overview in plain words (`modelProblem`), from the condition that
 * failed, and its Technical details open on arrival; the alert's Show
 * conditions reveals them. **Edit** opens the Connect-a-model flow prefilled
 * (`EditModelPage`), the same way agents and skills are edited. A CR the
 * portal must not write (tool-owned, no RBAC, or a provider the form does not
 * speak) offers no Edit, and an alert says why where the reason is not just
 * the reader's permissions.
 *
 * Mounted inside the plugin's query client, a `ServingProvider` and an
 * `AgentsDataProvider`, as `CustomizeModelPage` mounts it.
 *
 * This is the page's one `ErrorsProvider`, and it is required, not
 * decorative: the Technical details' `GitOpsCard` reports the failures of its
 * Flux lookups through `useShowErrors`, which throws without this context, as
 * on the agent page. The route keeps the page outside muster's provider, so no
 * other errors panel sits above it.
 */
export function ModelDetailPage() {
  return (
    <ErrorsProvider>
      <ModelDetailPageContent />
    </ErrorsProvider>
  );
}
