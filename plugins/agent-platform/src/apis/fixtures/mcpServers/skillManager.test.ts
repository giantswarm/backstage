import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { catalogFromSkillManager } from '../../../lib/skillManager';
import { SkillManagerClient } from '../../SkillManagerClient';
import { musterApiOf } from './musterApiOf';
import { skillManagerFixtureServer } from './skillManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  const server = skillManagerFixtureServer(() => data);
  return {
    data,
    server,
    client: new SkillManagerClient(musterApiOf(server), INSTALLATION),
  };
}

describe('the fixture skill-manager', () => {
  it('lists the skill repositories of the installation in every state', async () => {
    const { client, data } = setup();
    const listing = await client.listSkills();
    const catalog = catalogFromSkillManager(listing);
    const repositories = data.skillRepositories.filter(
      r => r.installation === INSTALLATION,
    );
    expect(catalog.hasRepositories).toBe(true);
    expect(catalog.skills).toHaveLength(
      repositories.reduce((sum, r) => sum + r.skills.length, 0),
    );
    expect(catalog.plugins.length).toBeGreaterThan(0);
    // failed, stale and hidden
    expect(catalog.failedRepositories).toHaveLength(3);
    expect(catalog.privateRepositories.size).toBe(2);
    expect(catalog.proposalTargets.length).toBeGreaterThan(0);
    expect(catalog.skills.some(s => s.readOnly)).toBe(true);
    expect(listing.repositories.some(r => r.stale)).toBe(true);
  });

  it('reads a skill and its files', async () => {
    const { client } = setup();
    const [skill] = catalogFromSkillManager(await client.listSkills()).skills;
    const read = await client.getSkill(skill);
    expect(read).toMatchObject({
      name: skill.name,
      path: skill.path,
      repoUrl: skill.repoUrl,
    });
    expect(read.instructions).toContain(skill.description);
    expect(read.files.map(f => f.path)).toContain('SKILL.md');
    for (const file of read.files) {
      const content = await client.getSkillFile(skill, file.path);
      expect(content).toMatchObject({
        path: file.path,
        size: file.size,
        sha: file.sha,
        binary: false,
        truncated: false,
      });
      expect(content.content).toBeTruthy();
    }
    await expect(client.getSkillFile(skill, 'missing.md')).rejects.toThrow(
      'no file missing.md',
    );
  });

  it('reads no skill of a repository the person may not read', async () => {
    const { client, data } = setup();
    const hidden = data.skillRepositories.find(
      r => r.installation === INSTALLATION && r.state === 'hidden',
    )!;
    await expect(
      client.getSkill({
        repoUrl: hidden.url,
        commit: hidden.commit,
        path: 'x',
      }),
    ).rejects.toThrow('is not a skill source');
  });
});
