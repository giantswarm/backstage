import { useEffect } from 'react';
import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { newModelRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

export function ModelConfigPicker() {
  const classes = useSelectableCardStyles();
  const { state, selectModelConfig } = useNewAgentForm();
  const { isLoading, modelConfigsFor, unreachableInstallations } =
    useModelConfigs();
  const newModelLink = useRouteRef(newModelRouteRef);
  const installation = state.installation;

  const label = (
    <FieldLabel
      label="Model"
      description="What the agent thinks with. Admins add models under Customize → Models."
    />
  );

  const modelConfigs = installation ? modelConfigsFor(installation) : [];
  // The sole model of the installation: nothing to choose, so it is picked
  // for the person, the way the sole installation is (InstallationSelect).
  // Only while nothing is picked, so a pick of their own is never replaced.
  const soleModel = modelConfigs.length === 1 ? modelConfigs[0] : undefined;
  useEffect(() => {
    if (soleModel && !state.modelConfigName) {
      selectModelConfig(
        soleModel.getName(),
        soleModel.getNamespace() ?? '',
        soleModel.getDisplayName(),
      );
    }
  }, [soleModel, state.modelConfigName, selectModelConfig]);

  if (!installation) {
    return (
      <Flex direction="column" gap="2">
        {label}
        <Alert
          status="info"
          title="Select an installation first"
          description="Models are provisioned per installation. Choose one above to load its ModelConfigs."
        />
      </Flex>
    );
  }

  const hasError = unreachableInstallations.includes(installation);

  return (
    <Flex direction="column" gap="2">
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

      {modelConfigs.length > 0 && (
        <SelectableCardGrid role="radiogroup" ariaLabel="Model" minWidth={220}>
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
                ariaLabel={`Select model ${mc.getDisplayName()}`}
                onSelect={() =>
                  selectModelConfig(name, namespace, mc.getDisplayName())
                }
              >
                <Text weight="bold">{mc.getDisplayName()}</Text>
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
