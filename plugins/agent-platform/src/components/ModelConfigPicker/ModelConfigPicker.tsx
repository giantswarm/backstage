import { useEffect, useId } from 'react';
import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  FieldErrorText,
  ExternalLink,
} from '@giantswarm/backstage-plugin-ui-react';

import { newModelRouteRef } from '../../routes';
import { useAgentManagerModelConfigs } from '../../hooks/useAgentManagerModelConfigs';
import { modelLabel } from '../../lib/modelLabel';
import { underlyingModelLine } from '../../hooks/useUnderlyingModel';
import { tenantInSentence } from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';
import {
  isReportedDefault,
  preselectedModelConfig,
  tenantModelConfigs,
  unresolvedReason,
} from './helpers';
import { useModelConfigs } from '../ModelConfigsProvider';
import { ModelReadinessLabel } from '../ModelsTable';
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
  const { directory } = useOrganizationDirectory();
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
  const namespace = edit ? edit.agent.namespace : state.tenant;
  const modelConfigs = edit
    ? listed.filter(mc => (mc.getNamespace() ?? '') === edit.agent.namespace)
    : tenantModelConfigs(listed, state.tenant);
  const labelCounts = new Map<string, number>();
  for (const modelConfig of modelConfigs) {
    const choiceLabel = modelLabel(modelConfig) ?? modelConfig.getName();
    labelCounts.set(choiceLabel, (labelCounts.get(choiceLabel) ?? 0) + 1);
  }
  // Which model is the namespace default, and whether each resolves, as
  // agent-manager answers it: the portal does not resolve the default itself.
  const { modelConfigs: reported, isLoading: isReadingDefault } =
    useAgentManagerModelConfigs(installation, namespace ?? '');
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
  // The form starts with the namespace default picked for the person. Only
  // while nothing is picked, so a pick of their own is never replaced; an
  // installation or owner change clears the pick and the new default takes
  // its place. Without a default the person picks.
  const preselected = awaitsTenant
    ? undefined
    : preselectedModelConfig(modelConfigs, reported);
  useEffect(() => {
    if (preselected && !state.modelConfigName) {
      selectModelConfig(
        preselected.getName(),
        preselected.getNamespace() ?? '',
        modelLabel(preselected),
      );
    }
  }, [preselected, state.modelConfigName, selectModelConfig]);
  const showsPreselection =
    preselected !== undefined &&
    state.modelConfigName === preselected.getName() &&
    state.modelConfigNamespace === (preselected.getNamespace() ?? '');
  const where = namespace
    ? tenantInSentence(namespace, directory)
    : (installation ?? '');

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

  const hasError = unreachableInstallations.includes(installation);
  const isPicked = (mc: (typeof modelConfigs)[number]) =>
    state.modelConfigName === mc.getName() &&
    state.modelConfigNamespace === (mc.getNamespace() ?? '');
  const picked = modelConfigs.find(isPicked);
  const pickedProblem = picked ? unresolvedReason(picked, reported) : undefined;
  const needsPick =
    !edit &&
    !state.modelConfigName &&
    !isLoading &&
    !isReadingDefault &&
    modelConfigs.length > 0 &&
    preselected === undefined;

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
            description={`No models ${
              namespace ? `for ${where} ` : ''
            }on ${installation}. An admin must add one before agents can be created here.`}
          />
          {/* A new tab, like every link in the form: it stays as it is. */}
          {newModelLink && (
            <Text variant="body-small" color="secondary">
              Admins can{' '}
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

      {!edit && showsPreselection && preselected && (
        <Text variant="body-small" color="secondary">
          Preselected: {modelLabel(preselected)}, the default model for {where}.
        </Text>
      )}

      {needsPick && (
        <Text variant="body-small" color="secondary">
          No default model is set for {where}. Choose the model this agent runs
          on.
        </Text>
      )}

      {picked && pickedProblem && (
        <Alert
          status="warning"
          title={`${modelLabel(picked)} is not ready`}
          description={`Agents on this model fail until an admin fixes it${
            pickedProblem.message ? `: ${pickedProblem.message}` : '.'
          } You can still create the agent, or choose another model.`}
        />
      )}

      {modelConfigs.length > 0 && (
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
                  const modelNamespace = mc.getNamespace() ?? '';
                  const choiceLabel = modelLabel(mc) ?? name;
                  const details = underlyingModelLine(mc, choiceLabel);
                  const ambiguous = (labelCounts.get(choiceLabel) ?? 0) > 1;
                  const isDefault = isReportedDefault(mc, reported);
                  const problem = unresolvedReason(mc, reported);

                  return (
                    <SelectableCard
                      key={`${modelNamespace}/${name}`}
                      role="radio"
                      selected={isPicked(mc)}
                      ariaLabel={`Select model ${choiceLabel}${ambiguous ? `, ${name}` : ''}${
                        isDefault ? ', default' : ''
                      }${problem ? ', not accepted' : ''}`}
                      onSelect={() =>
                        selectModelConfig(name, modelNamespace, choiceLabel)
                      }
                    >
                      <Text weight="bold">{choiceLabel}</Text>
                      {isDefault && (
                        <Text variant="body-small" color="secondary">
                          Default
                        </Text>
                      )}
                      <Text variant="body-x-small" color="secondary">
                        {details}
                      </Text>
                      {ambiguous && (
                        <Text variant="body-x-small" color="secondary">
                          Configuration:{' '}
                          <span className={classes.code}>{name}</span>
                        </Text>
                      )}
                      {problem && (
                        <ModelReadinessLabel
                          readiness="notAccepted"
                          message={problem.message}
                        />
                      )}
                    </SelectableCard>
                  );
                })}
              </SelectableCardGrid>
            );
          }}
        </ShowMore>
      )}
    </Flex>
  );
}
