import { useEffect, useId } from 'react';
import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { FieldErrorText } from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import {
  isDefaultModelConfig,
  preselectedModelConfig,
  type PreselectionReason,
} from './helpers';
import { useModelConfigs } from '../ModelConfigsProvider';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

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

export type ModelConfigPickerProps = {
  /**
   * The field's validation problem, shown under its label once the form wants
   * it seen. The block is then marked `data-invalid`, so a blocked Continue
   * focuses its first model card.
   */
  error?: string;
};

export function ModelConfigPicker({ error }: ModelConfigPickerProps = {}) {
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
        description="What the agent thinks with. Admins add models under Customize → Models."
      />
      {error && <FieldErrorText id={errorId}>{error}</FieldErrorText>}
    </>
  );
  const invalidProps = error ? { 'data-invalid': '' } : {};

  // An existing agent's model is a ModelConfig of its own namespace: an update
  // cannot move the agent, so the other namespaces' models are not offered.
  const modelConfigs = (
    installation ? modelConfigsFor(installation) : []
  ).filter(mc => !edit || (mc.getNamespace() ?? '') === edit.agent.namespace);
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
  const preselection = preselectedModelConfig(modelConfigs);
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

  if (!installation) {
    return (
      <Flex direction="column" gap="2" {...invalidProps}>
        {label}
        <Alert
          status="info"
          title="Select an environment first"
          description="Models are provisioned per environment. Choose one above to load its ModelConfigs."
        />
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
          title="Couldn't read models"
          description={`The kagent resources on ${installation} couldn't be read. It may be unreachable, or you may not have permission to list ModelConfigs there.`}
        />
      )}

      {!isLoading && modelConfigs.length === 0 && !hasError && (
        <>
          <Alert
            status="info"
            title="No models found"
            description={`No ModelConfigs are provisioned on ${installation}. A platform admin needs to add one before you can create an agent here.`}
          />
          {/* Leaving the create flow here loses this form's state, which is
              fine: without a model, nothing on it can proceed anyway. */}
          {newModelLink && (
            <Text variant="body-small" color="secondary">
              Platform admins can <Link to={newModelLink()}>add a model</Link>{' '}
              in the Models tab.
            </Text>
          )}
        </>
      )}

      {unlistedCurrent && (
        <Text variant="body-small" color="secondary">
          Currently {unlistedCurrent}, a model that isn't listed for you
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

      {modelConfigs.length > 0 && (
        <SelectableCardGrid
          role="radiogroup"
          ariaLabel="Model"
          minWidth={220}
          describedBy={error ? errorId : undefined}
        >
          {modelConfigs.map(mc => {
            const name = mc.getName();
            const namespace = mc.getNamespace() ?? '';
            const isSelected =
              state.modelConfigName === name &&
              state.modelConfigNamespace === namespace;
            const provider = mc.getProvider();

            return (
              <SelectableCard
                key={`${namespace}/${name}`}
                role="radio"
                selected={isSelected}
                ariaLabel={`Select model ${mc.getDisplayName()}${
                  isDefaultModelConfig(mc) ? ', installation default' : ''
                }`}
                onSelect={() =>
                  selectModelConfig(name, namespace, mc.getDisplayName())
                }
              >
                <Text weight="bold">{mc.getDisplayName()}</Text>
                {isDefaultModelConfig(mc) && (
                  <Text variant="body-small" color="secondary">
                    Installation default
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
      )}
    </Flex>
  );
}
