import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Box, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import {
  ModelConfig,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import {
  DateComponent,
  type Fact,
  FactsColumn,
  ShellPage,
  StatusDot,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  modelConfigFormValues,
  modelConfigOwner,
  ModelConfigFormValues,
  validateModelConfigForm,
} from '../../lib/modelConfigs';
import { contextWindowFor } from '../../lib/contextWindows';
import { modelStatus } from '../../lib/customize';
import { useSaveModelConfig } from '../../hooks/useSaveModelConfig';
import { useDeleteModelConfig } from '../../hooks/useDeleteModelConfig';
import { useAgentShell } from '../../hooks/useAgentShell';
import { clientLookupOf } from '../../lib/serving';
import { InstallationChip } from '../InstallationChip';
import { ModelConfigFormFields } from '../ModelConfigForm';
import { ModelServingStatus } from '../ModelServingStatus';
import { toModelRow, toModelServedBy } from '../ModelsTable';
import { useServing } from '../ServingProvider';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { ModelActionsMenu } from './ModelActionsMenu';
import { ModelReadView } from './ModelReadView';
import { describeContextWindow } from './modelUsage';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  form: {
    maxWidth: 640,
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
}));

/**
 * The page's outer frame, the same split the session page makes.
 *
 * Inside the agent-platform shell it is the platform-standard page frame
 * (`ShellPage`): breadcrumbs reading "Customize / Models / <model>", the
 * model's name as the h1 at the standard scale, its status, environment and
 * provider beside it, and the facts in the column beside the content. The
 * actions the page registers land in that header's slot, and the shell's
 * generic sub-page header stands aside because `ShellPage` claims the page
 * header.
 *
 * In classic chrome it is `Content` under the Agent Platform page's header,
 * with the page's own heading inside and the facts under the content.
 *
 * A component of its own so every exit — loading, not found, and the model
 * itself — gets the same frame.
 */
function ModelFrame({
  title,
  badges,
  meta,
  aside,
  children,
}: {
  /** The shell header's h1. */
  title: string;
  badges?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const agentShell = useAgentShell();
  if (!agentShell) {
    return (
      <Content>
        {children}
        {aside && <Box mt="5">{aside}</Box>}
      </Content>
    );
  }
  return (
    <ShellPage
      title={title}
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
      label: 'Memory (context)',
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
 * beside it. **Edit** turns the main column into the form in place; Save
 * returns to the read view. A CR the portal must not write (tool-owned, no
 * RBAC, or a provider the form does not speak) offers no Edit, and an alert
 * says why where the reason is not just the reader's permissions.
 */
export function ModelDetailPage() {
  const classes = useStyles();
  const agentShell = useAgentShell();
  const toastApi = useApi(toastApiRef);
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

  const [isEditing, setEditing] = useState(false);
  const [values, setValues] = useState<ModelConfigFormValues | undefined>();
  const [showValidation, setShowValidation] = useState(false);
  const { save, isSaving, error: saveError, reset } = useSaveModelConfig();
  const deletion = useDeleteModelConfig(modelConfig);

  const isEditable =
    Boolean(modelConfig) &&
    !owner &&
    !isUnsupportedProvider &&
    mayUpdate &&
    !isCheckingPermission;

  const onChange = useCallback((patch: Partial<ModelConfigFormValues>) => {
    setValues(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const validationErrors = values
    ? validateModelConfigForm(values, {
        isEdit: true,
        originalProvider: modelConfig?.getProvider(),
      })
    : [];

  // The form is seeded from the CR as it stands each time Edit opens it, so a
  // change saved (or made elsewhere) since is what the person edits.
  const onEdit = useCallback(() => {
    if (!modelConfig) {
      return;
    }
    reset();
    setShowValidation(false);
    setValues(modelConfigFormValues(modelConfig));
    setEditing(true);
  }, [modelConfig, reset]);

  const onCancel = useCallback(() => {
    reset();
    setEditing(false);
  }, [reset]);

  const onSave = useCallback(async () => {
    if (!values || !modelConfig) {
      return;
    }
    if (validationErrors.length > 0) {
      setShowValidation(true);
      return;
    }
    reset();
    try {
      await save({ installation, values, original: modelConfig });
    } catch {
      // Left on the form: the mutation error renders in the alert below.
      return;
    }
    toastApi.post({
      title: `Model "${values.displayName.trim() || values.name}" saved`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
    setEditing(false);
    // validationErrors derives from `values`/`modelConfig`, both dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values,
    modelConfig,
    installation,
    save,
    reset,
    toastApi,
    validationErrors.length,
  ]);

  const editing = isEditing && isEditable && Boolean(values);

  // Memoized so the header actions slot only updates when the handlers change.
  // The kebab gets the page's deletion result as a prop: it renders in the
  // shared header, outside the plugin's QueryClientProvider.
  const actions = useMemo(
    () => (
      <Flex gap="2" align="center">
        {editing ? (
          <>
            <Button variant="tertiary" onPress={onCancel} isDisabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" onPress={onSave} isDisabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        ) : (
          isEditable && (
            <Button
              variant="secondary"
              iconStart={<EditIcon fontSize="small" />}
              onPress={onEdit}
            >
              Edit
            </Button>
          )
        )}
        {modelConfig && (
          <ModelActionsMenu modelConfig={modelConfig} deletion={deletion} />
        )}
      </Flex>
    ),
    [
      editing,
      onCancel,
      onSave,
      onEdit,
      isSaving,
      isEditable,
      modelConfig,
      deletion,
    ],
  );
  useProvidePageHeaderActions(actions);

  if (isLoading) {
    return (
      <ModelFrame title="Model">
        <Progress aria-label="Loading model" />
      </ModelFrame>
    );
  }

  if (!modelConfig) {
    return (
      <ModelFrame title="Model">
        <Alert
          status="warning"
          title="Model not found"
          description={
            errors.length > 0
              ? `ModelConfig ${namespace}/${name} on ${installation} could not be read. It may have been deleted, or you may not have permission to read it.`
              : `ModelConfig ${namespace}/${name} does not exist on ${installation}.`
          }
        />
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
        {/* In the shell the header above carries the name and where the
            model is available, at the platform-standard scale; repeating it
            here would double the title. */}
        {!agentShell && (
          <>
            <Flex
              align="center"
              gap="2"
              className={classes.pageTitle}
              style={{ flexWrap: 'wrap' }}
            >
              <Text as="h2" variant="title-large" weight="bold">
                {modelConfig.getDisplayName()}
              </Text>
              <StatusDot tone={status.tone} label={status.label} />
              <InstallationChip installation={installation} />
            </Flex>
            <Text as="p" color="secondary" className={classes.intro}>
              ModelConfig <code>{`${namespace}/${name}`}</code> on{' '}
              {installation}.
            </Text>
          </>
        )}

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
              description={`This model is asserted by ${owner}, which would revert portal edits on its next run — so it is read-only here. Change it where ${owner} is configured.`}
            />
          )}
          {isUnsupportedProvider && !owner && (
            <Alert
              status="info"
              title={`Provider ${modelConfig.getProvider()} is not editable here`}
              description="The edit form covers OpenAI-compatible, Anthropic, Gemini and Ollama models. Manage this config with kubectl."
            />
          )}

          {editing && values ? (
            <Flex direction="column" gap="4" className={classes.form}>
              <ModelConfigFormFields
                values={values}
                onChange={onChange}
                mode="edit"
              />
              {showValidation && validationErrors.length > 0 && (
                <Alert
                  status="danger"
                  title="Please fix the following before saving"
                  description={validationErrors.join('. ')}
                />
              )}
              {saveError && (
                <Alert
                  status="danger"
                  title="The model could not be saved"
                  description={saveError.message}
                />
              )}
              <Flex gap="2" justify="end">
                <Button
                  variant="secondary"
                  onPress={onCancel}
                  isDisabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={onSave}
                  isDisabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </Flex>
            </Flex>
          ) : (
            <ModelReadView
              installation={installation}
              namespace={namespace}
              name={name}
              model={modelConfig.getModel()}
              label={modelConfig.getDisplayName()}
            />
          )}
        </Flex>
      </div>
    </ModelFrame>
  );
}
