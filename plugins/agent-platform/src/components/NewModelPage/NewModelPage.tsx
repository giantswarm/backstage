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
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useCloseHref } from '../../hooks/useCloseHref';
import { hasServingLayer, useOptionalServing } from '../ServingProvider';
import {
  INITIAL_MODEL_CONFIG_FORM,
  isListenerRouted,
  MODEL_CONFIG_NAMESPACE,
  modelConfigFieldErrors,
  modelConfigFormChanged,
  modelConfigFormValues,
  ModelConfigFormValues,
  modelConfigOwner,
  type ModelProvider,
  providersFor,
} from '../../lib/modelConfigs';
import { isMarkedDefault, markedIn } from '../../lib/defaultModel';
import { slugify } from '../../lib/slugify';
import { OWNER_LABEL, ownerOf, tenantInSentence } from '../../lib/tenants';
import { useModelNamespaces } from '../../hooks/useModelNamespaces';
import {
  type SaveModelConfigResult,
  useSaveModelConfig,
} from '../../hooks/useSaveModelConfig';
import { ModelConfigFormFields } from '../ModelConfigForm';
import { useModelConfigs } from '../ModelConfigsProvider';
import { DefaultModelChoice } from './DefaultModelChoice';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

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
 * Connect a model (`/customize/models/new`): one step that writes a
 * kagent ModelConfig and its key Secret. Plain fields first — display name,
 * provider and model, the optional API key — and the technical name (filled
 * in from the display name) and TLS verification under More options, the
 * agent wizard's idiom.
 *
 * With `edit`, the same flow changes an existing model (`EditModelPage`,
 * `/customize/models/<installation>/<namespace>/<name>/edit`): prefilled
 * from the CR, its environment and technical name fixed, the key field empty
 * meaning "keep the stored key", and **Save changes** waiting for a change.
 */
export function NewModelPage({ edit }: { edit?: ModelEdit } = {}) {
  const navigate = useNavigate();
  const toastApi = useApi(toastApiRef);
  const modelsLink = useRouteRef(modelsRouteRef);
  const { models: customizeModels } = useCustomizePaths();
  const listHref = useCloseHref(customizeModels, modelsLink?.());

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
  // Each field shows its own problem once the person leaves it having typed
  // in it, or tries to submit — not while they first type — and a blocked
  // submit moves the focus to the first one (the `forms` skill).
  const validation = useFieldValidation();
  const { reveal } = validation;
  // More options (technical name, TLS verification) starts folded: its
  // defaults fit most models.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const { save, isSaving, error, reset } = useSaveModelConfig();
  const { directory } = useOrganizationDirectory();

  // Where the model goes: an existing one stays where it is; a new one goes
  // to the platform unless the person picks an Organization they administer.
  const { namespaces, isLoading: isLoadingNamespaces } = useModelNamespaces(
    edit ? undefined : installation,
  );
  const [chosenNamespace, setChosenNamespace] = useState<string>();
  let namespace: string;
  if (edit) {
    namespace = edit.modelConfig.getNamespace() ?? MODEL_CONFIG_NAMESPACE;
  } else if (chosenNamespace && namespaces.includes(chosenNamespace)) {
    namespace = chosenNamespace;
  } else {
    namespace = namespaces[0] ?? MODEL_CONFIG_NAMESPACE;
  }
  const routed = isListenerRouted(namespace, directory);
  const providers = useMemo<readonly ModelProvider[]>(() => {
    const offered = providersFor(namespace, directory);
    return offered.includes(initialValues.provider) || !edit
      ? offered
      : [...offered, initialValues.provider];
  }, [namespace, edit, initialValues.provider, directory]);
  // A provider the new place does not offer gives way to its first one.
  // The listener is a routed model's endpoint, so a typed one goes too.
  useEffect(() => {
    if (!providers.includes(values.provider)) {
      setValues(prev => ({ ...prev, provider: providers[0] }));
    }
    if (!edit && routed && (values.endpoint || values.insecureSkipTlsVerify)) {
      setValues(prev => ({
        ...prev,
        endpoint: '',
        insecureSkipTlsVerify: false,
      }));
    }
  }, [
    providers,
    values.provider,
    edit,
    routed,
    values.endpoint,
    values.insecureSkipTlsVerify,
  ]);

  // The namespace's default marks as listed, for the default choice. The save
  // reads them again before it writes.
  const { modelConfigsFor, isLoading: isLoadingModels } = useModelConfigs();
  const namespaceModels = useMemo(
    () =>
      installation
        ? modelConfigsFor(installation).filter(
            mc => (mc.getNamespace() ?? '') === namespace,
          )
        : [],
    [installation, modelConfigsFor, namespace],
  );
  const marks = useMemo(
    () => markedIn(namespaceModels, namespace),
    [namespaceModels, namespace],
  );
  const markOwner = namespaceModels
    .filter(isMarkedDefault)
    .map(mc => modelConfigOwner(mc))
    .find(Boolean);
  const [makeDefault, setMakeDefault] = useState(false);

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
    edit || installation ? undefined : 'Choose an environment.';
  const fieldErrors = modelConfigFieldErrors(values, {
    isEdit: Boolean(edit),
    original: edit ? initialValues : undefined,
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
    validation.errorFor('installation', installationError),
  );
  // A problem with a field behind More options opens it, so the field that
  // says what is wrong is never out of sight (nor out of the focus's reach).
  const hasHiddenProblem = Boolean(fieldErrors.name);
  // An edit with nothing changed has nothing to save — not a field's fault,
  // so the button waits instead of pointing at one.
  const isChanged = !edit || modelConfigFormChanged(values, initialValues);

  // Where Close and Cancel leave to: the model itself when editing; else the
  // shell's Customize screen's Models tab, or, where the app binds none, the
  // plugin's own Models address, which says the list is not available.
  const closeHref = edit ? edit.detailHref : listHref;

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
    let saved: SaveModelConfigResult;
    try {
      saved = await save({
        installation: installation!,
        values,
        original: edit?.modelConfig,
        ...(edit ? {} : { namespace, makeDefault, expectedMarks: marks }),
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
      title: saved.isDefault
        ? `Model "${label}" connected as the default`
        : `Model "${label}" connected`,
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
    namespace,
    makeDefault,
    marks,
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
      documentTitle={
        edit
          ? [`Edit ${edit.modelConfig.getDisplayName()}`, 'Models']
          : undefined
      }
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
              variant="title-x-small"
              title="Environment"
              description="Choose the management cluster this model becomes available on."
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

      {!edit && installation && namespaces.length > 1 && (
        <Card>
          <CardBody>
            <SectionHeader
              variant="title-x-small"
              title={OWNER_LABEL}
              description="A model serves the agents of its owner: the platform’s, or one organization’s."
            />
            <Select
              aria-label={OWNER_LABEL}
              isRequired
              options={namespaces.map(choice => ({
                id: choice,
                label: ownerOf(choice, directory),
              }))}
              selectedKey={namespace}
              onSelectionChange={key => {
                if (key) {
                  setChosenNamespace(String(key));
                  setMakeDefault(false);
                }
              }}
            />
          </CardBody>
        </Card>
      )}

      <ModelConfigFormFields
        providers={providers}
        routed={routed}
        values={values}
        onChange={onChange}
        mode={edit ? 'edit' : 'create'}
        errors={fieldErrors}
        validation={validation}
        moreOptionsOpen={moreOptionsOpen}
        onMoreOptionsOpenChange={setMoreOptionsOpen}
        originalProvider={edit?.modelConfig.getProvider()}
        originalProjectID={edit ? initialValues.projectID : undefined}
      />

      {!edit && installation && (
        <DefaultModelChoice
          where={tenantInSentence(namespace, directory)}
          marks={marks.map(
            name =>
              namespaceModels
                .find(mc => mc.getName() === name)
                ?.getDisplayName() ?? name,
          )}
          markOwner={markOwner}
          isLoading={isLoadingModels || isLoadingNamespaces}
          isSelected={makeDefault}
          onChange={setMakeDefault}
        />
      )}

      {error && (
        <Alert
          status="danger"
          title={
            edit ? 'Could not save the model' : 'Could not connect the model'
          }
          description={error.message}
        />
      )}
    </WizardFrame>
  );
}
