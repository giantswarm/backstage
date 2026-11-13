import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Flex, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  InfoHint,
  MoreOptions,
  useFieldValidation,
  TagsField,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useFormHarnessRuntime } from '../../hooks/useFormHarnessRuntime';
import { underlyingModelLine } from '../../hooks/useUnderlyingModel';
import { modelLabel } from '../../lib/modelLabel';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CreateAgentAssist } from '../CreateAgentAssist';
import { AgentAvatarPreview } from '../AgentAvatarPreview';
import { ModelConfigsProvider, useModelConfigs } from '../ModelConfigsProvider';
import { useEnvironmentField } from './hooks/useEnvironmentField';
import { useOwnerField } from './hooks/useOwnerField';
import { ownerOf } from '../../lib/tenants';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { HarnessPicker, useRuntimeChoices } from '../HarnessPicker';
import { DefaultWorkspacePicker } from '../DefaultWorkspacePicker';
import { EgressPolicyPicker } from '../EgressPolicyPicker';
import { DroppedEgressNotice, PlatformEgressNote } from '../PlatformEgressNote';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { TextAreaField } from './TextAreaField';
import {
  harnessTitle,
  PLATFORM_DEFAULT_LABEL,
  platformEgressOf,
  runtimeLabel,
} from '../../lib/harnesses';
import { MAX_SYSTEM_MESSAGE_LENGTH } from '../../lib/systemMessage';
import { useOrganizationDirectory } from '../OrganizationDirectoryProvider';

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
  const { directory } = useOrganizationDirectory();
  const classes = useStyles();
  const navigate = useNavigate();
  const links = useAgentWizardLinks();
  const {
    state,
    edit,
    setName,
    setSlug,
    setDescription,
    addTags,
    removeTag,
    setTagDraft,
    commitTagDraft,
    setSystemMessage,
    setEgressText,
    setEgressSetByPlatform,
    validationErrors,
    fieldErrors,
    tagsOffered,
    storedTags,
  } = useNewAgentForm();
  // Starts reading the target installation's skill catalog while the form is
  // filled in, so step 2 has it ready; `hasRepositories` decides whether step 2
  // exists at all.
  const { hasRepositories } = useSkillCatalog(state.installation);
  // The platform Harness the runtime field shows, for the summary below.
  const { platformChoice } = useRuntimeChoices();
  // The runtime decides whether extra egress origins are offered at all.
  const egressRuntime = useFormHarnessRuntime();
  const codingRuntime =
    egressRuntime.harness.title ?? runtimeLabel(egressRuntime.runtime);
  const { info: agentManagerInfo } = useAgentManagerInfo(state.installation);
  // The form stops checking (and, creating, drops) extra egress once the
  // runtime is known to be a coding one, however it became known.
  const isCoding = egressRuntime.isCoding === true;
  useEffect(() => {
    setEgressSetByPlatform(isCoding);
  }, [isCoding, setEgressSetByPlatform]);

  // Each field shows its own problem once the person leaves it having typed
  // in it, or tries to proceed — not while they first type, so the form does
  // not shout about half-typed values — and a blocked Continue moves the focus
  // to the first one (the `forms` skill).
  const validation = useFieldValidation();
  const { errorFor, fieldProps, textFieldProps } = validation;
  // "More options" holds the technical knobs (model, runtime, default
  // workspace, technical name, EgressPolicies and extra egress, and the lines
  // naming an environment and owner with nothing to choose),
  // collapsed: their defaults fit most agents. The shared `MoreOptions`
  // disclosure keeps
  // the pickers inside mounted while closed — the model picker's preselection
  // of the installation's default model runs without the person ever opening
  // it.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // Where the agent runs and who owns it, a pair kept together, Environment
  // first: the owners offered depend on the environment,
  // so changing one never resets the other out of sight. In the main form if
  // either is a choice (or says why there is none), else both are lines under
  // More options. Each field's hook runs here, once, wherever the pair goes,
  // so its pick lands while More options is closed. Both are inert while
  // editing: an existing agent stays where it is.
  const environment = useEnvironmentField({
    error: errorFor('installation', fieldErrors.installation),
  });
  const owner = useOwnerField({ errorFor });
  // The portal's only environment is no part of the pair: its line sits
  // first under More options whatever Owner does.
  const pairInMain = (!environment.alone && environment.inMain) || owner.inMain;
  const pair = (
    <>
      {!environment.alone && environment.field}
      {owner.field}
    </>
  );

  // A problem with a field behind the disclosure opens it, so the field that
  // says what is wrong is never out of sight (nor out of the focus's reach).
  // Environment and Owner are never among them: under More options they are
  // lines with nothing to fix, and Owner's blocked Continue
  // ("Still reading…") shows in the main form.
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
    // A typed tag not yet added goes with the agent, however step 1 is left.
    // Where the field is not offered, its text stays out of the agent.
    if (tagsOffered) {
      commitTagDraft();
    }
    if (nextLink) {
      navigate(nextLink());
    }
  }, [
    errorCount,
    hasHiddenProblem,
    nextLink,
    navigate,
    reveal,
    tagsOffered,
    commitTagDraft,
  ]);

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
  // platform Harness, by the runtime field's title for it, unless another is
  // picked), the sole owner when its line is in there, and, while
  // creating, the technical name it can override. An edited
  // agent's Harness is known by its name until the picker reads it.
  let runtimeName = platformChoice
    ? harnessTitle(platformChoice)
    : PLATFORM_DEFAULT_LABEL;
  if (state.harness) {
    runtimeName =
      state.harness.displayName || state.harness.runtime
        ? harnessTitle(state.harness)
        : state.harness.name;
  }
  const defaultsSummary = `${runtimeName} runtime${
    !pairInMain && owner.sole ? `, owner ${ownerOf(owner.sole, directory)}` : ''
  }${
    state.defaultWorkspace
      ? `, default workspace ${state.defaultWorkspace}`
      : ''
  }${
    state.egressPolicyRefs.length > 0
      ? `, EgressPolicies ${state.egressPolicyRefs.join(', ')}`
      : ''
  }${state.slug && !edit ? `, technical name ${state.slug}` : ''}`;

  // The plain view's one line about the model picked for the person (the
  // namespace default, see ModelConfigPicker), so it is never a surprise
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
    modelLabel(listedModel) ?? state.modelDisplayName ?? state.modelConfigName;
  const underlyingModel = underlyingModelLine(listedModel, modelName);
  let modelSummary: ReactNode;
  if (modelName) {
    modelSummary = (
      <>
        Runs on {modelName}
        {underlyingModel && (
          <InfoHint
            label={`Model details for ${modelName}`}
            size="medium"
            className={classes.modelHint}
          >
            {underlyingModel}
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
        {tagsOffered && (
          <TagsField
            tags={state.tags}
            draft={state.tagDraft ?? ''}
            error={errorFor('tags', fieldErrors.tags)}
            stored={storedTags}
            onDraftChange={setTagDraft}
            onAdd={addTags}
            onRemove={removeTag}
          />
        )}
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

        {pairInMain && pair}
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
          {/* First: the models offered depend on them. */}
          {environment.alone && environment.field}
          {!pairInMain && pair}
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
          {/* A coding Harness reaches the platform's list for it only, and
              agent-manager refuses any other origin: the field is not offered
              there, and the line in its place says who sets it. While the
              runtime is unknown the field stays, and is checked and sent. */}
          {egressRuntime.isCoding ? (
            <PlatformEgressNote
              runtime={codingRuntime}
              origins={platformEgressOf(
                agentManagerInfo,
                egressRuntime.harness.name,
              )}
            />
          ) : (
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
          )}
          <DroppedEgressNotice
            runtime={egressRuntime.isCoding ? codingRuntime : undefined}
            dropped={state.droppedEgress}
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
