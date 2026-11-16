import { FIXTURE_INSTALLATION } from '@giantswarm/backstage-plugin-gs-common';

import {
  portalSkillRepositories,
  SkillDiscoveryFixtureApi,
} from './SkillDiscoveryFixtureApi';

const api = new SkillDiscoveryFixtureApi();

function repositoryIn(state: string) {
  const repository = portalSkillRepositories().find(r => r.state === state);
  if (!repository) {
    throw new Error(`no ${state} repository in the data set`);
  }
  return repository;
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

  it('lists a readable repository with its skills and plugin, proposable', async () => {
    const repository = repositoryIn('readable');

    const discovery = await api.discover(repository.url);

    expect(discovery).toMatchObject({
      proposable: true,
      readOnly: false,
      path: '',
      ref: 'main',
      private: false,
    });
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

  it('marks a private repository private and a read-only one not proposable', async () => {
    await expect(
      api.discover(repositoryIn('private').url),
    ).resolves.toMatchObject({ private: true, proposable: true });
    const readOnly = await api.discover(repositoryIn('readOnly').url);
    expect(readOnly).toMatchObject({
      proposable: false,
      readOnly: true,
      path: 'skills',
    });
    expect(readOnly).not.toHaveProperty('private');
    expect(readOnly.skills.every(skill => skill.readOnly)).toBe(true);
  });

  it('fails a failed or hidden repository as GitHub refuses it', async () => {
    await expect(api.discover(repositoryIn('failed').url)).rejects.toThrow(
      /returned 503: Service Unavailable/,
    );
    await expect(api.discover(repositoryIn('hidden').url)).rejects.toThrow(
      /returned 404: Not Found/,
    );
  });

  it('fails loudly for a repository the data set lacks', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      api.discover('https://github.com/giantswarm/agent-skills'),
    ).rejects.toThrow(/Fixture mode does not answer/);
    expect(consoleError).toHaveBeenCalled();
  });

  it('reads a listed skill and each of its files', async () => {
    const repository = repositoryIn('readable');
    const [skill] = (await api.discover(repository.url)).skills;

    const content = await api.readSkill(skill);
    expect(content).toMatchObject({
      repoUrl: repository.url,
      path: skill.path,
      commit: repository.commit,
      name: skill.name,
    });
    expect(content.files!.map(file => file.path)).toEqual([
      'SKILL.md',
      'references/checklist.md',
      'scripts/check.sh',
    ]);

    for (const file of content.files!) {
      await expect(api.readSkillFile(skill, file.path)).resolves.toMatchObject({
        path: file.path,
        sha: file.sha,
        binary: false,
      });
    }
    await expect(api.readSkillFile(skill, 'missing.md')).rejects.toThrow(
      /No file missing.md/,
    );
  });
});
