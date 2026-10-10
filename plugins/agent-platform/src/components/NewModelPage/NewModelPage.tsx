import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Link,
  Select,
  Text,
} from '@backstage/ui';
import {
  SectionHeader,
  useFieldValidation,
  useProvidePageHeaderActions,
  useSelectFieldError,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ALL_INSTALLATIONS,
  useInstallationInventory,
  useInstallations,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';

import { modelsRouteRef, servingRouteRef } from '../../routes';
import { useAgentShell } from '../../hooks/useAgentShell';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { hasServingLayer, useOptionalServing } from '../ServingProvider';
import {
  INITIAL_MODEL_CONFIG_FORM,
  ModelConfigFormValues,
  modelConfigFieldErrors,
} from '../../lib/modelConfigs';
import { slugify } from '../../lib/slugify';
import { useSaveModelConfig } from '../../hooks/useSaveModelConfig';
import { ModelConfigFormFields } from '../ModelConfigForm';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

export function NewModelPage() {
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const modelsLink = useRouteRef(modelsRouteRef);

  // Every reachable installation that runs kagent is offered, home first (the
  // gs installation inventory) — deliberately not just the ones that already
  // have models (the agent create flow's filter): an installation with none is
  // exactly where the first model gets added.
  const { installations, isLoading: isLoadingInstallations } =
    useInstallations();
  const inventory = useInstallationInventory();
  const reachableInstallations = inventory.installationsWith('kagent');
  const isProbing = inventory.isLoading || inventory.isProbing;

  const [installation, setInstallation] = useState<string | undefined>();

  // A pinned installation scope is the obvious default here: the person came
  // from a list narrowed to it. Only ever fills an empty choice, and only once
  // the installation is known to run kagent.
  const { scope } = useInstallationScope();
  useEffect(() => {
    if (
      installation === undefined &&
      scope !== ALL_INSTALLATIONS &&
      reachableInstallations.includes(scope)
    ) {
      setInstallation(scope);
    }
    // reachableInstallations is derived fresh each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installation, scope, reachableInstallations.join(',')]);
  const [values, setValues] = useState<ModelConfigFormValues>(
    INITIAL_MODEL_CONFIG_FORM,
  );
  // Each field shows its own problem once the person has tried to submit —
  // not before, so the form doesn't shout about empty fields up front — and a
  // blocked submit moves the focus to the first one.
  const validation = useFieldValidation();
  const { reveal } = validation;

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

  // The technical name is filled in from the display name until the person
  // types one of their own (the same rule as agent creation's slug).
  const [nameEdited, setNameEdited] = useState(false);
  const onChange = useCallback(
    (patch: Partial<ModelConfigFormValues>) => {
      if (patch.name !== undefined) {
        setNameEdited(true);
      }
      setValues(prev => {
        const next = { ...prev, ...patch };
        if (
          patch.displayName !== undefined &&
          patch.name === undefined &&
          !nameEdited
        ) {
          next.name = slugify(patch.displayName);
        }
        return next;
      });
    },
    [nameEdited],
  );

  const installationError = installation ? undefined : 'Select an installation';
  const fieldErrors = modelConfigFieldErrors(values);
  const errorCount =
    (installationError ? 1 : 0) + Object.keys(fieldErrors).length;
  const installationSelectError = useSelectFieldError(
    validation.errorFor(installationError),
  );

  // Where Close and Cancel leave to: the shell's Customize screen's Models
  // tab, or the classic chrome's models list.
  const agentShell = useAgentShell();
  const closeHref = agentShell
    ? `${SHELL_CUSTOMIZE_PATH}/models`
    : (modelsLink?.() ?? '/');

  const onSubmit = useCallback(async () => {
    if (errorCount > 0) {
      reveal();
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
  }, [
    installation,
    values,
    save,
    reset,
    toastApi,
    modelsLink,
    navigate,
    errorCount,
    reveal,
  ]);

  // Memoized so the frame's footer slot only updates when the handlers change,
  // not on every keystroke (see useProvidePageHeaderActions). Cancel belongs
  // to the frame's footer, so only the primary lives here.
  // The way to self-hosted models, where a serving layer exists to host one.
  const servingRoute = useRouteRef(servingRouteRef);
  const serving = useOptionalServing();
  const hostingHref =
    servingRoute && serving && hasServingLayer(serving)
      ? servingRoute()
      : undefined;

  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onSubmit} isDisabled={isSaving}>
        {isSaving ? 'Adding…' : 'Add model'}
      </Button>
    ),
    [onSubmit, isSaving],
  );
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title="Add model"
      context="Customize / Models"
      closeHref={closeHref}
      width="medium"
    >
      <WizardStepHeading title="Connect a model">
        Agents run on the models you add here.
        {hostingHref ? (
          <>
            {' '}
            To run a model on your own GPUs instead, use{' '}
            <Link href={hostingHref}>Model hosting</Link>.
          </>
        ) : null}
      </WizardStepHeading>

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
                {...installationSelectError.selectProps}
              />
              {installationSelectError.message}
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
        errors={validation.shown ? fieldErrors : undefined}
      />

      {error && (
        <Alert
          status="danger"
          title="The model could not be added"
          description={error.message}
        />
      )}
    </WizardFrame>
  );
}
