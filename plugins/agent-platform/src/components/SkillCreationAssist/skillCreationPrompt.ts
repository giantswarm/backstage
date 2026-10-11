import type { DiscoveredSkill } from '../../lib/skills';

/**
 * What the skill form hands over to the skill creator agent: a new skill for
 * a repository (with whatever the person has typed so far), or a change to an
 * existing one.
 */
export type SkillCreationTarget =
  | {
      kind: 'create';
      /** The repository the form would propose to. */
      repoUrl: string;
      /** The name typed so far, if any. */
      name?: string;
      /** The description typed so far, if any. */
      description?: string;
      /** The instructions typed so far, if any. */
      instructions?: string;
    }
  | {
      kind: 'update';
      skill: Pick<
        DiscoveredSkill,
        'name' | 'repoUrl' | 'path' | 'commit' | 'ref'
      >;
      /** Instructions the person has rewritten in the form, if changed. */
      instructions?: string;
    };

/**
 * The text in a fenced block that its own content cannot close: a fence one
 * backtick longer than the longest run inside, at least three.
 */
function fenced(text: string): string {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map(run => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}markdown\n${text}\n${fence}`;
}

/**
 * The first message of a skill-creator session: which repository (and, for a
 * change, which skill exactly — directory, SKILL.md, commit, branch), what the
 * person already typed — instructions included, in a fenced block the agent
 * continues from — and how to work: ask about the skill's purpose (what is
 * still missing, given a draft) before writing anything, then propose it as a
 * pull request.
 */
export function skillCreationPrompt(target: SkillCreationTarget): string {
  if (target.kind === 'update') {
    const { skill } = target;
    const file = skill.path ? `${skill.path}/SKILL.md` : 'SKILL.md';
    const draft = target.instructions?.trim();
    return [
      `I'd like to change the skill "${skill.name}". It lives in ${skill.repoUrl}, file ${file}, at commit ${skill.commit} (branch ${skill.ref}). It may need more than its SKILL.md — reference files, scripts or data next to it.`,
      'Read it at that commit, then ask me what should change before you write anything.',
      ...(draft
        ? [
            `I have already rewritten its instructions in the form; continue from them:\n\n${fenced(draft)}`,
          ]
        : []),
      `Propose the change as a pull request against ${skill.ref} and link it here.`,
    ].join('\n\n');
  }
  const known = [
    target.name?.trim() ? `Its name: ${target.name.trim()}.` : undefined,
    target.description?.trim()
      ? `What it is for, so far: ${target.description.trim()}`
      : undefined,
  ].filter(Boolean);
  const draft = target.instructions?.trim();
  return [
    `I'd like to create a new skill in ${target.repoUrl}. It may need more than a SKILL.md — reference files, scripts or data next to it.`,
    ...(known.length > 0 ? [known.join('\n')] : []),
    ...(draft
      ? [
          `Instructions I have typed so far; continue from them:\n\n${fenced(draft)}`,
        ]
      : []),
    `Ask me ${
      draft ? 'what is missing' : 'what the skill is for'
    } before you write anything. Then propose it as a pull request to that repository and link it here.`,
  ].join('\n\n');
}
