import { FIXTURE_INSTALLATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  portalSkillRepositories,
  SkillDiscoveryFixtureApi,
} from './SkillDiscoveryFixtureApi';

const NOW = Date.parse('2026-11-16T12:00:00Z');

function newApi() {
  return new SkillDiscoveryFixtureApi(baseDataSet, () => NOW);
}

function repositoryIn(state: string) {
  const repository = portalSkillRepositories().find(r => r.state === state);
  if (!repository) {
    throw new Error(`no ${state} repository in the data set`);
  }
  return repository;
}

/** A listed skill of `state`'s repository, as the catalog pins it. */
async function skillIn(state: string) {
  const [skill] = (await newApi().discover(repositoryIn(state).url)).skills;
  return skill;
}

describe('SkillDiscoveryFixtureApi', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the skill repositories of the first fixture installation, one in each state', () => {
    const repositories = portalSkillRepositories();

    expect(
      repositories.every(r => r.installation === FIXTURE_INSTALLATION),
    ).toBe(true);
    expect(repositories.map(r => r.state)).toEqual([
      'readable',
      'private',
      'readOnly',
      'failed',
      'stale',
      'hidden',
    ]);
  });

  describe('discover', () => {
    it('lists a readable repository with its skills and plugin, proposable and fresh', async () => {
      const repository = repositoryIn('readable');

      const discovery = await newApi().discover(repository.url);

      expect(discovery).toMatchObject({
        proposable: true,
        path: '',
        ref: 'main',
        commit: repository.commit,
        private: false,
        stale: false,
        readAt: new Date(NOW).toISOString(),
      });
      expect(discovery).not.toHaveProperty('readOnly');
      expect(discovery.skills.map(skill => skill.name)).toEqual(
        repository.skills.map(skill => skill.name),
      );
      expect(discovery.skills[0]).toMatchObject({
        repoUrl: repository.url,
        commit: repository.commit,
        contentReadable: true,
        fileCount: 3,
      });
      expect(discovery.plugins).toHaveLength(1);
      expect(discovery.plugins![0].skills).toHaveLength(2);
    });

    it('lists a private repository as private, whoever asks: the portal reads it with its own credentials', async () => {
      for (const state of ['private', 'hidden']) {
        await expect(
          newApi().discover(repositoryIn(state).url),
        ).resolves.toMatchObject({ private: true, proposable: true });
      }
    });

    it('lists a read-only repository off GitHub as read-only, not proposable, with no private flag', async () => {
      const readOnly = await newApi().discover(repositoryIn('readOnly').url);

      expect(readOnly).toMatchObject({
        proposable: false,
        readOnly: true,
        path: 'skills',
      });
      expect(readOnly).not.toHaveProperty('private');
      expect(readOnly.skills.every(skill => skill.readOnly)).toBe(true);
    });

    it('serves the stale repository its last listing, marked stale and read earlier', async () => {
      const stale = await newApi().discover(repositoryIn('stale').url);

      expect(stale.stale).toBe(true);
      expect(Date.parse(stale.readAt!)).toBeLessThan(NOW);
      expect(stale.skills.length).toBeGreaterThan(0);
    });

    it("fails a failed repository in the route's words", async () => {
      const failed = repositoryIn('failed');
      const [, owner, repo] = failed.url.match(/github\.com\/(.+)\/(.+)$/)!;

      await expect(newApi().discover(failed.url)).rejects.toThrow(
        `Failed to discover skills: GitHub API https://api.github.com/repos/${owner}/${repo} returned 503: Service Unavailable`,
      );
    });

    it('fails loudly for a repository the data set lacks', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        newApi().discover('https://github.com/giantswarm/agent-skills'),
      ).rejects.toThrow(/Fixture mode does not answer/);
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('readSkill and readSkillFile', () => {
    it('read a listed skill and each of its files at the commit asked for', async () => {
      const api = newApi();
      const skill = await skillIn('readable');

      const content = await api.readSkill(skill);
      expect(content).toMatchObject({
        repoUrl: skill.repoUrl,
        path: skill.path,
        commit: skill.commit,
        name: skill.name,
      });
      expect(content.files!.map(file => file.path)).toEqual([
        'SKILL.md',
        'references/checklist.md',
        'scripts/check.sh',
      ]);
      for (const file of content.files!) {
        await expect(
          api.readSkillFile(skill, file.path),
        ).resolves.toMatchObject({ path: file.path, sha: file.sha });
      }
      await expect(api.readSkillFile(skill, 'missing.md')).rejects.toThrow(
        /missing.md is not a file of the skill/,
      );
    });

    it('refuse a GitHub skill at a commit the data set does not hold with a 404', async () => {
      const skill = await skillIn('readable');
      const commit = 'f'.repeat(40);

      await expect(newApi().readSkill({ ...skill, commit })).rejects.toThrow(
        `Failed to read the skill: ${skill.path}/SKILL.md was not found in ${skill.repoUrl} at fffffff.`,
      );
      await expect(
        newApi().readSkillFile({ ...skill, commit }, 'SKILL.md'),
      ).rejects.toThrow(/^Failed to read the skill file: .* at fffffff\.$/);
    });

    it('refuse a git skill whose branch moved on with a 409, and an unknown branch with a 404', async () => {
      const skill = await skillIn('readOnly');

      await expect(
        newApi().readSkill({ ...skill, commit: 'f'.repeat(40) }),
      ).rejects.toThrow(
        /^Failed to read the skill: main of .* has moved on from fffffff to [0-9a-f]{7}; reload the skill/,
      );
      await expect(
        newApi().readSkill({ ...skill, ref: 'release' }),
      ).rejects.toThrow(/Ref release was not found in/);
    });

    it('refuse a skill path the commit has no skill at', async () => {
      const skill = await skillIn('readable');

      await expect(
        newApi().readSkill({ ...skill, path: 'nowhere' }),
      ).rejects.toThrow(/nowhere\/SKILL.md was not found/);
    });
  });

  describe('proposeSkill', () => {
    const proposal = (repoUrl: string, skillName = 'take-notes') => ({
      repoUrl,
      skillName,
      description: 'How to take notes.',
      instructions: 'Write things down.',
    });

    it('opens a made-up pull request in memory, and refuses a second one from the same branch', async () => {
      const api = newApi();
      const repository = repositoryIn('readable');

      const opened = await api.proposeSkill(proposal(repository.url));

      expect(opened).toEqual({
        pullRequestUrl: `${repository.url}/pull/101`,
        number: 101,
        branch: 'add-skill/take-notes',
        base: 'main',
        path: 'take-notes/SKILL.md',
      });
      await expect(api.proposeSkill(proposal(repository.url))).rejects.toThrow(
        `Failed to open the pull request: A pull request for this skill is already open from add-skill/take-notes: ${opened.pullRequestUrl}`,
      );
      await expect(
        api.proposeSkill(proposal(repository.url, 'other')),
      ).resolves.toMatchObject({ number: 102 });
    });

    it('refuses as the route does: a name taken, a bad slug, a read-only or unconfigured repository', async () => {
      const api = newApi();
      const repository = repositoryIn('readable');

      await expect(
        api.proposeSkill(proposal(repository.url, repository.skills[0].name)),
      ).rejects.toThrow(/A skill named .* already exists/);
      await expect(
        api.proposeSkill(proposal(repository.url, 'Not A Slug')),
      ).rejects.toThrow(/skillName must be a lowercase slug/);
      await expect(
        api.proposeSkill(proposal(repositoryIn('readOnly').url)),
      ).rejects.toThrow('Only github.com repository URLs are allowed');
      await expect(
        api.proposeSkill(proposal('https://github.com/example/elsewhere')),
      ).rejects.toThrow(/is not one of the configured skill repositories/);
    });

    it('takes an update at the commit the edit started from, and refuses one made at an older commit', async () => {
      const api = newApi();
      const skill = await skillIn('private');
      const update = {
        ...proposal(skill.repoUrl, skill.name),
        kind: 'update' as const,
        path: skill.path,
        baseCommit: skill.commit,
      };

      await expect(api.proposeSkill(update)).resolves.toMatchObject({
        branch: `update-skill/${skill.path}`,
        path: `${skill.path}/SKILL.md`,
      });
      await expect(
        api.proposeSkill({ ...update, baseCommit: 'f'.repeat(40) }),
      ).rejects.toThrow(/The skill changed since you started editing/);
    });

    it("checks a proposal through skill-manager against the installation's sources, without asking for its headers", async () => {
      const api = newApi();
      const authHeaders = jest.fn();
      const [repository] = inInstallation(
        baseDataSet().skillRepositories,
        'fennel',
      );

      await expect(
        api.proposeSkill(proposal(repository.url), {
          installation: 'fennel',
          authHeaders,
        }),
      ).resolves.toMatchObject({ path: 'take-notes/SKILL.md' });
      await expect(
        api.proposeSkill(proposal(repositoryIn('readable').url), {
          installation: 'fennel',
          authHeaders,
        }),
      ).rejects.toThrow(/is not one of the configured skill repositories/);
      expect(authHeaders).not.toHaveBeenCalled();
    });
  });
});
