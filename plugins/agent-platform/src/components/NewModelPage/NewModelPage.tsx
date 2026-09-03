import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  Select,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  SectionHeader,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';

import { modelConfigsRouteRef } from '../../routes';
import {
  INITIAL_MODEL_CONFIG_FORM,
  MODEL_CONFIG_NAMESPACE,
  ModelConfigFormValues,
  validateModelConfigForm,
} from '../../lib/modelConfigs';
import { useReachableInstallations } from '../../hooks/useReachableInstallations';
import { useSaveModelConfig } from '../../hooks/useSaveModelConfig';
import { ModelConfigFormFields } from '../ModelConfigForm';

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

export function NewModelPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const modelsLink = useRouteRef(modelConfigsRouteRef);

  // Every reachable installation is offered — deliberately not just the ones
  // that already have models (the agent create flow's filter): an installation
  // with none is exactly where the first model gets added.
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const allInstallations = installations.map(installation => installation.name);
  const { installations: reachableInstallations, isProbing } =
    useReachableInstallations(allInstallations);

  const [installation, setInstallation] = useState<string | undefined>();
  const [values, setValues] = useState<ModelConfigFormValues>(
    INITIAL_MODEL_CONFIG_FORM,
  );
  // Show validation feedback only once the user has tried to submit, so the
  // form doesn't shout about empty fields before they've done anything.
  const [showValidation, setShowValidation] = useState(false);

  const { save, isSaving, error, reset } = useSaveModelConfig();

  // The sole installation on a single-management-cluster instance: nothing to
  // choose, so pick it instead of offering a one-option dropdown.
  const singleInstallation =
    !isLoadingInstallations && installations.length === 1
      ? installations[0].name
      : undefined;
  useEffect(() => {
    if (singleInstallation && installation !== singleInstallation) {
      setInstallation(singleInstallation);
    }
  }, [singleInstallation, installation]);

  const onChange = useCallback((patch: Partial<ModelConfigFormValues>) => {
    setValues(prev => ({ ...prev, ...patch }));
  }, []);

  const validationErrors = [
    ...(installation ? [] : ['Select an installation']),
    ...validateModelConfigForm(values),
  ];

  const onCancel = useCallback(() => {
    if (modelsLink) {
      navigate(modelsLink());
    }
  }, [modelsLink, navigate]);

  const onSubmit = useCallback(async () => {
    if (validationErrors.length > 0) {
      setShowValidation(true);
      return;
    }
    reset();
    try {
      await save({ installation: installation!, values });
    } catch {
      // Left on the page: the mutation error renders in the alert below.
      return;
    }
    toastApi.post({
      title: `Model "${values.displayName.trim() || values.name}" added`,
      // The controller still has to accept it (it resolves the key Secret
      // first), which the list's status column reports.
      description:
        'kagent is picking it up — the status column shows when it is accepted.',
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
    if (modelsLink) {
      navigate(modelsLink());
    }
    // validationErrors is derived from `values`/`installation`, both already
    // dependencies; listing it too would re-memoize on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    installation,
    values,
    save,
    reset,
    toastApi,
    modelsLink,
    navigate,
    validationErrors.length,
  ]);

  // Memoized so the header actions slot only updates when the handlers change,
  // not on every keystroke (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button variant="tertiary" onPress={onCancel} isDisabled={isSaving}>
          Cancel
        </Button>
        <Button variant="primary" onPress={onSubmit} isDisabled={isSaving}>
          {isSaving ? 'Adding…' : 'Add model'}
        </Button>
      </Flex>
    ),
    [onCancel, onSubmit, isSaving],
  );
  useProvidePageHeaderActions(actions);

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Add a model
        </Text>
        <Text as="p" className={classes.intro}>
          Make a model available for agents on an installation. It is stored as
          a kagent ModelConfig in the <code>{MODEL_CONFIG_NAMESPACE}</code>{' '}
          namespace; the API key, if any, goes into a Secret next to it.
        </Text>

        <Flex direction="column" gap="4">
          {!singleInstallation && (
            <Card>
              <CardBody>
                <SectionHeader
                  title="Installation"
                  description="The management cluster this model becomes available on."
                />
                <Flex direction="column" gap="2">
                  <Select
                    aria-label="Installation"
                    isRequired
                    options={reachableInstallations.map(name => ({
                      id: name,
                      label: name,
                    }))}
                    selectedKey={installation ?? null}
                    onSelectionChange={key =>
                      setInstallation(key ? String(key) : undefined)
                    }
                  />
                  {isProbing && (
                    <Text variant="body-small" color="secondary">
                      Still checking the remaining installations…
                    </Text>
                  )}
                </Flex>
              </CardBody>
            </Card>
          )}

          <ModelConfigFormFields
            values={values}
            onChange={onChange}
            mode="create"
          />

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                {showValidation && validationErrors.length > 0 && (
                  <Alert
                    status="danger"
                    title="Please fix the following before continuing"
                    description={validationErrors.join('. ')}
                  />
                )}
                {error && (
                  <Alert
                    status="danger"
                    title="The model could not be added"
                    description={error.message}
                  />
                )}
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
