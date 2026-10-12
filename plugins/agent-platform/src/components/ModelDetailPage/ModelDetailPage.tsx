import { ReactNode, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ModelConfig,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import {
  DateComponent,
  EmptyStateCard,
  type Fact,
  FactsColumn,
  LoadingIndicator,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
  StatusDot,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  modelConfigFormValues,
  modelConfigOwner,
} from '../../lib/modelConfigs';
import { contextWindowFor } from '../../lib/contextWindows';
import { modelStatus } from '../../lib/customize';
import { useDeleteModelConfig } from '../../hooks/useDeleteModelConfig';
import { clientLookupOf } from '../../lib/serving';
import { modelEditRouteRef } from '../../routes';
import { InstallationChip } from '../InstallationChip';
import { ModelServingStatus } from '../ModelServingStatus';
import { toModelRow, toModelServedBy } from '../ModelsTable';
import { useServing } from '../ServingProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { ModelActionsMenu } from './ModelActionsMenu';
import { ModelReadView } from './ModelReadView';
import { describeContextWindow } from './modelUsage';

const useStyles = makeStyles({
  column: {
    maxWidth: 960,
  },
});

/**
 * The page's outer frame: the platform-standard page frame (`ShellPage`) —
 * breadcrumbs reading "Customize / Models / <model>", the
 * model's name as the h1 at the standard scale, its status, environment and
 * provider beside it, and the facts in the column beside the content. The
 * actions the page registers land in that header's slot.
 *
 * A component of its own so every exit — loading, not found, and the model
 * itself — gets the same frame.
 */
function ModelFrame({
  title,
  heading,
  badges,
  meta,
  aside,
  children,
}: {
  /** The shell header's h1, and the breadcrumbs' last entry. */
  title: string;
  /** The h1 instead of `title`, e.g. its skeleton while the model is read. */
  heading?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ShellPage
      title={heading ?? title}
      breadcrumbs={[
        { label: 'Customize', href: SHELL_CUSTOMIZE_PATH },
        { label: 'Models', href: `${SHELL_CUSTOMIZE_PATH}/models` },
        { label: title },
      ]}
      badges={badges}
      meta={meta}
      aside={aside}
    >
      {children}
    </ShellPage>
  );
}

/** The facts beside the model: what it calls, where, and since when. */
export function modelFacts({
  modelConfig,
  installation,
  contextWindow,
}: {
  modelConfig: ModelConfig;
  installation: string;
  /** The window the context-window table names for the model, when it does. */
  contextWindow: number | undefined;
}): Fact[] {
  const created = modelConfig.getCreatedTimestamp();
  const facts: Fact[] = [
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
  if (created) {
    facts.push({
      label: 'Created',
      value: (
        <Text variant="body-small">
          <DateComponent value={created} />
        </Text>
      ),
    });
  }
  facts.push({
    label: 'Technical name',
    value: `${modelConfig.getNamespace() ?? ''}/${modelConfig.getName()}`,
  });
  return facts;
}

/**
 * One model, as a read view with Edit as an action, per the prototype: what it
 * cost and how much it was used, the agents that run on it, and the facts
 * beside it. **Edit** opens the Connect-a-model flow prefilled
 * (`EditModelPage`), the same way agents and skills are edited. A CR the
 * portal must not write (tool-owned, no RBAC, or a provider the form does not
 * speak) offers no Edit, and an alert says why where the reason is not just
 * the reader's permissions.
 */
export function ModelDetailPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const modelEditRoute = useRouteRef(modelEditRouteRef);
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

  // The same block the Model configs list shows in its Endpoint cell: what
  // the serving layer says about the model behind this config, and the fix
  // where there is one. Nothing for provider defaults and external endpoints.
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
        aside={<ShellPageFactsSkeleton />}
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
            <Link to={`${SHELL_CUSTOMIZE_PATH}/models`}>Back to models</Link>
          </Flex>
        ) : (
          <EmptyStateCard
            title="Model not found"
            description={`ModelConfig ${namespace}/${name} does not exist on ${installation}.`}
            actions={
              <Link to={`${SHELL_CUSTOMIZE_PATH}/models`}>Back to models</Link>
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
  const facts = modelFacts({ modelConfig, installation, contextWindow });

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
      aside={<FactsColumn aria-label="About this model" facts={facts} />}
    >
      <div className={classes.column}>
        <Flex direction="column" gap="5">
          {servedBy && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="2">
                  <ModelServingStatus
                    serving={servedBy}
                    shortcut={servedBy.shortcut}
                    variant="block"
                  />
                  <Text variant="body-small" color="secondary">
                    {servedBy.message}
                  </Text>
                </Flex>
              </CardBody>
            </Card>
          )}
          {owner && (
            <Alert
              status="info"
              title={`Managed by ${owner}`}
              description={`${owner} asserts this model and would revert portal edits. Change it where ${owner} is configured.`}
            />
          )}
          {isUnsupportedProvider && !owner && (
            <Alert
              status="info"
              title={`Provider ${modelConfig.getProvider()} is not editable here`}
              description="The form covers OpenAI-compatible, Anthropic, Gemini and Ollama models; manage this one with kubectl."
            />
          )}

          <ModelReadView
            installation={installation}
            namespace={namespace}
            name={name}
            model={modelConfig.getModel()}
            label={modelConfig.getDisplayName()}
          />
        </Flex>
      </div>
    </ModelFrame>
  );
}
