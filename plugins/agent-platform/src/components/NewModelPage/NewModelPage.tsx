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
import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  searchableIf,
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
  modelConfigFieldErrors,
  modelConfigFormChanged,
  modelConfigFormValues,
  ModelConfigFormValues,
} from '../../lib/modelConfigs';
import { slugify } from '../../lib/slugify';
import { useSaveModelConfig } from '../../hooks/useSaveModelConfig';
import { ModelConfigFormFields } from '../ModelConfigForm';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/** An existing model, for the flow to change instead of connecting a new one. */
export type ModelEdit = {
  installation: string;
  /**
   * The CR as last read: the form is seeded from it once, and the save
   * patches it. Only one the portal may write and whose provider the form
   * speaks — `EditModelPage` decides that before handing over.
   */
  modelConfig: ModelConfig;
  /** The model's own page: where Close, Cancel and a save lead. */
  detailHref: string;
};

/**
 * Connect a model (`/agent-platform/models/new`): one step that writes a
 * kagent ModelConfig and its key Secret. Plain fields first — display name,
 * provider and model, the optional API key — and the technical name (filled
 * in from the display name) and TLS verification under More options, the
 * agent wizard's idiom.
 *
 * With `edit`, the same flow changes an existing model (`EditModelPage`,
 * `/agent-platform/models/edit/<installation>/<namespace>/<name>`): prefilled
 * from the CR, its environment and technical name fixed, the key field empty
 * meaning "keep the stored key", and **Save changes** waiting for a change.
 */
export function NewModelPage({ edit }: { edit?: ModelEdit } = {}) {
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

  // An existing model stays where it is.
  const [installation, setInstallation] = useState<string | undefined>(
    edit?.installation,
  );

  // A pinned installation scope is the obvious default here: the person came
  // from a list narrowed to it. Only ever fills an empty choice, and only once
  // the installation is known to run kagent.
  const { scope } = useInstallationScope();
  useEffect(() => {
    if (
      !edit &&
      installation === undefined &&
      scope !== ALL_INSTALLATIONS &&
      reachableInstallations.includes(scope)
    ) {
      setInstallation(scope);
    }
    // reachableInstallations is derived fresh each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, installation, scope, reachableInstallations.join(',')]);

  // Seeded once: a later re-read of the CR does not reset what the person is
  // changing (the same rule as the agent edit wizard).
  const [initialValues] = useState<ModelConfigFormValues>(
    () =>
      (edit && modelConfigFormValues(edit.modelConfig)) ??
      INITIAL_MODEL_CONFIG_FORM,
  );
  const [values, setValues] = useState<ModelConfigFormValues>(initialValues);
  // Each field shows its own problem once the person has tried to submit —
  // not before, so the form doesn't shout about empty fields up front — and a
  // blocked submit moves the focus to the first one.
  const validation = useFieldValidation();
  const { reveal } = validation;
  // More options (technical name, TLS verification) starts folded: its
  // defaults fit most models.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const { save, isSaving, error, reset } = useSaveModelConfig();

  // The sole installation on a single-management-cluster instance: nothing to
  // choose, so pick it instead of offering a one-option dropdown.
  const singleInstallation =
    !isLoadingInstallations && installations.length === 1
      ? installations[0].name
      : undefined;
  useEffect(() => {
    if (!edit && singleInstallation && installation !== singleInstallation) {
      setInstallation(singleInstallation);
    }
  }, [edit, singleInstallation, installation]);

  // The technical name is filled in from the display name until the person
  // types one of their own (the same rule as agent creation's slug). An
  // existing model's name is fixed.
  const [nameEdited, setNameEdited] = useState(false);
  const onChange = useCallback(
    (patch: Partial<ModelConfigFormValues>) => {
      if (patch.name !== undefined) {
        setNameEdited(true);
      }
      setValues(prev => {
        const next = { ...prev, ...patch };
        if (
          !edit &&
          patch.displayName !== undefined &&
          patch.name === undefined &&
          !nameEdited
        ) {
          next.name = slugify(patch.displayName);
        }
        return next;
      });
    },
    [edit, nameEdited],
  );

  const installationError =
    edit || installation ? undefined : 'Select an environment';
  const fieldErrors = modelConfigFieldErrors(values, {
    isEdit: Boolean(edit),
  });
  // A technical name that is only empty because the display name is: the
  // display name's own problem says it all, so More options is not opened on
  // a field the person never touched.
  if (!edit && !nameEdited && fieldErrors.displayName && !values.name) {
    delete fieldErrors.name;
  }
  const errorCount =
    (installationError ? 1 : 0) + Object.keys(fieldErrors).length;
  const installationSelectError = useSelectFieldError(
    validation.errorFor(installationError),
  );
  // A problem with a field behind More options opens it, so the field that
  // says what is wrong is never out of sight (nor out of the focus's reach).
  const hasHiddenProblem = Boolean(fieldErrors.name);
  // An edit with nothing changed has nothing to save — not a field's fault,
  // so the button waits instead of pointing at one.
  const isChanged = !edit || modelConfigFormChanged(values, initialValues);

  // Where Close and Cancel leave to: the model itself when editing; else the
  // shell's Customize screen's Models tab, or the classic chrome's list.
  const agentShell = useAgentShell();
  let closeHref = modelsLink?.() ?? '/';
  if (edit) {
    closeHref = edit.detailHref;
  } else if (agentShell) {
    closeHref = `${SHELL_CUSTOMIZE_PATH}/models`;
  }

  const onSubmit = useCallback(async () => {
    if (errorCount > 0) {
      if (hasHiddenProblem) {
        setMoreOptionsOpen(true);
      }
      reveal();
      return;
    }
    if (!isChanged) {
      return;
    }
    reset();
    try {
      await save({
        installation: installation!,
        values,
        original: edit?.modelConfig,
      });
    } catch {
      // Left on the page: the mutation error renders in the alert below.
      return;
    }
    const label = values.displayName.trim() || values.name;
    if (edit) {
      toastApi.post({
        title: `Model "${label}" saved`,
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
      navigate(edit.detailHref);
      return;
    }
    toastApi.post({
      title: `Model "${label}" connected`,
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
    edit,
    installation,
    values,
    save,
    reset,
    toastApi,
    modelsLink,
    navigate,
    errorCount,
    hasHiddenProblem,
    isChanged,
    reveal,
  ]);

  // The way to self-hosted models, where a serving layer exists to host one.
  const servingRoute = useRouteRef(servingRouteRef);
  const serving = useOptionalServing();
  const hostingHref =
    servingRoute && serving && hasServingLayer(serving)
      ? servingRoute()
      : undefined;

  // Memoized so the frame's footer slot only updates when the handlers change,
  // not on every keystroke (see useProvidePageHeaderActions). Cancel belongs
  // to the frame's footer, so only the primary lives here.
  const actions = useMemo(() => {
    let label: string;
    if (edit) {
      label = isSaving ? 'Saving…' : 'Save changes';
    } else {
      label = isSaving ? 'Connecting…' : 'Connect model';
    }
    return (
      <Button
        variant="primary"
        onPress={onSubmit}
        isDisabled={isSaving || !isChanged}
      >
        {label}
      </Button>
    );
  }, [edit, onSubmit, isSaving, isChanged]);
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title={edit ? 'Edit model' : 'Connect a model'}
      context={
        edit
          ? `Customize / Models / ${edit.modelConfig.getDisplayName()}`
          : 'Customize / Models'
      }
      closeHref={closeHref}
      width="medium"
    >
      {edit ? (
        <WizardStepHeading title="Change the model">
          Agents on it pick up the change when you save.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Describe the model">
          Agents run on the models you connect here.
          {hostingHref ? (
            <>
              {' '}
              To run a model on your own GPUs instead, use{' '}
              <Link href={hostingHref}>Model hosting</Link>.
            </>
          ) : null}
        </WizardStepHeading>
      )}

      {!edit && !singleInstallation && (
        <Card>
          <CardBody>
            <SectionHeader
              title="Environment"
              description="The management cluster this model becomes available on."
            />
            <Flex direction="column" gap="2">
              <Select
                aria-label="Environment"
                isRequired
                searchable={searchableIf(reachableInstallations)}
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
                  Still checking the remaining environments…
                </Text>
              )}
            </Flex>
          </CardBody>
        </Card>
      )}

      <ModelConfigFormFields
        values={values}
        onChange={onChange}
        mode={edit ? 'edit' : 'create'}
        errors={validation.shown ? fieldErrors : undefined}
        moreOptionsOpen={moreOptionsOpen}
        onMoreOptionsOpenChange={setMoreOptionsOpen}
        originalProvider={edit?.modelConfig.getProvider()}
      />

      {error && (
        <Alert
          status="danger"
          title={
            edit
              ? 'The model could not be saved'
              : 'The model could not be connected'
          }
          description={error.message}
        />
      )}
    </WizardFrame>
  );
}
