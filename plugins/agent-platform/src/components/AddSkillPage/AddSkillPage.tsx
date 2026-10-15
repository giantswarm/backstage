import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  ButtonLink,
  Flex,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import {
  EmptyStateCard,
  searchableIf,
  TextAreaField,
  useFieldValidation,
  useProvidePageHeaderActions,
  useSelectFieldError,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import {
  SKILL_NAME_RE,
  useProposeSkill,
  type SkillPullRequest,
} from '../../hooks/useProposeSkill';
import type { SkillContent } from '../../hooks/useSkillContent';
import {
  canProposeSkillTo,
  repoSlug,
  shortCommit,
  type DiscoveredSkill,
} from '../../lib/skills';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import { SkillEditFiles } from '../SkillEditFiles';
import {
  SkillCreationAssist,
  type SkillCreationTarget,
} from '../SkillCreationAssist';

/** An existing skill to edit, and the SKILL.md it currently reads. */
export type SkillEdit = {
  skill: DiscoveredSkill;
  content: SkillContent;
  /** Where Cancel and Done lead: the skill's own page. */
  skillHref: string;
};

/** The outcome: the pull request, and what happens next, in words. */
function SkillPullRequestOutcome({
  result,
  isUpdate,
}: {
  result: SkillPullRequest;
  isUpdate: boolean;
}) {
  return (
    <Alert
      status="success"
      data-testid="skill-pr-outcome"
      title={`Pull request #${result.number} opened`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Opened as you against {result.base}. A teammate has to merge it
            before {isUpdate ? 'the change' : 'the skill'} reaches the catalog.
          </Text>
          <div>
            <ButtonLink
              href={result.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="small"
            >
              Review pull request ↗
            </ButtonLink>
          </div>
        </Flex>
      }
    />
  );
}

/**
 * Add a skill to one of the configured skill repositories
 * (`/agent-platform/skills/new`), as a pull request opened **as the signed-in
 * person** (decision G16 B): name, description and instructions become a
 * `<name>/SKILL.md` on a branch, and the flow ends on the opened pull request.
 * Nothing deploys from here — a teammate approves the PR, and discovery picks
 * the skill up once it merges.
 *
 * With `edit`, the same flow changes an existing skill (`EditSkillPage`,
 * `/agent-platform/skills/edit/<owner>/<repo>[/<dir>]`): the repository and
 * name are fixed, description and instructions start from the SKILL.md the
 * skill reads now, and the pull request rewrites `<dir>/SKILL.md` on
 * `update-skill/<directory as a slug>` (the repository name for a skill at
 * the root). Submitting waits for an actual change; a skill that changed
 * since the edit started is refused (409) with the backend's reason shown.
 *
 * The form writes a SKILL.md only. Above it, where the
 * `metaAgents.skillCreation` role resolves, `SkillCreationAssist` says so and
 * hands complex, nested skills over to the skill creator agent in a session.
 *
 * The same single-step in-content wizard frame as Connect a model, so the Customize
 * screen's create flows all read the same. A person without a GitHub grant in
 * muster is bounced through muster's connect once (the `githubAuthApiRef` the
 * mutation mints its token from does that) and comes back to this page.
 */
export function AddSkillPage({ edit }: { edit?: SkillEdit } = {}) {
  const navigate = useNavigate();
  // The target repositories: the github.com entries of the same
  // signed-in-config list the catalog is discovered from — the pull-request
  // endpoint refuses any other repository, so offering one would only end in
  // an error. An edit targets the skill's own repository.
  const { config } = useSignedInConfig();
  const editRepoUrl = edit?.skill.repoUrl;
  const configured = useMemo(
    () =>
      config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [],
    [config],
  );
  const repositories = useMemo(
    () => (editRepoUrl ? [editRepoUrl] : configured.filter(canProposeSkillTo)),
    [configured, editRepoUrl],
  );
  /** Configured repositories left out of the targets for not being on github.com. */
  const skippedCount = edit ? 0 : configured.length - repositories.length;
  const closeHref = edit?.skillHref ?? `${SHELL_CUSTOMIZE_PATH}/skills`;

  const [repoUrl, setRepoUrl] = useState<string | undefined>(repositories[0]);
  const [skillName, setSkillName] = useState(edit?.skill.name ?? '');
  const [description, setDescription] = useState(
    edit?.content.description ?? '',
  );
  const [instructions, setInstructions] = useState(
    edit?.content.instructions ?? '',
  );
  const { proposeSkill, isProposing, error, result } = useProposeSkill();

  useEffect(() => {
    if (!repoUrl && repositories.length > 0) {
      setRepoUrl(repositories[0]);
    }
  }, [repoUrl, repositories]);

  // Each field's problem, shown on the field itself once the person leaves
  // it having typed in it, or once a submit was blocked (the `forms` skill).
  const fieldErrors = {
    repository: repoUrl ? undefined : 'Choose a repository',
    name: (() => {
      if (edit) {
        return undefined;
      }
      if (!skillName) {
        return 'Enter a name for the skill.';
      }
      return SKILL_NAME_RE.test(skillName)
        ? undefined
        : 'Use lowercase letters, digits and dashes, e.g. ticket-triage';
    })(),
    description: description.trim() ? undefined : 'Enter a description.',
    instructions: instructions.trim() ? undefined : 'Enter the instructions.',
  };
  const isValid = Object.values(fieldErrors).every(problem => !problem);
  // An edit with nothing changed has nothing to propose — not a field's
  // fault, so the button waits instead of pointing at one.
  const isChanged =
    !edit ||
    description.trim() !== edit.content.description.trim() ||
    instructions.trim() !== edit.content.instructions.trim();
  const validation = useFieldValidation();
  const { reveal, errorFor, fieldProps, textFieldProps } = validation;
  const repositoryError = useSelectFieldError(
    errorFor('repository', fieldErrors.repository),
  );

  const onSubmit = useCallback(async () => {
    if (!repoUrl || !isValid) {
      reveal();
      return;
    }
    if (!isChanged) {
      return;
    }
    try {
      await proposeSkill({
        repoUrl,
        skillName,
        description: description.trim(),
        instructions: instructions.trim(),
        ...(edit
          ? {
              kind: 'update' as const,
              path: edit.skill.path,
              baseCommit: edit.content.commit,
            }
          : {}),
      });
    } catch {
      // Shown from `error`, beside the form the user still has.
    }
  }, [
    repoUrl,
    isValid,
    isChanged,
    reveal,
    proposeSkill,
    skillName,
    description,
    instructions,
    edit,
  ]);

  const onDone = useCallback(() => {
    navigate(closeHref);
  }, [navigate, closeHref]);

  // What the skill creator hand-off is about, read when it is pressed: the
  // skill being changed, or the new skill as typed so far.
  const getCreationTarget = useCallback(
    (): SkillCreationTarget =>
      edit
        ? {
            kind: 'update',
            skill: edit.skill,
            // Only what the person changed: the rest is in the repository.
            description:
              description.trim() !== edit.content.description.trim()
                ? description
                : undefined,
            instructions:
              instructions.trim() !== edit.content.instructions.trim()
                ? instructions
                : undefined,
          }
        : {
            kind: 'create',
            repoUrl: repoUrl ?? repositories[0] ?? '',
            name: skillName,
            description,
            instructions,
          },
    [edit, repoUrl, repositories, skillName, description, instructions],
  );

  // Memoized so the frame's footer slot only updates when the handlers change,
  // not on every keystroke (see useProvidePageHeaderActions). Cancel belongs
  // to the frame's footer, so only the primary lives here.
  const actions = useMemo(() => {
    if (repositories.length === 0) {
      return null;
    }
    if (result) {
      return (
        <Button variant="primary" onPress={onDone}>
          Done
        </Button>
      );
    }
    return (
      <Button
        variant="primary"
        isDisabled={!isChanged || isProposing}
        onPress={onSubmit}
      >
        {isProposing ? 'Opening…' : 'Open pull request'}
      </Button>
    );
  }, [repositories.length, result, onDone, isChanged, isProposing, onSubmit]);
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title={edit ? 'Edit skill' : 'Add skill'}
      documentTitle={[edit ? `Edit ${edit.skill.name}` : 'Add skill', 'Skills']}
      context={
        edit ? `Customize / Skills / ${edit.skill.name}` : 'Customize / Skills'
      }
      closeHref={closeHref}
    >
      {edit ? (
        <WizardStepHeading title="Propose a change">
          This opens a pull request. The change reaches the catalog once a
          teammate merges it; agents keep their pinned version until their
          skills are updated.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Propose a skill">
          This opens a pull request. The skill reaches the catalog once a
          teammate merges it.
        </WizardStepHeading>
      )}

      {repositories.length === 0 && skippedCount === 0 && (
        <EmptyStateCard
          title="No skill repositories"
          description="A platform admin has to configure a skill repository first."
        />
      )}
      {repositories.length === 0 && skippedCount > 0 && (
        <EmptyStateCard
          title="No repository to propose to"
          description="Skills are proposed as GitHub pull requests, but none of the configured repositories is on github.com. Add the skill in its repository instead."
        />
      )}

      {repositories.length > 0 && !result && (
        <SkillCreationAssist
          getTarget={getCreationTarget}
          isEdit={Boolean(edit)}
        />
      )}
      {repositories.length > 0 && !result && (
        <Flex direction="column" gap="3">
          {edit && (
            <Text variant="body-small" color="secondary">
              {edit.skill.path ? `${edit.skill.path}/SKILL.md` : 'SKILL.md'} in{' '}
              {repoSlug(edit.skill.repoUrl)}, as of{' '}
              {shortCommit(edit.content.commit)}
            </Text>
          )}
          {!edit && repositories.length > 1 && (
            <Select
              label="Repository"
              isRequired
              searchable={searchableIf(repositories)}
              options={repositories.map(url => ({
                id: url,
                label: repoSlug(url),
              }))}
              selectedKey={repoUrl ?? null}
              onSelectionChange={key => {
                if (key) {
                  setRepoUrl(String(key));
                }
              }}
              {...repositoryError.selectProps}
            />
          )}
          {!edit && repositories.length > 1 && repositoryError.message}
          {!edit && repositories.length === 1 && repoUrl && (
            <Text variant="body-small" color="secondary">
              Repository: {repoSlug(repoUrl)}
            </Text>
          )}
          {skippedCount > 0 && (
            <Text variant="body-small" color="secondary">
              Only github.com repositories are offered, because skills are
              proposed as GitHub pull requests.
            </Text>
          )}
          {edit ? (
            <TextField
              label="Name"
              description="It cannot be changed; agents find the skill by its folder."
              value={skillName}
              isReadOnly
            />
          ) : (
            <TextField
              label="Name"
              isRequired
              description="Use lowercase letters, digits and dashes, e.g. ticket-triage."
              value={skillName}
              onChange={setSkillName}
              {...textFieldProps('name', fieldErrors.name)}
            />
          )}
          <TextField
            label="Description"
            isRequired
            description="Write one sentence on when an agent should reach for it."
            value={description}
            onChange={setDescription}
            {...textFieldProps('description', fieldErrors.description)}
          />
          <TextAreaField
            label="Instructions"
            // As bui's `isRequired` marks the fields above it.
            secondaryLabel="Required"
            description="Write what the agent should know and do. Markdown formatting allowed."
            rows={10}
            value={instructions}
            onChange={setInstructions}
            {...fieldProps('instructions', fieldErrors.instructions)}
          />
          {edit && (
            <SkillEditFiles
              skill={edit.skill}
              skillHref={edit.skillHref}
              instructions={instructions}
              files={edit.content.files}
              filesTruncated={edit.content.filesTruncated}
            />
          )}
        </Flex>
      )}
      {error && !result && (
        <Alert
          status="danger"
          title="Could not open the pull request"
          description={error.message}
        />
      )}
      {result && (
        <SkillPullRequestOutcome result={result} isUpdate={Boolean(edit)} />
      )}
    </WizardFrame>
  );
}
