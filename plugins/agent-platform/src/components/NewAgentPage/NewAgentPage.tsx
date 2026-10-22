import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Flex, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  InfoHint,
  MoreOptions,
  useFieldValidation,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { underlyingModelLine } from '../../hooks/useUnderlyingModel';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CreateAgentAssist } from '../CreateAgentAssist';
import { AgentAvatarPreview } from '../AgentAvatarPreview';
import { ModelConfigsProvider, useModelConfigs } from '../ModelConfigsProvider';
import { InstallationSelect } from '../InstallationSelect';
import { TenantPicker } from '../TenantPicker';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { HarnessPicker } from '../HarnessPicker';
import { DefaultWorkspacePicker } from '../DefaultWorkspacePicker';
import { EgressPolicyPicker } from '../EgressPolicyPicker';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { TextAreaField } from './TextAreaField';
import { harnessTitle } from '../../lib/harnesses';
import { MAX_SYSTEM_MESSAGE_LENGTH } from '../../lib/systemMessage';

const useStyles = makeStyles({
  // The info button sits in the line of text, on its baseline.
  modelHint: {
    verticalAlign: 'text-bottom',
    marginLeft: 2,
  },
  technicalName: {
    marginTop: 'var(--bui-space-1)',
    overflowWrap: 'anywhere',
  },
});

export function NewAgentPage() {
  return (
    <ModelConfigsProvider>
      <NewAgentPageContent />
    </ModelConfigsProvider>
  );
}

function NewAgentPageContent() {
  const classes = useStyles();
  const navigate = useNavigate();
  const links = useAgentWizardLinks();
  // Called here for two reasons beyond this page's own rendering: it starts the
  // (backend, git-tree-walking) skill discovery while the user is still filling
  // in this form, so step 2 usually has its catalogue ready instead of showing
  // "Discovering skills…"; and `hasRepositories` decides whether step 2 exists
  // at all. The query key doesn't depend on any form state, so the warm-up is
  // never wasted, and it doesn't fire when no repositories are configured.
  const { hasRepositories } = useSkillCatalog();
  const {
    state,
    edit,
    setName,
    setSlug,
    setDescription,
    setSystemMessage,
    setEgressText,
    validationErrors,
    fieldErrors,
  } = useNewAgentForm();

  // Each field shows its own problem once the person leaves it having typed
  // in it, or tries to proceed — not while they first type, so the form does
  // not shout about half-typed values — and a blocked Continue moves the focus
  // to the first one (the `forms` skill).
  const validation = useFieldValidation();
  const { errorFor, fieldProps, textFieldProps } = validation;
  // "More options" holds the technical knobs (model, runtime, default
  // workspace, technical name, EgressPolicies and extra egress), collapsed: their defaults fit most agents. The shared
  // `MoreOptions` disclosure keeps the pickers inside mounted while closed — the
  // model picker's preselection of the installation's default model runs
  // without the person ever opening it.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // A problem with a field behind the disclosure opens it, so the field that
  // says what is wrong is never out of sight (nor out of the focus's reach).
  const hasHiddenProblem = Boolean(
    fieldErrors.slug || fieldErrors.model || fieldErrors.egress,
  );

  // The submit button stays enabled: clicking it with an invalid form surfaces
  // what's wrong (below) rather than silently doing nothing.
  const errorCount = validationErrors.length;
  const { reveal } = validation;
  // Skip the skills step when no repositories are configured — it would be an
  // empty page whose only advice is admin-side app-config the person creating
  // an agent usually can't change. The Tools step always exists: every agent
  // declares a toolset.
  const nextLink = hasRepositories ? links.skills : links.tools;
  const onContinue = useCallback(() => {
    if (errorCount > 0) {
      if (hasHiddenProblem) {
        setMoreOptionsOpen(true);
      }
      reveal();
      return;
    }
    if (nextLink) {
      navigate(nextLink());
    }
  }, [errorCount, hasHiddenProblem, nextLink, navigate, reveal]);

  // Memoized so the frame's footer slot only updates when the handlers actually
  // change, not on every keystroke in the form (see useProvidePageHeaderActions).
  // Cancel belongs to the frame's footer, so only the primary lives here.
  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onContinue}>
        Continue
      </Button>
    ),
    [onContinue],
  );

  useProvidePageHeaderActions(actions);

  // The disclosure's one-line summary of what it holds: the runtime (the
  // platform's standard one unless another is picked) and, while creating,
  // the technical name it can override. An edited agent's Harness is known by
  // its name until the picker reads it.
  let runtimeName = 'Standard';
  if (state.harness) {
    runtimeName =
      state.harness.displayName || state.harness.runtime
        ? harnessTitle(state.harness)
        : state.harness.name;
  }
  const defaultsSummary = `${runtimeName} runtime${
    state.defaultWorkspace
      ? `, default workspace ${state.defaultWorkspace}`
      : ''
  }${
    state.egressPolicyRefs.length > 0
      ? `, EgressPolicies ${state.egressPolicyRefs.join(', ')}`
      : ''
  }${state.slug && !edit ? `, technical name ${state.slug}` : ''}`;

  // The plain view's one line about the model picked for the person (the
  // installation's default, see ModelConfigPicker), so it is never a surprise
  // on the review step.
  const { isLoading: isLoadingModels, modelConfigsFor } = useModelConfigs();
  // An edited agent starts with its ModelConfig's name only; its display name
  // is the listed ModelConfig's, once the list is in.
  const listedModel = state.installation
    ? modelConfigsFor(state.installation).find(
        mc =>
          mc.getName() === state.modelConfigName &&
          (mc.getNamespace() ?? '') === state.modelConfigNamespace,
      )
    : undefined;
  const modelName =
    state.modelDisplayName ??
    listedModel?.getDisplayName() ??
    state.modelConfigName;
  // The line keeps the ModelConfig's name -- an admin may abstract the model
  // on purpose ("The Cheap One") -- and offers the model it runs one hover or
  // focus away (PO decision L6). Not when the name already is the model.
  const underlyingModel =
    listedModel && listedModel.getModel() !== modelName
      ? underlyingModelLine(listedModel)
      : undefined;
  let modelSummary: ReactNode;
  if (modelName) {
    modelSummary = (
      <>
        Runs on {modelName}
        {underlyingModel && (
          <InfoHint
            label={`Which model ${modelName} runs`}
            size="medium"
            className={classes.modelHint}
          >
            {`Underlying model: ${underlyingModel}`}
          </InfoHint>
        )}{' '}
        · change under More options
      </>
    );
  } else if (state.installation) {
    modelSummary = isLoadingModels
      ? 'Loading models…'
      : 'No model picked yet · choose one under More options';
  }

  return (
    <AgentWizardFrame step="details">
      {edit ? (
        <WizardStepHeading title="Describe your agent">
          Change its name, purpose and instructions. Nothing changes until you
          save on the last step.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Describe your agent">
          An agent is an assistant for a certain kind of task. You and your team
          can chat with it any time.
        </WizardStepHeading>
      )}

      {/* The "with Swarm Operator" assist (W6): renders nothing unless the
          agentManagement meta-agent role resolves — see CreateAgentAssist.
          Creating only. */}
      {!edit && <CreateAgentAssist />}

      <Flex direction="column" gap="5">
        <Flex align="start" gap="4">
          <AgentAvatarPreview />
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField
              label="Name"
              isRequired
              value={state.name}
              onChange={setName}
              placeholder="e.g. Support triage"
              {...textFieldProps('name', fieldErrors.name)}
            />
            {/* The one irreversible choice on this step (M7), next to the
                name it comes from rather than behind More options, where
                only its override lives. The connector wizard's "Registered
                as" line. */}
            {state.slug && (
              <Text
                as="p"
                variant="body-small"
                color="secondary"
                className={classes.technicalName}
              >
                Its technical name is <code>{state.slug}</code>;{' '}
                {edit
                  ? 'it cannot be changed.'
                  : 'it cannot be changed once the agent exists.'}
              </Text>
            )}
          </div>
        </Flex>
        <TextAreaField
          label="What is it for?"
          secondaryLabel="optional"
          value={state.description}
          onChange={setDescription}
          rows={2}
          placeholder="e.g. Sorts, summarises and routes support tickets"
          description="Shown to people when they pick an agent."
        />
        <TextAreaField
          label="Instructions"
          secondaryLabel="optional"
          value={state.systemMessage}
          onChange={setSystemMessage}
          rows={6}
          placeholder="Tell the agent how to work. For example: Always group tickets by topic. Write in short, friendly sentences. Never close a ticket yourself."
          description="Leave empty for the standard instructions. Put long reference material in a skill."
          maxLength={MAX_SYSTEM_MESSAGE_LENGTH}
          // The counter's live check: past the limit, it says so at once.
          error={fieldErrors.systemMessage}
        />

        {/* Where the agent runs: renders nothing on a single-installation
            portal, where the sole one is picked automatically. An existing
            agent stays where it is. */}
        {!edit && (
          <InstallationSelect
            error={errorFor('installation', fieldErrors.installation)}
          />
        )}
        {/* Which tenant the agent belongs to, among those the person may
            create in there. An existing agent stays in its own. */}
        {!edit && (
          <TenantPicker error={errorFor('tenant', fieldErrors.tenant)} />
        )}
        {modelSummary && (
          <Text as="p" variant="body-small" color="secondary">
            {modelSummary}
          </Text>
        )}

        <MoreOptions
          open={moreOptionsOpen}
          onOpenChange={setMoreOptionsOpen}
          summary={defaultsSummary}
        >
          <Text variant="body-small" color="secondary">
            The defaults work for most agents.
          </Text>
          <ModelConfigPicker error={errorFor('model', fieldErrors.model)} />
          <HarnessPicker />
          <DefaultWorkspacePicker />
          {/* Creating only: an existing agent's technical name is shown,
              locked, under its name. */}
          {!edit && (
            <TextField
              label="Technical name"
              secondaryLabel="filled in from the name"
              isRequired
              value={state.slug}
              onChange={setSlug}
              placeholder="support-triage"
              description="Used in links and resource names."
              {...textFieldProps('slug', fieldErrors.slug)}
            />
          )}
          <EgressPolicyPicker />
          <TextAreaField
            label="Extra egress origins"
            secondaryLabel="optional"
            value={state.egressText}
            onChange={setEgressText}
            rows={3}
            mono
            placeholder={
              'https://github.com:443\nhttps://*.githubusercontent.com\ntls://db.example.com:5432'
            }
            description="List hosts beyond its model, connectors, skill and plugin sources and telemetry, which need no entry. One per line: an http(s) origin, or tls://host:port for another service that speaks TLS, such as a database; a leading * matches one host label."
            {...fieldProps('egress', fieldErrors.egress)}
          />
        </MoreOptions>
      </Flex>

      <Text as="p" color="secondary">
        {edit &&
          (hasRepositories
            ? 'Next come its skills and what it may do, then review and save.'
            : 'Next comes what it may do, then review and save.')}
        {!edit &&
          (hasRepositories
            ? 'Next come skills and what the agent may do, then review and create.'
            : 'Next comes what the agent may do, then review and create.')}
      </Text>
    </AgentWizardFrame>
  );
}
