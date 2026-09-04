import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Content, Progress } from '@backstage/core-components';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Button, Card, CardBody, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ModelConfig,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { modelConfigsRouteRef } from '../../routes';
import {
  modelConfigFormValues,
  modelConfigOwner,
  ModelConfigFormValues,
  validateModelConfigForm,
} from '../../lib/modelConfigs';
import { useSaveModelConfig } from '../../hooks/useSaveModelConfig';
import { useDeleteModelConfig } from '../../hooks/useDeleteModelConfig';
import { clientLookupOf } from '../../lib/serving';
import { ModelConfigFormFields } from '../ModelConfigForm';
import { ModelServingStatus } from '../ModelServingStatus';
import { toModelServedBy } from '../ModelsTable';
import { useServing } from '../ServingProvider';
import { ModelActionsMenu } from './ModelActionsMenu';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
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
 * One model, as an editable form — and deliberately also the read view: what
 * a ModelConfig *is* fits the same fields, so a CR the portal must not write
 * (tool-owned, no RBAC, or a provider this form does not speak) renders the
 * identical page with the fields disabled and an alert saying why.
 */
export function ModelDetailPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const modelsLink = useRouteRef(modelConfigsRouteRef);
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
    // We type against a single version (v1alpha2), so skip API discovery —
    // same reasoning as ModelConfigsProvider.
    { name, namespace, enableDiscovery: false },
  );

  const owner = modelConfig ? modelConfigOwner(modelConfig) : undefined;
  const prefilled = modelConfig
    ? modelConfigFormValues(modelConfig)
    : undefined;
  const isUnsupportedProvider = Boolean(modelConfig) && !prefilled;

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

  const [values, setValues] = useState<ModelConfigFormValues | undefined>();
  // Seed the form once when the CR first resolves; a ref makes this a one-shot
  // so a background refetch never clobbers in-progress edits.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && prefilled) {
      seeded.current = true;
      setValues(prefilled);
    }
  }, [prefilled]);

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

  const onCancel = useCallback(() => {
    if (modelsLink) {
      navigate(modelsLink());
    }
  }, [modelsLink, navigate]);

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
      // Left on the page: the mutation error renders in the alert below.
      return;
    }
    toastApi.post({
      title: `Model "${values.displayName.trim() || values.name}" saved`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
    if (modelsLink) {
      navigate(modelsLink());
    }
    // validationErrors derives from `values`/`modelConfig`, both dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values,
    modelConfig,
    installation,
    save,
    reset,
    toastApi,
    modelsLink,
    navigate,
    validationErrors.length,
  ]);

  // Memoized so the header actions slot only updates when the handlers change.
  // The kebab gets the page's deletion result as a prop: it renders in the
  // shared header, outside the plugin's QueryClientProvider.
  const actions = useMemo(
    () => (
      <Flex gap="2" align="center">
        <Button variant="tertiary" onPress={onCancel} isDisabled={isSaving}>
          {isEditable ? 'Cancel' : 'Back to models'}
        </Button>
        {isEditable && (
          <Button variant="primary" onPress={onSave} isDisabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
        {modelConfig && (
          <ModelActionsMenu modelConfig={modelConfig} deletion={deletion} />
        )}
      </Flex>
    ),
    [onCancel, onSave, isSaving, isEditable, modelConfig, deletion],
  );
  useProvidePageHeaderActions(actions);

  if (isLoading) {
    return (
      <Content>
        <Progress aria-label="Loading model" />
      </Content>
    );
  }

  if (!modelConfig) {
    return (
      <Content>
        <Alert
          status="warning"
          title="Model not found"
          description={
            errors.length > 0
              ? `ModelConfig ${namespace}/${name} on ${installation} could not be read. It may have been deleted, or you may not have permission to read it.`
              : `ModelConfig ${namespace}/${name} does not exist on ${installation}.`
          }
        />
      </Content>
    );
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          {modelConfig.getDisplayName()}
        </Text>
        <Text as="p" color="secondary" className={classes.intro}>
          ModelConfig <code>{`${namespace}/${name}`}</code> on {installation}.
        </Text>

        <Flex direction="column" gap="4">
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
              description="This form covers OpenAI-compatible, Anthropic, Gemini and Ollama models. Manage this config with kubectl."
            />
          )}
          {!owner &&
            !isUnsupportedProvider &&
            !mayUpdate &&
            !isCheckingPermission && (
              <Alert
                status="info"
                title="Read-only"
                description="You don't have permission to change ModelConfigs on this installation."
              />
            )}

          {values ? (
            <ModelConfigFormFields
              values={values}
              onChange={onChange}
              mode="edit"
              isReadOnly={!isEditable}
            />
          ) : (
            // Unsupported provider: no form values to edit, but the essentials
            // are still worth showing.
            <Card>
              <CardBody>
                <Flex direction="column" gap="2">
                  <Text>
                    Provider: <code>{modelConfig.getProvider() ?? '—'}</code>
                  </Text>
                  <Text>
                    Model: <code>{modelConfig.getModel() ?? '—'}</code>
                  </Text>
                  {modelConfig.getEndpoint() && (
                    <Text>
                      Endpoint: <code>{modelConfig.getEndpoint()}</code>
                    </Text>
                  )}
                </Flex>
              </CardBody>
            </Card>
          )}

          {isEditable && (
            <Card>
              <CardBody>
                <Flex direction="column" gap="3">
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
                  {actions}
                </Flex>
              </CardBody>
            </Card>
          )}
        </Flex>
      </div>
    </Content>
  );
}
