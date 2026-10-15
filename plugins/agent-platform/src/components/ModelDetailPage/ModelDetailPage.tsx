import { ReactNode, useCallback, useMemo } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';
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
  modelConfigFormValues,
  modelConfigOwner,
} from '../../lib/modelConfigs';
import { contextWindowFor } from '../../lib/contextWindows';
import { modelStatus } from '../../lib/customize';
import { modelProblem } from '../../lib/modelProblem';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useDeleteModelConfig } from '../../hooks/useDeleteModelConfig';
import { clientLookupOf } from '../../lib/serving';
import { modelEditRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { InstallationChip } from '../InstallationChip';
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
 */
function ManagedByValue({ owner }: { owner: string }) {
  return (
    <Flex direction="column" gap="1">
      <Text variant={useFactTextVariant()}>{owner}</Text>
      <Text variant="body-small" color="secondary">
        {owner} would revert edits made here, so change the model where {owner}{' '}
        is configured.
      </Text>
    </Flex>
  );
}

/** Overview's plain facts: what it calls, where, who owns it, and since when. */
export function modelFacts({
  modelConfig,
  installation,
  contextWindow,
  owner,
}: {
  modelConfig: ModelConfig;
  installation: string;
  /** The window the context-window table names for the model, when it does. */
  contextWindow: number | undefined;
  /** The tool that asserts the model (`modelConfigOwner`), if any. */
  owner?: string;
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
  if (contextWindow !== undefined) {
    facts.push({
      label: 'Context window',
      value: describeContextWindow(contextWindow),
    });
  }
  facts.push({ label: 'Environment', value: installation });
  if (owner) {
    facts.push({
      label: 'Managed by',
      value: <ManagedByValue owner={owner} />,
    });
  }
  if (created) {
    facts.push({
      label: 'Created',
      value: <DateComponent value={created} />,
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
    !owner &&
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
    [isEditable, modelEditRoute, openEdit, modelConfig, deletion],
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
  const contextWindow = contextWindowFor(
    modelConfig.getModel(),
    config?.getOptional<Record<string, unknown>>(
      'agentPlatform.models.contextWindows',
    ),
  );
  const facts = modelFacts({
    modelConfig,
    installation,
    contextWindow,
    owner,
  });

  return (
    <ModelFrame
      title={modelConfig.getDisplayName()}
      badges={
        <>
          <StatusDot tone={status.tone} label={status.label} />
          <InstallationChip installation={installation} />
        </>
      }
      meta={modelConfig.getProvider()}
      tabs={modelPageTabs({
        usedBy: agentsUnreachable ? undefined : using.length,
        isLoading: agentsLoading,
      })}
    >
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
