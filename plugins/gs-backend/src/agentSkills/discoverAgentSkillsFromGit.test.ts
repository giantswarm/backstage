import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  discoverAgentSkillsFromGit,
  GitClient,
  GitFetchError,
  scanSkillsTree,
  toGitFetchError,
} from './discoverAgentSkillsFromGit';
import { gitBlobSha, MAX_INLINE_FILE_BYTES } from './skillFiles';

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

/** A GitClient that "clones" by writing the given files (repo-relative). */
function fakeCloneFiles(
  files: Record<string, string | Buffer>,
  result = { commit: HEAD, ref: 'main' },
): GitClient {
  return {
    async clone(dir) {
      for (const [file, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), content);
      }
      await mkdir(path.join(dir, '.git'), { recursive: true });
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
      {
        path: '',
        name: 'root',
        description: 'At root.',
        content: '---\nname: root\ndescription: At root.\n---\n',
      },
      {
        path: 'group/deep',
        name: undefined,
        description: undefined,
        content: 'No frontmatter at all.',
      },
      {
        path: 'notes',
        name: 'notes',
        description: undefined,
        content: '---\nname: notes\n---\nBody.',
      },
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
  it('discovers skills from a checkout, pins each to the head commit and keeps every SKILL.md', async () => {
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
          contentReadable: true,
          fileCount: 1,
        },
        {
          name: 'beta',
          description: 'Second.',
          repoUrl: 'http://gitserver.lab.local/skills.git',
          path: 'b-skill',
          ref: 'main',
          commit: HEAD,
          contentReadable: true,
          fileCount: 1,
        },
      ],
      contents: new Map([
        ['a-skill', 'no frontmatter'],
        ['b-skill', '---\nname: beta\ndescription: Second.\n---\n'],
      ]),
      files: expect.any(Map),
      fileContents: expect.any(Map),
    });
  });

  describe('file lists', () => {
    it('lists every skill’s regular files with git blob ids, nested files to the deepest skill, keeping the small ones', async () => {
      const result = await discoverAgentSkillsFromGit({
        repoUrl: 'http://gitserver.lab.local/skills.git',
        gitClient: {
          async clone(dir) {
            await fakeCloneFiles({
              'README.md': 'not a skill file',
              'ops/SKILL.md': '---\nname: ops\n---\n',
              'ops/references/runbook.md': '# Runbook\n',
              'ops/data/blob.bin': Buffer.from([1, 0, 2]),
              'ops/triage/SKILL.md': '---\nname: triage\n---\n',
              'ops/triage/notes.md': 'notes\n',
            }).clone(dir, '');
            // A symlink pointing out of the skill is not one of its files.
            await symlink('/etc/hosts', path.join(dir, 'ops', 'hosts'));
            return { commit: HEAD, ref: 'main' };
          },
        },
      });

      const sha = (text: string | Buffer) =>
        gitBlobSha(typeof text === 'string' ? Buffer.from(text) : text);
      expect(result.files).toEqual(
        new Map([
          [
            'ops',
            {
              files: [
                {
                  path: 'SKILL.md',
                  size: 18,
                  sha: sha('---\nname: ops\n---\n'),
                },
                {
                  path: 'data/blob.bin',
                  size: 3,
                  sha: sha(Buffer.from([1, 0, 2])),
                },
                {
                  path: 'references/runbook.md',
                  size: 10,
                  sha: sha('# Runbook\n'),
                },
              ],
              truncated: false,
              total: 3,
            },
          ],
          [
            'ops/triage',
            {
              files: [
                {
                  path: 'SKILL.md',
                  size: 21,
                  sha: sha('---\nname: triage\n---\n'),
                },
                { path: 'notes.md', size: 6, sha: sha('notes\n') },
              ],
              truncated: false,
              total: 2,
            },
          ],
        ]),
      );
      expect(result.skills.map(s => [s.path, s.fileCount])).toEqual([
        ['ops', 3],
        ['ops/triage', 2],
      ]);
      // Bytes by repository path, for the file viewer; nothing outside a skill.
      expect([...result.fileContents!.keys()].sort()).toEqual([
        'ops/SKILL.md',
        'ops/data/blob.bin',
        'ops/references/runbook.md',
        'ops/triage/SKILL.md',
        'ops/triage/notes.md',
      ]);
      expect(
        Buffer.from(result.fileContents!.get('ops/references/runbook.md')!),
      ).toEqual(Buffer.from('# Runbook\n'));
    });

    it('hashes a file over the inline cap without keeping it', async () => {
      const large = Buffer.alloc(MAX_INLINE_FILE_BYTES + 1, 'a');
      const result = await discoverAgentSkillsFromGit({
        repoUrl: 'http://gitserver.lab.local/skills.git',
        gitClient: fakeCloneFiles({
          'data-skill/SKILL.md': 'body',
          'data-skill/data/huge.csv': large,
        }),
      });

      expect(result.files!.get('data-skill')!.files[1]).toEqual({
        path: 'data/huge.csv',
        size: large.length,
        sha: gitBlobSha(large),
      });
      expect(result.fileContents!.has('data-skill/data/huge.csv')).toBe(false);
    });

    it('caps a skill’s list at 200 files and says so', async () => {
      const files: Record<string, string> = { 'big/SKILL.md': 'body' };
      for (let i = 0; i < 205; i++) {
        files[`big/refs/r-${String(i).padStart(3, '0')}.md`] = `${i}`;
      }
      const result = await discoverAgentSkillsFromGit({
        repoUrl: 'http://gitserver.lab.local/skills.git',
        gitClient: fakeCloneFiles(files),
      });

      const list = result.files!.get('big')!;
      expect(list.files).toHaveLength(200);
      expect(list.files[0].path).toBe('SKILL.md');
      expect(list.truncated).toBe(true);
      expect(list.total).toBe(206);
      expect(result.skills[0].fileCount).toBe(206);
      // Past the cap nothing is read either.
      expect(result.fileContents!.has('big/refs/r-204.md')).toBe(false);
    });
  });

  it('refuses with 409 when the branch head is no longer the commit asked for', async () => {
    const promise = discoverAgentSkillsFromGit({
      repoUrl: 'http://gitserver.lab.local/skills.git',
      ref: 'main',
      commit: 'a'.repeat(40),
      gitClient: fakeClone({ x: 'body' }),
    });

    await expect(promise).rejects.toBeInstanceOf(GitFetchError);
    await expect(promise).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('has moved on from aaaaaaa'),
    });
  });

  it('reads at the commit asked for when it is still the head', async () => {
    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'http://gitserver.lab.local/skills.git',
      commit: HEAD,
      gitClient: fakeClone({ x: 'body' }),
    });

    expect(result.commit).toBe(HEAD);
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
