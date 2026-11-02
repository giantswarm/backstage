import { MESSAGE_TEXT_MAX_LENGTH } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  boundedDraft,
  HANDOFF_DRAFT_MAX_CHARS,
  skillCreationPrompt,
} from './skillCreationPrompt';

const SKILL = {
  name: 'triage',
  repoUrl: 'https://github.com/example/skills',
  path: 'skills/triage',
  commit: 'abc123',
  ref: 'main',
};

describe('boundedDraft', () => {
  it('leaves a draft within the budget as it is', () => {
    expect(boundedDraft('Short instructions.')).toBe('Short instructions.');
  });

  it('cuts a longer draft and says so inside it', () => {
    const draft = 'x'.repeat(HANDOFF_DRAFT_MAX_CHARS + 500);

    const bounded = boundedDraft(draft);

    expect(bounded.startsWith('x'.repeat(HANDOFF_DRAFT_MAX_CHARS))).toBe(true);
    expect(bounded).toContain(
      '[The draft is cut here: its last 500 characters did not fit into this message.]',
    );
  });

  it('never splits a character outside the BMP', () => {
    const draft = `${'x'.repeat(HANDOFF_DRAFT_MAX_CHARS - 1)}😀${'y'.repeat(10)}`;

    const bounded = boundedDraft(draft);

    expect(
      bounded.startsWith(`${'x'.repeat(HANDOFF_DRAFT_MAX_CHARS - 1)}\n`),
    ).toBe(true);
    expect(bounded).toContain('its last 12 characters');
  });
});

describe('skillCreationPrompt', () => {
  it('keeps a change with a huge description and SKILL.md under the message cap (R2-7)', () => {
    const prompt = skillCreationPrompt({
      kind: 'update',
      skill: SKILL,
      description: 'd'.repeat(40_000),
      instructions: 'i'.repeat(40_000),
    });

    expect(prompt.length).toBeLessThanOrEqual(MESSAGE_TEXT_MAX_LENGTH);
    // The cut sits inside each fence, as data like the rest of the draft.
    expect(prompt.match(/\[The draft is cut here/g)).toHaveLength(2);
    expect(prompt).toMatch(/did not fit into this message\.\]\n```/);
  });

  it('keeps a new skill with huge input under the message cap', () => {
    const prompt = skillCreationPrompt({
      kind: 'create',
      repoUrl: SKILL.repoUrl,
      name: 'triage',
      description: 'd'.repeat(40_000),
      instructions: 'i'.repeat(40_000),
    });

    expect(prompt.length).toBeLessThanOrEqual(MESSAGE_TEXT_MAX_LENGTH);
  });

  it('carries a draft within the budget whole', () => {
    const prompt = skillCreationPrompt({
      kind: 'update',
      skill: SKILL,
      instructions: 'Check the alert first.',
    });

    expect(prompt).toContain('Check the alert first.');
    expect(prompt).not.toContain('The draft is cut here');
  });
});
