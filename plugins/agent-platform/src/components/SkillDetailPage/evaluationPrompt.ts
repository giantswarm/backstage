import type { DiscoveredSkill } from '../../lib/skills';

/**
 * The first message of a skill-evaluation session: which skill, exactly where
 * it lives (repository, SKILL.md path, the commit the catalog pinned and its
 * branch), and what to deliver — an evaluation report in the chat and a pull
 * request with the proposed improvements.
 */
export function evaluationPrompt(
  skill: Pick<DiscoveredSkill, 'name' | 'repoUrl' | 'path' | 'commit' | 'ref'>,
): string {
  const file = skill.path ? `${skill.path}/SKILL.md` : 'SKILL.md';
  return [
    `Please evaluate the skill "${skill.name}".`,
    `It lives in ${skill.repoUrl}, file ${file}, at commit ${skill.commit} (branch ${skill.ref}).`,
    'Read it at that commit and reply with an evaluation report: what it does well, what is unclear, missing or inconsistent, and how an agent would actually use it.',
    `Then open a pull request against ${skill.ref} with your proposed improvements to ${file}, and link it in your report.`,
  ].join('\n\n');
}
