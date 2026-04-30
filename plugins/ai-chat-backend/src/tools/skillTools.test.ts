import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { createSkillTools } from './skillTools';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ai-skills-test-'));
}

describe('createSkillTools', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads bundled skills by default', async () => {
    const config = new ConfigReader({});
    const { listSkills } = createSkillTools(config, mockServices.logger.mock());

    const list = (await listSkills!.execute!({}, {} as any)) as {
      availableTopics: string[];
    };
    expect(list.availableTopics).toContain('grafana');
  });

  it('returns no tools when bundled is opted out and nothing else is configured', () => {
    const config = new ConfigReader({
      aiChat: { skills: { bundled: false } },
    });
    const tools = createSkillTools(config, mockServices.logger.mock());
    expect(tools).toEqual({});
  });

  it('returns no tools when bundled is opted out, dir is missing and inline is empty', () => {
    tmpDir = makeTmpDir();
    const missing = join(tmpDir, 'does-not-exist');
    const logger = mockServices.logger.mock();

    const config = new ConfigReader({
      aiChat: { skills: { bundled: false, dir: missing } },
    });
    const tools = createSkillTools(config, logger);
    expect(tools).toEqual({});
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(missing));
  });

  it('loads *.md files from a configured directory', async () => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'foo.md'), '# Foo\n\nFoo content.\n');
    writeFileSync(join(tmpDir, 'bar.md'), '# Bar\n');
    writeFileSync(join(tmpDir, 'ignored.txt'), 'not a skill');

    const config = new ConfigReader({
      aiChat: { skills: { bundled: false, dir: tmpDir } },
    });
    const { listSkills, getSkill } = createSkillTools(
      config,
      mockServices.logger.mock(),
    );

    const list = (await listSkills!.execute!({}, {} as any)) as {
      availableTopics: string[];
    };
    expect(list.availableTopics.sort()).toEqual(['bar', 'foo']);

    const hit = (await getSkill!.execute!({ topic: 'foo' }, {} as any)) as {
      topic: string;
      content: string;
    };
    expect(hit.topic).toBe('foo');
    expect(hit.content).toBe('# Foo\n\nFoo content.');
  });

  it('loads inline skills', async () => {
    const config = new ConfigReader({
      aiChat: {
        skills: {
          bundled: false,
          inline: [
            { name: 'alpha', content: 'alpha content' },
            { name: 'beta', content: '   beta content   ' },
          ],
        },
      },
    });
    const { listSkills, getSkill } = createSkillTools(
      config,
      mockServices.logger.mock(),
    );

    const list = (await listSkills!.execute!({}, {} as any)) as {
      availableTopics: string[];
    };
    expect(list.availableTopics.sort()).toEqual(['alpha', 'beta']);

    const beta = (await getSkill!.execute!({ topic: 'beta' }, {} as any)) as {
      content: string;
    };
    expect(beta.content).toBe('beta content');
  });

  it('dir entries override bundled skills with the same name', async () => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'grafana.md'), 'from-dir');

    const config = new ConfigReader({
      aiChat: { skills: { dir: tmpDir } },
    });
    const { getSkill } = createSkillTools(config, mockServices.logger.mock());

    const result = (await getSkill!.execute!(
      { topic: 'grafana' },
      {} as any,
    )) as { content: string };
    expect(result.content).toBe('from-dir');
  });

  it('inline entries override bundled skills with the same name', async () => {
    const config = new ConfigReader({
      aiChat: {
        skills: {
          inline: [{ name: 'grafana', content: 'from-config' }],
        },
      },
    });
    const { getSkill } = createSkillTools(config, mockServices.logger.mock());

    const result = (await getSkill!.execute!(
      { topic: 'grafana' },
      {} as any,
    )) as { content: string };
    expect(result.content).toBe('from-config');
  });

  it('inline skills override directory entries with the same name', async () => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, 'grafana.md'), 'from-disk');

    const config = new ConfigReader({
      aiChat: {
        skills: {
          bundled: false,
          dir: tmpDir,
          inline: [{ name: 'grafana', content: 'from-config' }],
        },
      },
    });
    const { getSkill } = createSkillTools(config, mockServices.logger.mock());

    const result = (await getSkill!.execute!(
      { topic: 'grafana' },
      {} as any,
    )) as { content: string };
    expect(result.content).toBe('from-config');
  });

  it('skips subdirectories', async () => {
    tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, 'nested.md'));
    writeFileSync(join(tmpDir, 'real.md'), 'real');

    const config = new ConfigReader({
      aiChat: { skills: { bundled: false, dir: tmpDir } },
    });
    const { listSkills } = createSkillTools(config, mockServices.logger.mock());

    const list = (await listSkills!.execute!({}, {} as any)) as {
      availableTopics: string[];
    };
    expect(list.availableTopics).toEqual(['real']);
  });
});
