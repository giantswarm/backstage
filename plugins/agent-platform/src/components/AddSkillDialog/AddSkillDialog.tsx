import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  ButtonLink,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import { dialogDismissLock } from '@giantswarm/backstage-plugin-ui-react';

import {
  SKILL_NAME_RE,
  useProposeSkill,
  type SkillPullRequest,
} from '../../hooks/useProposeSkill';
import { repoSlug } from '../../lib/skills';
import { DIALOG_FORM_STYLE } from '../dialogForm';

export type AddSkillDialogProps = {
  /** The configured skill repositories (`agentPlatform.skills.repositories`). */
  repositories: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

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
 * Add a skill to one of the configured skill repositories, as a pull request
 * opened **as the signed-in person** (decision G16 B): name, description and
 * instructions become a `<name>/SKILL.md` on a branch, and the dialog ends on
 * the opened pull request. Nothing deploys from here — a teammate approves the
 * PR, and discovery picks the skill up once it merges.
 *
 * A person without a GitHub grant in muster is bounced through muster's
 * connect once (the `githubAuthApiRef` the mutation mints its token from does
 * that) and comes back to this page.
 */
export function AddSkillDialog({
  repositories,
  isOpen,
  onOpenChange,
}: AddSkillDialogProps) {
  const [repoUrl, setRepoUrl] = useState<string | undefined>(repositories[0]);
  const [skillName, setSkillName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const { proposeSkill, isProposing, error, result, reset } = useProposeSkill();

  useEffect(() => {
    if (!repoUrl && repositories.length > 0) {
      setRepoUrl(repositories[0]);
    }
  }, [repoUrl, repositories]);

  // A fresh form per open; the outcome of the last run does not linger.
  useEffect(() => {
    if (!isOpen) {
      setSkillName('');
      setDescription('');
      setInstructions('');
      reset();
    }
    // `reset` changes identity every render; reset once per close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const nameInvalid = skillName.length > 0 && !SKILL_NAME_RE.test(skillName);
  const isComplete =
    Boolean(repoUrl) &&
    SKILL_NAME_RE.test(skillName) &&
    description.trim().length > 0 &&
    instructions.trim().length > 0;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
  };

  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(isProposing, onOpenChange)}
      width="min(90vw, 640px)"
    >
      <form onSubmit={onSubmit} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Add skill</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              Opens a pull request that adds the skill to the repository, as
              you. A teammate approves it; the skill appears here once it
              merges.
            </Text>
            {!result && (
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
                  isRequired
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
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex justify="end" gap="2">
            <Button
              variant="secondary"
              isDisabled={isProposing}
              onPress={() => onOpenChange(false)}
            >
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!isComplete}
                isPending={isProposing}
              >
                Open pull request
              </Button>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
