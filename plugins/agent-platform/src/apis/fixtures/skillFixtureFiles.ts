import {
  hashOf,
  type FixtureSkill,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type { SkillFile } from '../../lib/skills';

// A fixture skill's files, the same whichever source reads them:
// skill-manager's tools or gs-backend's `/agent-skills`.

/** A git blob id of the same length, the same for the same text. */
function blobId(value: string): string {
  let id = '';
  for (let round = 0; id.length < 40; round++) {
    id += hashOf(`${round}:${value}`).toString(16).padStart(8, '0');
  }
  return id.slice(0, 40);
}

/** A skill's files, by path: its SKILL.md and what it refers to. */
export function filesOf(skill: FixtureSkill): Map<string, string> {
  const instructions = instructionsOf(skill);
  return new Map([
    [
      'SKILL.md',
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${instructions}`,
    ],
    [
      'references/checklist.md',
      `# Checklist\n\n- Read the change.\n- Run the checks of ${skill.name}.\n- Write down what you found.\n`,
    ],
    [
      'scripts/check.sh',
      `#!/bin/sh\n# The checks ${skill.name} runs.\nset -eu\necho "checking"\n`,
    ],
  ]);
}

export function instructionsOf(skill: FixtureSkill): string {
  return [
    `# ${skill.name}`,
    '',
    skill.description,
    '',
    '## Steps',
    '',
    '1. Read the request and what it refers to.',
    '2. Follow `references/checklist.md`.',
    '3. Run `scripts/check.sh` and report what it found.',
    '',
  ].join('\n');
}

export function fileOf(path: string, content: string): SkillFile {
  return {
    path,
    size: new TextEncoder().encode(content).length,
    sha: blobId(content),
  };
}
