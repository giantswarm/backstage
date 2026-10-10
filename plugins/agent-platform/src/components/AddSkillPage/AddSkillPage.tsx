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
  TextAreaField,
  useProvidePageHeaderActions,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import {
  SKILL_NAME_RE,
  useProposeSkill,
  type SkillPullRequest,
} from '../../hooks/useProposeSkill';
import { repoSlug } from '../../lib/skills';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';

/** The outcome: the pull request, and what happens next, in words. */
function SkillPullRequestOutcome({ result }: { result: SkillPullRequest }) {
  return (
    <Alert
      status="success"
      data-testid="skill-pr-outcome"
      title={`Pull request #${result.number} opened`}
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Opened as you: {result.path} on {result.branch}, against{' '}
            {result.base}. A teammate reviews and approves it — the skill
            appears in the catalog once the pull request merges.
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
 * The same single-step in-content wizard frame as Add model, so the Customize
 * screen's create flows all read the same. A person without a GitHub grant in
 * muster is bounced through muster's connect once (the `githubAuthApiRef` the
 * mutation mints its token from does that) and comes back to this page.
 */
export function AddSkillPage() {
  const navigate = useNavigate();
  // The target repositories: the same signed-in-config list the catalog is
  // discovered from.
  const { config } = useSignedInConfig();
  const repositories = useMemo(
    () =>
      config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [],
    [config],
  );
  const closeHref = `${SHELL_CUSTOMIZE_PATH}/skills`;

  const [repoUrl, setRepoUrl] = useState<string | undefined>(repositories[0]);
  const [skillName, setSkillName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const { proposeSkill, isProposing, error, result } = useProposeSkill();

  useEffect(() => {
    if (!repoUrl && repositories.length > 0) {
      setRepoUrl(repositories[0]);
    }
  }, [repoUrl, repositories]);

  const nameInvalid = skillName.length > 0 && !SKILL_NAME_RE.test(skillName);
  const isComplete =
    Boolean(repoUrl) &&
    SKILL_NAME_RE.test(skillName) &&
    description.trim().length > 0 &&
    instructions.trim().length > 0;

  const onSubmit = useCallback(async () => {
    if (!repoUrl || !isComplete) {
      return;
    }
    try {
      await proposeSkill({
        repoUrl,
        skillName,
        description: description.trim(),
        instructions: instructions.trim(),
      });
    } catch {
      // Shown from `error`, beside the form the user still has.
    }
  }, [repoUrl, isComplete, proposeSkill, skillName, description, instructions]);

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
        isDisabled={!isComplete || isProposing}
        onPress={onSubmit}
      >
        {isProposing ? 'Opening…' : 'Open pull request'}
      </Button>
    );
  }, [repositories.length, result, onDone, isComplete, isProposing, onSubmit]);
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title="Add skill"
      context="Customize / Skills"
      closeHref={closeHref}
    >
      <WizardStepHeading title="Propose a skill">
        Opens a pull request that adds the skill to the repository, as you. A
        teammate approves it; the skill appears in the catalog once it merges.
      </WizardStepHeading>

      {repositories.length === 0 && (
        <EmptyStateCard
          title="No skill repositories"
          description="Skills are proposed to the repositories a platform admin configures, and none is configured."
        />
      )}

      {repositories.length > 0 && !result && (
        <Flex direction="column" gap="3">
          {repositories.length > 1 ? (
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
            />
          ) : (
            repoUrl && (
              <Text variant="body-small" color="secondary">
                Repository: {repoSlug(repoUrl)}
              </Text>
            )
          )}
          <TextField
            label="Name"
            isRequired
            description="Becomes the skill's folder: lowercase letters, digits and dashes, e.g. ticket-triage."
            value={skillName}
            onChange={setSkillName}
            isInvalid={nameInvalid}
          />
          <TextField
            label="Description"
            isRequired
            description="One sentence on when an agent should reach for it."
            value={description}
            onChange={setDescription}
          />
          <TextAreaField
            label="Instructions"
            description="The SKILL.md body: what the agent should know and do, in Markdown."
            rows={10}
            value={instructions}
            onChange={setInstructions}
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
      {result && <SkillPullRequestOutcome result={result} />}
    </WizardFrame>
  );
}
