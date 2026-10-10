import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
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
  fieldErrorProps,
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
import { repoSlug, shortCommit, type DiscoveredSkill } from '../../lib/skills';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';

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
            Opened as you: {result.path} on {result.branch}, against{' '}
            {result.base}. A teammate reviews and approves it —{' '}
            {isUpdate
              ? 'the change reaches the catalog once the pull request merges.'
              : 'the skill appears in the catalog once the pull request merges.'}
          </Text>
          <div>
            <ButtonLink
              href={result.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="small"
            >
              Open the pull request ↗
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
 * `update-skill/<name>`. Submitting waits for an actual change.
 *
 * The same single-step in-content wizard frame as Add model, so the Customize
 * screen's create flows all read the same. A person without a GitHub grant in
 * muster is bounced through muster's connect once (the `githubAuthApiRef` the
 * mutation mints its token from does that) and comes back to this page.
 */
export function AddSkillPage({ edit }: { edit?: SkillEdit } = {}) {
  const navigate = useNavigate();
  // The target repositories: the same signed-in-config list the catalog is
  // discovered from. An edit targets the skill's own repository.
  const { config } = useSignedInConfig();
  const editRepoUrl = edit?.skill.repoUrl;
  const repositories = useMemo(
    () =>
      editRepoUrl
        ? [editRepoUrl]
        : (config?.getOptionalStringArray(
            'agentPlatform.skills.repositories',
          ) ?? []),
    [config, editRepoUrl],
  );
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

  // Each field's problem, shown on the field itself once a submit was
  // blocked; a name that breaks the folder rule says so while it is typed.
  const nameInvalid = skillName.length > 0 && !SKILL_NAME_RE.test(skillName);
  const fieldErrors = {
    repository: repoUrl ? undefined : 'Choose a repository',
    name: (() => {
      if (edit) {
        return undefined;
      }
      if (!skillName) {
        return 'Name is required';
      }
      return nameInvalid
        ? 'Use lowercase letters, digits and dashes, e.g. ticket-triage'
        : undefined;
    })(),
    description: description.trim() ? undefined : 'Description is required',
    instructions: instructions.trim() ? undefined : 'Instructions are required',
  };
  const isValid = Object.values(fieldErrors).every(problem => !problem);
  // An edit with nothing changed has nothing to propose — not a field's
  // fault, so the button waits instead of pointing at one.
  const isChanged =
    !edit ||
    description.trim() !== edit.content.description.trim() ||
    instructions.trim() !== edit.content.instructions.trim();
  const validation = useFieldValidation();
  const { reveal } = validation;
  const repositoryError = useSelectFieldError(
    validation.errorFor(fieldErrors.repository),
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
      context={
        edit ? `Customize / Skills / ${edit.skill.name}` : 'Customize / Skills'
      }
      closeHref={closeHref}
    >
      <Helmet
        title={edit ? `Edit ${edit.skill.name} · Skills` : 'Add skill · Skills'}
      />
      {edit ? (
        <WizardStepHeading title="Propose a change">
          Opens a pull request that updates the skill in the repository, as you.
          A teammate approves it; the change reaches the catalog once it merges.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Propose a skill">
          Opens a pull request that adds the skill to the repository, as you. A
          teammate approves it; the skill appears in the catalog once it merges.
        </WizardStepHeading>
      )}

      {repositories.length === 0 && (
        <EmptyStateCard
          title="No skill repositories"
          description="Skills are proposed to the repositories a platform admin configures, and none is configured."
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
          {edit ? (
            <TextField
              label="Name"
              description="The skill's name stays as it is; agents find it by its folder."
              value={skillName}
              isReadOnly
            />
          ) : (
            <TextField
              label="Name"
              isRequired
              description="Becomes the skill's folder: lowercase letters, digits and dashes, e.g. ticket-triage."
              value={skillName}
              onChange={setSkillName}
              {...fieldErrorProps(
                nameInvalid
                  ? fieldErrors.name
                  : validation.errorFor(fieldErrors.name),
              )}
            />
          )}
          <TextField
            label="Description"
            isRequired
            description="One sentence on when an agent should reach for it."
            value={description}
            onChange={setDescription}
            {...fieldErrorProps(validation.errorFor(fieldErrors.description))}
          />
          <TextAreaField
            label="Instructions"
            description="The SKILL.md body: what the agent should know and do, in Markdown."
            rows={10}
            value={instructions}
            onChange={setInstructions}
            error={validation.errorFor(fieldErrors.instructions)}
          />
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
