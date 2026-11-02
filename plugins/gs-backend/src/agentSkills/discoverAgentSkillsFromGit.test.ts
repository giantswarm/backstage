import {
  access,
  mkdtemp,
  mkdir,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  abortableHttp,
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
  it('lists the plugins of the checkout at the same commit', async () => {
    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'http://gitserver.lab.local/skills.git',
      gitClient: fakeCloneFiles({
        'ops/plugin.json': '{}',
        'ops/skills/runbook/SKILL.md':
          '---\nname: runbook\ndescription: Runs books.\n---\n',
        'commits/.claude-plugin/plugin.json': '{}',
      }),
    });

    expect(result.plugins).toEqual([
      {
        name: 'commits',
        repoUrl: 'http://gitserver.lab.local/skills.git',
        path: 'commits',
        ref: 'main',
        commit: HEAD,
        format: 'claude-code',
        skills: [],
      },
      {
        name: 'ops',
        repoUrl: 'http://gitserver.lab.local/skills.git',
        path: 'ops',
        ref: 'main',
        commit: HEAD,
        format: 'agent-plugins',
        skills: [{ name: 'runbook', description: 'Runs books.' }],
      },
    ]);
  });

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
      plugins: [],
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
      undefined,
    );
    expect(result.ref).toBe('feature');
  });

  it('clones the default branch for an empty ref, as for none', async () => {
    const clone = jest.fn(async (dir: string) => {
      await writeSkill(dir, 'x', '---\nname: x\n---\n');
      return { commit: HEAD, ref: 'main' };
    });

    const result = await discoverAgentSkillsFromGit({
      repoUrl: 'https://git.example.com/team/skills',
      ref: '',
      gitClient: { clone },
    });

    expect(clone).toHaveBeenCalledWith(
      expect.any(String),
      'https://git.example.com/team/skills',
      undefined,
      undefined,
    );
    expect(result.skills[0].ref).toBe('main');
  });

  describe('when the read is aborted mid-clone', () => {
    const exists = (dir: string) =>
      access(dir).then(
        () => true,
        () => false,
      );
    /** Whether `dir` is removed within a moment (the cleanup is async). */
    const removedSoon = async (dir: string) => {
      for (let i = 0; i < 50 && (await exists(dir)); i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return !(await exists(dir));
    };

    it('stops at once and removes the checkout once the clone has stopped', async () => {
      let cloneDir = '';
      // Like the real client: its requests abort with the signal.
      const clone = jest.fn(
        (dir: string, _url: string, _ref?: string, signal?: AbortSignal) => {
          cloneDir = dir;
          return new Promise<never>((_, reject) => {
            signal!.addEventListener('abort', () =>
              reject(new Error('socket hang up')),
            );
          });
        },
      );
      const controller = new AbortController();

      const read = discoverAgentSkillsFromGit({
        repoUrl: 'https://git.example.com/team/skills',
        signal: controller.signal,
        gitClient: { clone },
      });
      while (!cloneDir) {
        await new Promise(resolve => setImmediate(resolve));
      }
      expect(await exists(cloneDir)).toBe(true);
      controller.abort(new GitFetchError(504, 'deadline'));

      await expect(read).rejects.toMatchObject({ status: 504 });
      expect(await removedSoon(cloneDir)).toBe(true);
    });

    it('aborts the real client’s request to a server that never answers', async () => {
      // A black-holed git host: the request arrives, no answer ever does.
      let closed!: () => void;
      const connectionClosed = new Promise<void>(resolve => {
        closed = resolve;
      });
      let received!: () => void;
      const requestReceived = new Promise<void>(resolve => {
        received = resolve;
      });
      const server = http.createServer(req => {
        req.socket.on('close', closed);
        received();
      });
      await new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const { port } = server.address() as AddressInfo;
      const controller = new AbortController();
      try {
        const read = discoverAgentSkillsFromGit({
          repoUrl: `http://127.0.0.1:${port}/skills.git`,
          signal: controller.signal,
        });
        await requestReceived;
        controller.abort(new GitFetchError(504, 'deadline'));

        await expect(read).rejects.toMatchObject({ status: 504 });
        // The socket is torn down, not left hanging on the server.
        await connectionClosed;
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    });

    /** A git host that answers 200 and then trickles bytes, never ending. */
    async function tricklingServer() {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, {
          'content-type': 'application/x-git-upload-pack-advertisement',
        });
        const timer = setInterval(() => res.write('0000'), 10);
        res.on('close', () => clearInterval(timer));
      });
      await new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', resolve),
      );
      const { port } = server.address() as AddressInfo;
      return {
        url: `http://127.0.0.1:${port}`,
        stop: async () => {
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
        },
      };
    }

    it('fails the next body read of an abort that came while no read was waiting', async () => {
      // The probe of review N1: the abort lands between two reads. The
      // client's own iterator drops that error, and the next read hung.
      const server = await tricklingServer();
      const controller = new AbortController();
      const reason = new GitFetchError(504, 'deadline');
      try {
        const response = await abortableHttp(controller.signal).request({
          url: `${server.url}/skills.git/info/refs?service=git-upload-pack`,
          method: 'GET',
          headers: {},
        });
        const body = response.body!;
        expect((await body.next()).done).toBe(false);

        // No read is waiting now.
        controller.abort(reason);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Whatever was queued before the abort, a read fails at once.
        await expect(body.next()).rejects.toBe(reason);
      } finally {
        await server.stop();
      }
    });

    it('removes the checkout of a real clone aborted while data keeps flowing', async () => {
      const server = await tricklingServer();
      const tmp = await mkdtemp(path.join(os.tmpdir(), 'clone-abort-test-'));
      // The clone's checkout lands in `tmp`, where the test can see it.
      const tmpdir = jest.spyOn(os, 'tmpdir').mockReturnValue(tmp);
      const controller = new AbortController();
      try {
        const read = discoverAgentSkillsFromGit({
          repoUrl: `${server.url}/skills.git`,
          signal: controller.signal,
        });
        while ((await readdir(tmp)).length === 0) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        await new Promise(resolve => setTimeout(resolve, 50));
        controller.abort(new GitFetchError(504, 'deadline'));

        await expect(read).rejects.toMatchObject({ status: 504 });
        for (let i = 0; i < 100 && (await readdir(tmp)).length > 0; i++) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(await readdir(tmp)).toEqual([]);
      } finally {
        tmpdir.mockRestore();
        await server.stop();
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('keeps the checkout of a clone that ignores the abort until it stops, then removes it', async () => {
      let cloneDir = '';
      let finish!: () => void;
      const clone = jest.fn(async (dir: string) => {
        cloneDir = dir;
        await new Promise<void>(resolve => {
          finish = resolve;
        });
        // Still writing after the caller gave up.
        await writeSkill(dir, 'late', '---\nname: late\n---\n');
        return { commit: HEAD, ref: 'main' };
      });
      const controller = new AbortController();

      const read = discoverAgentSkillsFromGit({
        repoUrl: 'https://git.example.com/team/skills',
        signal: controller.signal,
        gitClient: { clone },
      });
      while (!cloneDir) {
        await new Promise(resolve => setImmediate(resolve));
      }
      controller.abort(new GitFetchError(504, 'deadline'));
      await expect(read).rejects.toMatchObject({ status: 504 });
      expect(await exists(cloneDir)).toBe(true);

      finish();
      expect(await removedSoon(cloneDir)).toBe(true);
    });
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
