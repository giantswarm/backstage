import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Flex, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  fieldErrorProps,
  InfoHint,
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
import { ModelConfigPicker } from '../ModelConfigPicker';
import { HarnessPicker } from '../HarnessPicker';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { TextAreaField } from './TextAreaField';
import { egressProblem, parseEgressText } from '../../lib/egress';
import { harnessTitle } from '../../lib/harnesses';
import {
  MAX_SYSTEM_MESSAGE_LENGTH,
  systemMessageProblem,
} from '../../lib/systemMessage';

const useStyles = makeStyles(theme => ({
  moreOptions: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    padding: theme.spacing(1.5, 2),
  },
  moreOptionsSummary: {
    cursor: 'pointer',
    color: 'var(--bui-fg-primary)',
  },
  moreOptionsDefaults: {
    color: 'var(--bui-fg-secondary)',
    fontSize: '0.875rem',
    // A long technical name must wrap rather than widen the page at 375px.
    overflowWrap: 'anywhere',
  },
  // The info button sits in the line of text, on its baseline.
  modelHint: {
    verticalAlign: 'text-bottom',
    marginLeft: 2,
  },
  moreOptionsBody: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2.5),
  },
}));

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

  // Each field shows its own problem once the person has tried to proceed —
  // not before, so the form doesn't shout about empty fields up front — and a
  // blocked Continue moves the focus to the first one.
  const validation = useFieldValidation();
  // "More options" holds the technical knobs (model, runtime, technical name,
  // extra egress), collapsed: their defaults fit most agents. A native
  // <details>, so the pickers inside stay mounted while it is closed — the
  // model picker's preselection of the installation's default model runs
  // without the person ever opening it.
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const egressIssue = egressProblem(parseEgressText(state.egressText));
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
  // platform's standard one unless another is picked) and the technical name.
  // An edited agent's Harness is known by its name until the picker reads it.
  let runtimeName = 'Standard';
  if (state.harness) {
    runtimeName =
      state.harness.displayName || state.harness.runtime
        ? harnessTitle(state.harness)
        : state.harness.name;
  }
  const defaultsSummary = `${runtimeName} runtime${
    state.slug ? `, technical name ${state.slug}` : ''
  }`;

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
          Change what the agent is called, what it is for and how it works.
          Nothing changes until you save on the last step.
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
              description="What people call the agent."
              {...fieldErrorProps(validation.errorFor(fieldErrors.name))}
            />
          </div>
        </Flex>
        <TextAreaField
          label="What is it for?"
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
          description="Leave empty to use the standard instructions. Put long reference material in a skill; instructions are limited in length."
          maxLength={MAX_SYSTEM_MESSAGE_LENGTH}
          error={systemMessageProblem(state.systemMessage)}
        />

        {/* Where the agent runs: renders nothing on a single-installation
            portal, where the sole one is picked automatically. An existing
            agent stays where it is. */}
        {!edit && (
          <InstallationSelect
            error={validation.errorFor(fieldErrors.installation)}
          />
        )}
        {modelSummary && (
          <Text as="p" variant="body-small" color="secondary">
            {modelSummary}
          </Text>
        )}

        <details
          className={classes.moreOptions}
          open={moreOptionsOpen}
          onToggle={event =>
            setMoreOptionsOpen((event.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary className={classes.moreOptionsSummary}>
            More options{' '}
            <span className={classes.moreOptionsDefaults}>
              · {defaultsSummary}
            </span>
          </summary>
          <div className={classes.moreOptionsBody}>
            <Text variant="body-small" color="secondary">
              The defaults work for most agents.
            </Text>
            <ModelConfigPicker error={validation.errorFor(fieldErrors.model)} />
            <HarnessPicker />
            {edit ? (
              <TextField
                label="Technical name"
                secondaryLabel="fixed"
                isReadOnly
                value={state.slug}
                description={`Used in links and in the agent's resource names, on ${edit.installation}. It can't be changed.`}
              />
            ) : (
              <TextField
                label="Technical name"
                secondaryLabel="filled in from the name"
                isRequired
                value={state.slug}
                onChange={setSlug}
                placeholder="support-triage"
                description="Used in links and in the agent's resource names. It can't be changed later."
                {...fieldErrorProps(validation.errorFor(fieldErrors.slug))}
              />
            )}
            <TextAreaField
              label="Extra egress origins"
              secondaryLabel="optional"
              value={state.egressText}
              onChange={setEgressText}
              rows={3}
              mono
              placeholder={
                'https://github.com:443\nhttps://*.githubusercontent.com'
              }
              description="Hosts the agent may reach beyond what it already has: its model, its connectors, its skill and plugin sources and telemetry need no entry. One http(s) origin per line; a leading * matches one host label."
              error={egressIssue}
            />
          </div>
        </details>
      </Flex>

      <Text as="p" color="secondary">
        {edit &&
          (hasRepositories
            ? 'Next you change its skills and what it may do, then check what changes and save it.'
            : 'Next you change what it may do, then check what changes and save it.')}
        {!edit &&
          (hasRepositories
            ? 'Next you add skills and choose what the agent may do, then check everything and create it.'
            : 'Next you choose what the agent may do, then check everything and create it.')}
      </Text>
    </AgentWizardFrame>
  );
}
