import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  discoverAgentSkillsFromGit,
  GitClient,
  GitFetchError,
  scanSkillsTree,
  toGitFetchError,
} from './discoverAgentSkillsFromGit';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

/** Writes a SKILL.md (and its directory) under root. */
async function writeSkill(root: string, dir: string, content: string) {
  const target = dir ? path.join(root, dir) : root;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'SKILL.md'), content, 'utf8');
}

/**
 * A GitClient that "clones" by writing the given skills into the directory —
 * the scan and the result shape are under test, not the git protocol.
 */
function fakeClone(
  skills: Record<string, string>,
  result = { commit: HEAD, ref: 'main' },
): GitClient {
  return {
    async clone(dir) {
      for (const [skillDir, content] of Object.entries(skills)) {
        await writeSkill(dir, skillDir, content);
      }
      // What a real clone also leaves behind, and the scan must skip.
      await mkdir(path.join(dir, '.git', 'objects'), { recursive: true });
      await writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
      return result;
    },
  };
}

describe('scanSkillsTree', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'scan-skills-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds SKILL.md at the root, in directories and nested, parsing frontmatter', async () => {
    await writeSkill(root, '', '---\nname: root\ndescription: At root.\n---\n');
    await writeSkill(root, 'notes', '---\nname: notes\n---\nBody.');
    await writeSkill(root, 'group/deep', 'No frontmatter at all.');

    const scanned = await scanSkillsTree(root);

    expect(scanned.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: '', name: 'root', description: 'At root.' },
      { path: 'group/deep', name: undefined, description: undefined },
      { path: 'notes', name: 'notes', description: undefined },
    ]);
  });

  it('does not descend into .git', async () => {
    await mkdir(path.join(root, '.git', 'skill-looking'), { recursive: true });
    await writeFile(
      path.join(root, '.git', 'skill-looking', 'SKILL.md'),
      '---\nname: trap\n---\n',
    );

    expect(await scanSkillsTree(root)).toEqual([]);
  });
});

describe('discoverAgentSkillsFromGit', () => {
  it('discovers skills from a checkout and pins each to the head commit', async () => {
    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'http://gitserver.lab.local/skills.git/',
      gitClient: fakeClone({
        'b-skill': '---\nname: beta\ndescription: Second.\n---\n',
        'a-skill': 'no frontmatter',
      }),
    });

    expect(result).toEqual({
      ref: 'main',
      commit: HEAD,
      truncated: false,
      skills: [
        {
          // Directory basename when the frontmatter has no name.
          name: 'a-skill',
          description: '',
          repoUrl: 'http://gitserver.lab.local/skills.git',
          path: 'a-skill',
          ref: 'main',
          commit: HEAD,
        },
        {
          name: 'beta',
          description: 'Second.',
          repoUrl: 'http://gitserver.lab.local/skills.git',
          path: 'b-skill',
          ref: 'main',
          commit: HEAD,
        },
      ],
    });
  });

  it('falls back to the repository basename for a root skill without a name', async () => {
    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'https://git.example.com/team/one-skill.git',
      gitClient: fakeClone({ '': 'just a body' }),
    });

    expect(result.skills).toEqual([
      expect.objectContaining({ name: 'one-skill', path: '' }),
    ]);
  });

  it('passes the requested ref to the clone and reports what it resolved to', async () => {
    const clone = jest.fn(async (dir: string) => {
      await writeSkill(dir, 'x', '---\nname: x\n---\n');
      return { commit: HEAD, ref: 'feature' };
    });

    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'https://git.example.com/team/skills',
      ref: 'feature',
      gitClient: { clone },
    });

    expect(clone).toHaveBeenCalledWith(
      expect.any(String),
      'https://git.example.com/team/skills',
      'feature',
    );
    expect(result.ref).toBe('feature');
  });

  it('refuses a non-http(s) URL before any clone', async () => {
    await expect(
      discoverAgentSkillsFromGit({
        repoUrl: 'git@github.com:giantswarm/skills.git',
        gitClient: fakeClone({}),
      }),
    ).rejects.toThrow('Not an http(s) git repository URL');
  });

  it('maps a failed clone to a GitFetchError with the upstream status', async () => {
    const failing: GitClient = {
      clone: async () => {
        const err = new Error('HTTP Error: 401 Unauthorized') as Error & {
          data: { statusCode: number };
        };
        err.data = { statusCode: 401 };
        throw err;
      },
    };

    const promise = discoverAgentSkillsFromGit({
      repoUrl: 'https://git.example.com/team/skills',
      gitClient: failing,
    });
    await expect(promise).rejects.toBeInstanceOf(GitFetchError);
    await expect(promise).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('private'),
    });
  });
});

describe('toGitFetchError', () => {
  const url = 'https://git.example.com/skills';

  it('maps a missing ref (NotFoundError) to 404', () => {
    const err = Object.assign(new Error('Could not find no-such-branch.'), {
      code: 'NotFoundError',
    });
    const mapped = toGitFetchError(err, url, 'no-such-branch');
    expect(mapped.status).toBe(404);
    expect(mapped.message).toContain('no-such-branch');
  });

  it('keeps the upstream HTTP status of a refused request', () => {
    const err = Object.assign(new Error('HTTP Error: 429'), {
      data: { statusCode: 429 },
    });
    expect(toGitFetchError(err, url, undefined).status).toBe(429);
  });

  it('turns an unreachable server into a 502 naming the repository', () => {
    const mapped = toGitFetchError(
      new Error('getaddrinfo ENOTFOUND git.example.com'),
      url,
      undefined,
    );
    expect(mapped.status).toBe(502);
    expect(mapped.message).toContain(url);
  });

  it('passes an existing GitFetchError through', () => {
    const original = new GitFetchError(404, 'gone');
    expect(toGitFetchError(original, url, undefined)).toBe(original);
  });
});
