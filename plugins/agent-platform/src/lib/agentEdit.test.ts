import {
  changedFields,
  editStateOf,
  editStateOfForm,
  formStateOfAgent,
  hasChanges,
  updateOf,
} from './agentEdit';
import type { AgentManagerAgent, AgentSkillEntry } from './agentManager';
import type { DiscoveredSkill } from './skills';

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
      egressText: '',
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
  it('replaces the whole egress list, and clears it with an empty list', () => {
    const withEgress = agent({ egress: ['https://github.com:443'] });
    expect(editStateOf(withEgress).egressText).toBe('https://github.com:443');
    expect(
      updateOf(withEgress, {
        ...editStateOf(withEgress),
        egressText: 'https://github.com:443\nhttps://*.githubusercontent.com',
      }),
    ).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      egress: ['https://github.com:443', 'https://*.githubusercontent.com'],
    });
    expect(
      updateOf(withEgress, { ...editStateOf(withEgress), egressText: ' \n' }),
    ).toEqual({ namespace: 'kagent', name: 'pr-reviewer', egress: [] });
    expect(
      changedFields(withEgress, {
        ...editStateOf(withEgress),
        egressText: '  https://github.com:443  ',
      }),
    ).toEqual([]);
  });

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

describe('the edit wizard (formStateOfAgent, editStateOfForm)', () => {
  const REPO = 'https://github.com/giantswarm/agent-skills';
  const CATALOG_PR_REVIEW: DiscoveredSkill = {
    name: 'PR review',
    description: 'Review pull requests.',
    // Written the other way round from the agent's entry: same repository.
    repoUrl: `${REPO}.git`,
    path: 'pr-review',
    ref: 'main',
    commit: OTHER,
  };
  const CATALOG_INCIDENT: DiscoveredSkill = {
    ...CATALOG_PR_REVIEW,
    name: 'Incident responder',
    path: 'incident',
  };
  const seed = (current: AgentManagerAgent) =>
    formStateOfAgent(current, {
      installation: 'gazelle',
      catalog: [CATALOG_PR_REVIEW, CATALOG_INCIDENT],
      platformHarness: 'kagent',
    });

  it('prefills the wizard with the agent, its fixed parts and its pins', () => {
    const state = seed(agent({ harness: 'kagent' }));

    expect(state).toMatchObject({
      name: 'PR reviewer',
      slug: 'pr-reviewer',
      description: 'Reviews pull requests.',
      systemMessage: 'You review pull requests.',
      installation: 'gazelle',
      modelConfigName: 'opus-4-7',
      modelConfigNamespace: 'kagent',
      // The platform Harness is the wizard's "no pick".
      harness: undefined,
      toolset: ['preset:read-only'],
    });
    // The listed skill is the catalog's card, at the agent's pin — not the head.
    expect(state.selectedSkills).toEqual([
      { ...CATALOG_PR_REVIEW, commit: HEAD },
    ]);
    // The OCI skill no repository lists is kept as it is.
    expect(state.keptSkills).toEqual([OCI_SKILL]);
  });

  it('keeps a Harness of its own by name', () => {
    expect(seed(agent({ harness: 'claude-code' })).harness).toEqual({
      name: 'claude-code',
    });
  });

  it('is no change at all when nothing is touched', () => {
    const current = agent();
    const update = updateOf(current, editStateOfForm(current, seed(current)));

    expect(hasChanges(update)).toBe(false);
  });

  it('names an agent without a display name by its technical name, which is not a change', () => {
    const current = agent({ displayName: undefined });
    const state = seed(current);

    expect(state.name).toBe('pr-reviewer');
    expect(changedFields(current, editStateOfForm(current, state))).toEqual([]);
    expect(
      updateOf(current, editStateOfForm(current, { ...state, name: 'PR bot' }))
        .displayName,
    ).toBe('PR bot');
  });

  it('writes untouched skills back verbatim and appends a new one at its card commit', () => {
    const current = agent();
    const state = seed(current);
    const update = updateOf(
      current,
      editStateOfForm(current, {
        ...state,
        selectedSkills: [...state.selectedSkills, CATALOG_INCIDENT],
      }),
    );

    expect(update.skills).toEqual([
      PR_REVIEW,
      OCI_SKILL,
      {
        name: 'Incident responder',
        path: 'incident',
        git: { url: `${REPO}.git`, commit: OTHER },
      },
    ]);
  });

  it('drops a deselected skill and a removed kept one', () => {
    const current = agent();
    const state = seed(current);
    const update = updateOf(
      current,
      editStateOfForm(current, {
        ...state,
        selectedSkills: [],
        keptSkills: [],
      }),
    );

    expect(update.skills).toEqual([]);
  });

  it('round-trips the Tools step’s Nothing outside the chat (T81)', () => {
    // An agent declaring no tools opens as Nothing outside the chat…
    const chatOnly = agent({ toolset: ['preset:none'] });
    const state = seed(chatOnly);
    expect(state.toolset).toEqual([]);
    expect(state.toolsChatOnly).toBe(true);
    expect(
      hasChanges(updateOf(chatOnly, editStateOfForm(chatOnly, state))),
    ).toBe(false);

    // …one declaring no toolset at all does not, and stays untouched…
    const implicit = agent({ toolset: undefined, implicitFullAccess: true });
    const implicitState = seed(implicit);
    expect(implicitState.toolsChatOnly).toBe(false);
    expect(
      hasChanges(updateOf(implicit, editStateOfForm(implicit, implicitState))),
    ).toBe(false);

    // …until Nothing outside the chat is picked for it: then it declares none.
    expect(
      updateOf(
        implicit,
        editStateOfForm(implicit, { ...implicitState, toolsChatOnly: true }),
      ).toolset,
    ).toEqual(['preset:none']);
  });
});
