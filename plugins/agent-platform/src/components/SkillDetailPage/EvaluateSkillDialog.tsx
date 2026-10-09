import { Dialog, DialogBody, DialogHeader, Flex, Text } from '@backstage/ui';
import { dialogDismissLock } from '@giantswarm/backstage-plugin-ui-react';
import type { DiscoveredSkill } from '../../lib/skills';
import { shortCommit } from '../../lib/skills';
import { skillSource } from '../../lib/customize';
import type { AgentRow } from '../AgentsDataProvider';
import { NewSessionComposer } from '../NewSessionComposer';

/** The prompt the evaluation session opens with, prefilled and editable. */
export function evaluationPrompt(
  skill: Pick<DiscoveredSkill, 'name' | 'repoUrl' | 'path' | 'commit'>,
): string {
  return [
    `Load the skill "${skill.name}" from ${skillSource(skill)}${
      skill.path ? ` (directory ${skill.path})` : ''
    } at commit ${shortCommit(skill.commit)} and review it.`,
    'Check whether the instructions are clear, complete and consistent, and tell me what to improve.',
  ].join(' ');
}

export type EvaluateSkillDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  skill: DiscoveredSkill;
  /** The agent configured as `metaAgents.skillEvaluation`. */
  evaluator: AgentRow;
  isStarting: boolean;
  error?: string;
  onStart: (agent: AgentRow, prompt: string) => void;
};

/**
 * Evaluate a skill: start a session with the configured Skill Evaluator agent,
 * the review prompt prefilled and still editable. The caller only renders this
 * where `useMetaAgent('skillEvaluation')` resolves (decision G8).
 *
 * Same conventions as `NewSessionDialog`: the composer owns the form and the
 * Start button, the dialog does not close on submit (the create can fail and
 * this is where the error and the prompt live), and it cannot be dismissed
 * while the create is in flight. The caller closes it by navigating away.
 */
export function EvaluateSkillDialog({
  isOpen,
  onOpenChange,
  skill,
  evaluator,
  isStarting,
  error,
  onStart,
}: EvaluateSkillDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(isStarting, onOpenChange)}
      width="min(90vw, 560px)"
    >
      <DialogHeader>Evaluate this skill</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          <Text as="p" variant="body-medium" color="secondary">
            Starts a session with {evaluator.name}. You get a report with
            strengths, gaps and suggested edits — nothing in the skill changes.
          </Text>
          <NewSessionComposer
            agents={[evaluator]}
            defaultAgent={evaluator}
            initialPrompt={evaluationPrompt(skill)}
            isStarting={isStarting}
            error={error}
            onStart={onStart}
            // The same deliberate exception the NewSessionDialog carries: a modal
            // the user opened in order to type, where react-aria focuses the
            // dialog container rather than the field.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </Flex>
      </DialogBody>
    </Dialog>
  );
}
