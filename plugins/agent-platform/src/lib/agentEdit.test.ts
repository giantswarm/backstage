import { changedFields, editStateOf, hasChanges, updateOf } from './agentEdit';
import type { AgentManagerAgent, AgentSkillEntry } from './agentManager';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const OTHER = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';

const PR_REVIEW: AgentSkillEntry = {
  name: 'pr-review',
  path: 'pr-review',
  git: { url: 'https://github.com/giantswarm/agent-skills', commit: HEAD },
};

const OCI_SKILL: AgentSkillEntry = {
  name: 'runbooks',
  oci: 'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
};

function agent(overrides: Partial<AgentManagerAgent> = {}): AgentManagerAgent {
  return {
    name: 'pr-reviewer',
    namespace: 'kagent',
    exists: true,
    displayName: 'PR reviewer',
    description: 'Reviews pull requests.',
    systemMessage: 'You review pull requests.',
    modelConfig: 'opus-4-7',
    skills: [PR_REVIEW, OCI_SKILL],
    toolset: ['preset:read-only'],
    ready: true,
    managed: 'helmrelease',
    ...overrides,
  };
}

describe('editStateOf', () => {
  it("pre-fills every editable field from get_agent's reading, and nothing else", () => {
    expect(editStateOf(agent())).toEqual({
      displayName: 'PR reviewer',
      description: 'Reviews pull requests.',
      systemMessage: 'You review pull requests.',
      modelConfig: 'opus-4-7',
      toolset: ['preset:read-only'],
      skills: [PR_REVIEW, OCI_SKILL],
    });
    // No runtime: every agent runs on the platform Harness.
    expect(Object.keys(editStateOf(agent()))).not.toContain('runtime');
  });

  it('reads an unset field as empty and no toolset as the empty selection', () => {
    const state = editStateOf(
      agent({
        displayName: undefined,
        description: undefined,
        systemMessage: undefined,
        toolset: undefined,
        skills: undefined,
      }),
    );
    expect(state.displayName).toBe('');
    expect(state.systemMessage).toBe('');
    expect(state.toolset).toEqual([]);
    expect(state.skills).toEqual([]);
  });

  it('keeps preset:none out of the selection — the empty selection is no tools', () => {
    expect(editStateOf(agent({ toolset: ['preset:none'] })).toolset).toEqual(
      [],
    );
  });
});

describe('updateOf', () => {
  it('sends nothing but the identity when nothing changed', () => {
    const current = agent();
    const update = updateOf(current, editStateOf(current));
    expect(update).toEqual({ namespace: 'kagent', name: 'pr-reviewer' });
    expect(hasChanges(update)).toBe(false);
  });

  it('sends only the fields that changed', () => {
    const current = agent();
    const update = updateOf(current, {
      ...editStateOf(current),
      description: 'Reviews Go pull requests.',
    });
    expect(update).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews Go pull requests.',
    });
    expect(
      changedFields(current, { ...editStateOf(current), description: 'x' }),
    ).toEqual(['description']);
  });

  it('sends an emptied field as "" — back to the chart default — not as absent', () => {
    const current = agent();
    const update = updateOf(current, {
      ...editStateOf(current),
      systemMessage: '   ',
      displayName: '',
    });
    expect(update.systemMessage).toBe('');
    expect(update.displayName).toBe('');
    expect('description' in update).toBe(false);
  });

  it('replaces the whole toolset and declares the empty selection as preset:none', () => {
    const current = agent();
    expect(
      updateOf(current, { ...editStateOf(current), toolset: [] }).toolset,
    ).toEqual(['preset:none']);
    expect(
      updateOf(current, {
        ...editStateOf(current),
        toolset: ['preset:read-only', 'server:mcp-prometheus'],
      }).toolset,
    ).toEqual(['preset:read-only', 'server:mcp-prometheus']);
  });

  it('leaves an agent with implicit full access alone until a selector is picked', () => {
    const current = agent({ toolset: undefined, implicitFullAccess: true });
    expect(hasChanges(updateOf(current, editStateOf(current)))).toBe(false);
    expect(
      updateOf(current, {
        ...editStateOf(current),
        toolset: ['preset:read-only'],
      }).toolset,
    ).toEqual(['preset:read-only']);
  });

  it('replaces the whole skill list, with the pins as chosen', () => {
    const current = agent();
    const added: AgentSkillEntry = {
      name: 'incident',
      path: 'incident',
      git: { url: 'https://github.com/giantswarm/agent-skills', commit: OTHER },
    };
    const update = updateOf(current, {
      ...editStateOf(current),
      skills: [PR_REVIEW, OCI_SKILL, added],
    });
    expect(update.skills).toEqual([PR_REVIEW, OCI_SKILL, added]);
    expect(Object.keys(update)).toEqual(['namespace', 'name', 'skills']);
  });

  it('treats a re-pinned skill as a change and an identical list as none', () => {
    const current = agent();
    const moved: AgentSkillEntry = {
      ...PR_REVIEW,
      git: { ...PR_REVIEW.git, commit: OTHER },
    };
    expect(
      changedFields(current, {
        ...editStateOf(current),
        skills: [moved, OCI_SKILL],
      }),
    ).toEqual(['skills']);
    expect(
      changedFields(current, {
        ...editStateOf(current),
        skills: [{ ...PR_REVIEW }, { ...OCI_SKILL }],
      }),
    ).toEqual([]);
  });

  it('never carries force or a runtime', () => {
    const current = agent();
    const update = updateOf(current, {
      ...editStateOf(current),
      modelConfig: 'sonnet-4-5',
    });
    expect(update).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      modelConfig: 'sonnet-4-5',
    });
    expect('force' in update).toBe(false);
    expect('runtime' in update).toBe(false);
  });
});
