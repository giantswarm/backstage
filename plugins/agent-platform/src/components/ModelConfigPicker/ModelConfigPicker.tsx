import { useEffect, useId, useMemo } from 'react';
import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  FieldErrorText,
  ExternalLink,
} from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import {
  isDefaultModelConfig,
  type ModelChoice,
  organizationModelChoice,
  type OrganizationModelChoice,
  preselectedModelConfig,
  type PreselectionReason,
  tenantModelConfigs,
} from './helpers';
import { useAgentManagerModelConfigs } from '../../hooks/useAgentManagerModelConfigs';
import { ownerOf } from '../../lib/tenants';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';
import { ShowMore } from '../ShowMore';

/**
 * How many model cards the picker shows before *Show more*: four rows of the
 * three-column grid. Tens of models are realistic on one environment.
 */
const MODEL_CARDS = 12;

/** Says which model the form picked for the person, and why. */
function preselectionNote(
  reason: PreselectionReason,
  displayName: string,
  installation: string,
): string {
  switch (reason) {
    case 'only':
      return `Preselected: ${displayName}, the only model on ${installation}.`;
    case 'default':
      return `Preselected: ${displayName}, the default model on ${installation}.`;
    case 'first':
    default:
      return `Preselected: ${displayName}, the first one listed, since ${installation} has no default model.`;
  }
}

/**
 * An organization's models are agent-manager's answer for its namespace,
 * and its default is the one agent-manager marks `default`: the form starts
 * with it. An organization without one has none to start with.
 */
function organizationPreselection(
  models: readonly OrganizationModelChoice[],
): { modelConfig: ModelChoice; reason: PreselectionReason } | undefined {
  const marked = models.find(model => model.isDefault);
  return marked ? { modelConfig: marked, reason: 'default' } : undefined;
}

export type ModelConfigPickerProps = {
  /**
   * The field's validation problem, shown under its label once the form wants
   * it seen. The block is then marked `data-invalid`, so a blocked Continue
   * focuses its first model card.
   */
  error?: string;
};

/** agent-manager's reading of an organization's models (`list_model_configs`). */
type OrganizationModels = ReturnType<typeof useAgentManagerModelConfigs>;

/** The picker for a new agent of an organization: its models read first. */
function OrganizationModelConfigPicker({
  error,
  installation,
  organization,
}: ModelConfigPickerProps & { installation: string; organization: string }) {
  const organizationModels = useAgentManagerModelConfigs(
    installation,
    organization,
  );
  return (
    <ModelConfigPickerContent
      error={error}
      organization={organization}
      organizationModels={organizationModels}
    />
  );
}

/**
 * The model a new agent thinks with: an organization's models, and its
 * default, as agent-manager answers them for a new agent of an organization;
 * the environment's ModelConfigs otherwise, and while editing.
 */
export function ModelConfigPicker({ error }: ModelConfigPickerProps = {}) {
  const { state, edit } = useNewAgentForm();
  const { directory } = useOrganizationDirectory();
  if (
    !edit &&
    state.installation &&
    state.tenant !== undefined &&
    directory.has(state.tenant)
  ) {
    return (
      <OrganizationModelConfigPicker
        error={error}
        installation={state.installation}
        organization={state.tenant}
      />
    );
  }
  return <ModelConfigPickerContent error={error} />;
}

function ModelConfigPickerContent({
  error,
  organization,
  organizationModels,
}: ModelConfigPickerProps & {
  /** The organization a new agent is created in, when it is one. */
  organization?: string;
  organizationModels?: OrganizationModels;
}) {
  const classes = useSelectableCardStyles();
  const errorId = `${useId()}-error`;
  const { state, edit, selectModelConfig } = useNewAgentForm();
  const { isLoading, modelConfigsFor, unreachableInstallations } =
    useModelConfigs();
  const newModelLink = useRouteRef(newModelRouteRef);
  const installation = state.installation;

  const label = (
    <>
      <FieldLabel
        label="Model"
        description="This is the model the agent thinks with. Admins add models under Customize → Models."
      />
      {error && <FieldErrorText id={errorId}>{error}</FieldErrorText>}
    </>
  );
  const invalidProps = error ? { 'data-invalid': '' } : {};

  // An existing agent's model is a ModelConfig of its own namespace: an update
  // cannot move the agent, so the other namespaces' models are not offered.
  // A new agent's are those of the tenant it is created in.
  const listed = installation ? modelConfigsFor(installation) : [];
  // An organization's models, and its default, are agent-manager's answer
  // for the organization's namespace, as the person may read them.
  const { directory } = useOrganizationDirectory();
  const organizationModelConfigs = organizationModels?.modelConfigs;
  const organizationChoices = useMemo(
    () => (organizationModelConfigs ?? []).map(organizationModelChoice),
    [organizationModelConfigs],
  );
  let modelConfigs: ModelChoice[];
  if (edit) {
    modelConfigs = listed.filter(
      mc => (mc.getNamespace() ?? '') === edit.agent.namespace,
    );
  } else if (organization) {
    modelConfigs = organizationChoices;
  } else {
    modelConfigs = tenantModelConfigs(listed, state.tenant);
  }
  const isDefaultChoice = (mc: ModelChoice) =>
    organization
      ? (mc as OrganizationModelChoice).isDefault
      : isDefaultModelConfig(mc);
  const defaultLabel = organization
    ? 'Organization default'
    : 'Environment default';
  // The tenants are known and several, none picked yet: a model is the
  // tenant's, so none is offered (or preselected) before the tenant.
  const awaitsTenant =
    !edit &&
    state.tenant === undefined &&
    (state.tenantChoices?.length ?? 0) > 0;
  // The agent's current model, when the list does not carry it (a ModelConfig
  // the person may not read, or one that is gone): the picker still says what
  // the agent has, and picking a listed one replaces it.
  const unlistedCurrent =
    edit &&
    state.modelConfigName &&
    !modelConfigs.some(mc => mc.getName() === state.modelConfigName)
      ? state.modelConfigName
      : undefined;
  // The form starts with a model picked for the person -- the installation's
  // only one, else its default, else the first listed -- so the plain view of
  // step 1 needs no model decision. Only while nothing is picked, so a pick of
  // their own is never replaced; an installation change clears the pick and
  // the new installation's default takes its place.
  let preselection:
    { modelConfig: ModelChoice; reason: PreselectionReason } | undefined;
  if (awaitsTenant) {
    preselection = undefined;
  } else if (organization) {
    preselection = organizationPreselection(organizationChoices);
  } else {
    preselection = preselectedModelConfig(modelConfigs);
  }
  const preselected = preselection?.modelConfig;
  useEffect(() => {
    if (preselected && !state.modelConfigName) {
      selectModelConfig(
        preselected.getName(),
        preselected.getNamespace() ?? '',
        preselected.getDisplayName(),
      );
    }
  }, [preselected, state.modelConfigName, selectModelConfig]);
  const showsPreselection =
    preselection !== undefined &&
    state.modelConfigName === preselection.modelConfig.getName() &&
    state.modelConfigNamespace ===
      (preselection.modelConfig.getNamespace() ?? '');

  const isPicked = (mc: ModelChoice) =>
    state.modelConfigName === mc.getName() &&
    state.modelConfigNamespace === (mc.getNamespace() ?? '');
  const renderCards = () => (
    <ShowMore items={modelConfigs} initial={MODEL_CARDS} noun="model">
      {page => {
        // The picked model is always on screen, even past the first page
        // (the default, preselected, can be listed anywhere): it follows
        // the page as one more card rather than hiding behind *Show more*.
        const pinned = modelConfigs.find(
          mc => isPicked(mc) && !page.includes(mc),
        );
        return (
          <SelectableCardGrid
            role="radiogroup"
            ariaLabel="Model"
            minWidth={220}
            describedBy={error ? errorId : undefined}
          >
            {(pinned ? [...page, pinned] : page).map(mc => {
              const name = mc.getName();
              const namespace = mc.getNamespace() ?? '';
              const provider = mc.getProvider();

              return (
                <SelectableCard
                  key={`${namespace}/${name}`}
                  role="radio"
                  selected={isPicked(mc)}
                  ariaLabel={`Select model ${mc.getDisplayName()}${
                    isDefaultChoice(mc) ? `, ${defaultLabel.toLowerCase()}` : ''
                  }`}
                  onSelect={() =>
                    selectModelConfig(name, namespace, mc.getDisplayName())
                  }
                >
                  <Text weight="bold">{mc.getDisplayName()}</Text>
                  {isDefaultChoice(mc) && (
                    <Text variant="body-small" color="secondary">
                      {defaultLabel}
                    </Text>
                  )}
                  <Text variant="body-x-small" color="secondary">
                    <span className={classes.code}>{mc.getModel()}</span>
                    {provider ? ` · ${provider}` : ''}
                  </Text>
                </SelectableCard>
              );
            })}
          </SelectableCardGrid>
        );
      }}
    </ShowMore>
  );

  if (!installation) {
    return (
      <Flex direction="column" gap="2" {...invalidProps}>
        {label}
        <Alert
          status="info"
          title="Select an environment first"
          description="Models are provisioned per environment."
        />
      </Flex>
    );
  }

  if (awaitsTenant) {
    return (
      <Flex direction="column" gap="2" {...invalidProps}>
        {label}
        <Alert
          status="info"
          title="Choose who the agent belongs to first"
          description="The models offered depend on it."
        />
      </Flex>
    );
  }

  if (organization && organizationModels) {
    const name = ownerOf(organization, directory);
    const hasDefault = organizationChoices.some(model => model.isDefault);
    return (
      <Flex direction="column" gap="2" {...invalidProps}>
        {label}
        {organizationModels.isLoading && (
          <Text color="secondary">Loading models…</Text>
        )}
        {organizationModels.failure && (
          <Alert
            status="warning"
            title="Could not read the organization's models"
            description={organizationModels.failure.message}
          />
        )}
        {!organizationModels.isLoading &&
          !organizationModels.failure &&
          !hasDefault && (
            <Alert
              status="warning"
              title={`${name} has no default model`}
              description={
                organizationChoices.length === 0
                  ? `Agents of ${name} need a model with the organization's own key. Ask an admin of ${name} to add one.`
                  : `Pick one of its models below, or ask an admin of ${name} to mark one as the organization's default.`
              }
            />
          )}
        {!edit && showsPreselection && preselection && (
          <Text variant="body-small" color="secondary">
            Preselected: {preselection.modelConfig.getDisplayName()}, the
            default model of {name}.
          </Text>
        )}
        {modelConfigs.length > 0 && renderCards()}
      </Flex>
    );
  }

  const hasError = unreachableInstallations.includes(installation);

  return (
    <Flex direction="column" gap="2" {...invalidProps}>
      {label}

      {/* isLoading is fleet-wide, so only treat it as "loading" here while this
          installation has no models yet — otherwise the label lingers next to
          already-loaded models. */}
      {isLoading && modelConfigs.length === 0 && (
        <Text color="secondary">Loading models…</Text>
      )}

      {!isLoading && modelConfigs.length === 0 && hasError && (
        <Alert
          status="warning"
          title="Could not read models"
          description={`The kagent resources on ${installation} could not be read — unreachable, or you may not list ModelConfigs there.`}
        />
      )}

      {!isLoading && modelConfigs.length === 0 && !hasError && (
        <>
          <Alert
            status="info"
            title="No models found"
            description={`No ModelConfigs on ${installation}. A platform admin must add one before agents can be created here.`}
          />
          {/* A new tab, like every link in the form: it stays as it is. */}
          {newModelLink && (
            <Text variant="body-small" color="secondary">
              Platform admins can{' '}
              <ExternalLink href={newModelLink()}>add a model</ExternalLink> in
              the Models tab.
            </Text>
          )}
        </>
      )}

      {unlistedCurrent && (
        <Text variant="body-small" color="secondary">
          Currently {unlistedCurrent}, a model that is not listed for you
          {isLoading ? ' yet' : ''}.
        </Text>
      )}

      {!edit && showsPreselection && preselection && (
        <Text variant="body-small" color="secondary">
          {preselectionNote(
            preselection.reason,
            preselection.modelConfig.getDisplayName(),
            installation,
          )}
        </Text>
      )}

      {modelConfigs.length > 0 && renderCards()}
    </Flex>
  );
}
