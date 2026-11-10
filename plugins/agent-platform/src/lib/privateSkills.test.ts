import {
  agentSkillsSecretOf,
  privateSkillsNoteOf,
  privateSourcesOf,
  skillsCredentialOf,
} from './privateSkills';

const PRIVATE = new Set(['https://github.com/giantswarm/claude-code']);
const COMMIT = 'a'.repeat(40);

describe('privateSourcesOf', () => {
  it('names each private repository of the skills and plugins once, as written', () => {
    expect(
      privateSourcesOf(
        {
          skills: [
            {
              name: 'kyverno',
              git: {
                url: 'https://github.com/GiantSwarm/claude-code',
                commit: COMMIT,
              },
            },
            {
              name: 'review',
              git: {
                url: 'https://github.com/giantswarm/agent-skills',
                commit: COMMIT,
              },
            },
            { name: 'packaged', oci: 'gsoci.azurecr.io/skills/x@sha256:1' },
          ],
          plugins: [
            {
              git: {
                url: 'https://github.com/giantswarm/claude-code.git',
                commit: COMMIT,
              },
            },
          ],
        },
        PRIVATE,
      ),
    ).toEqual(['GiantSwarm/claude-code']);
  });

  it('finds none among public sources', () => {
    expect(
      privateSourcesOf(
        {
          skills: [
            {
              name: 'review',
              git: {
                url: 'https://github.com/giantswarm/agent-skills',
                commit: COMMIT,
              },
            },
          ],
        },
        PRIVATE,
      ),
    ).toEqual([]);
  });
});

describe('skillsCredentialOf', () => {
  it('is the installation credential, with a failed refresh', () => {
    expect(
      skillsCredentialOf({
        skillsGitAuthSecretName: 'agent-manager-skills-token',
        skillsGitAuthMint: {
          secretName: 'agent-manager-skills-token',
          error: 'GitHub answered 401',
        },
      }),
    ).toEqual({
      kind: 'installation',
      secretName: 'agent-manager-skills-token',
      refreshError: 'GitHub answered 401',
    });
  });

  it('is none without an installation credential', () => {
    expect(skillsCredentialOf({})).toEqual({ kind: 'none' });
  });

  it("is the agent's own when it names another Secret", () => {
    expect(
      skillsCredentialOf({ skillsGitAuthSecretName: 'shared' }, 'team-token'),
    ).toEqual({ kind: 'agent', secretName: 'team-token' });
    expect(
      skillsCredentialOf({ skillsGitAuthSecretName: 'shared' }, 'shared'),
    ).toEqual({ kind: 'installation', secretName: 'shared' });
  });
});

describe('agentSkillsSecretOf', () => {
  it("reads the agent's own credential from its values", () => {
    expect(
      agentSkillsSecretOf({
        values: { skillsGitAuthSecretRef: { name: 'team-token' } },
      }),
    ).toBe('team-token');
    expect(agentSkillsSecretOf({ values: {} })).toBeUndefined();
    expect(agentSkillsSecretOf(undefined)).toBeUndefined();
  });
});

describe('privateSkillsNoteOf', () => {
  const base = {
    privateSources: ['giantswarm/claude-code'],
    installation: 'gazelle',
  };

  it('says nothing without a private source', () => {
    expect(
      privateSkillsNoteOf({
        ...base,
        privateSources: [],
        credential: { kind: 'none' },
      }),
    ).toBeUndefined();
  });

  it('warns, and names the contract, when the installation has no credential', () => {
    const note = privateSkillsNoteOf({ ...base, credential: { kind: 'none' } });
    expect(note).toMatchObject({
      status: 'warning',
      title: 'No credential for private skills',
    });
    expect(note?.description).toContain(
      'giantswarm/claude-code is a private repository',
    );
    expect(note?.description).toContain('a Secret with the key token');
    expect(note?.description).toContain('can be created');
  });

  it('warns when the minted token fails to refresh', () => {
    expect(
      privateSkillsNoteOf({
        ...base,
        credential: {
          kind: 'installation',
          secretName: 'skills-token',
          refreshError: 'GitHub answered 401',
        },
      }),
    ).toMatchObject({
      status: 'warning',
      description: expect.stringContaining('GitHub answered 401'),
    });
  });

  it('names the credential the agent will use', () => {
    expect(
      privateSkillsNoteOf({
        ...base,
        privateSources: ['giantswarm/a', 'giantswarm/b'],
        credential: { kind: 'installation', secretName: 'skills-token' },
      }),
    ).toEqual({
      status: 'info',
      title: 'Private skills',
      description:
        "giantswarm/a and giantswarm/b are private. The agent fetches them with the installation's credential Secret skills-token; there is nothing to set up.",
    });
  });
});
