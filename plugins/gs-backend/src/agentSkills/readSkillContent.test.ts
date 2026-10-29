import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GithubCredentialsProvider } from '@backstage/integration';
import { GitHubApiError } from './discoverAgentSkills';
import { GitClient, GitFetchError } from './discoverAgentSkillsFromGit';
import {
  readSkillContentFromGit,
  readSkillContentFromGitHub,
} from './readSkillContent';

const COMMIT = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

const SKILL_MD = [
  '---',
  'name: ticket-triage',
  'description: How to triage a ticket.',
  'license: Apache-2.0',
  '---',
  '',
  'Classify, prioritise, route.',
  '',
].join('\n');

describe('readSkillContentFromGitHub', () => {
  const credentials = {
    getCredentials: jest.fn(async () => ({ token: 'integration-token' })),
  } as unknown as GithubCredentialsProvider;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the SKILL.md at the commit with the integration token and splits it', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => SKILL_MD,
    })) as unknown as typeof fetch;

    const content = await readSkillContentFromGitHub({
      repoUrl: 'https://github.com/giantswarm/skills.git',
      path: 'support/ticket-triage',
      commit: COMMIT,
      githubCredentialsProvider: credentials,
    });

    expect(content).toEqual({
      repoUrl: 'https://github.com/giantswarm/skills',
      path: 'support/ticket-triage',
      commit: COMMIT,
      name: 'ticket-triage',
      description: 'How to triage a ticket.',
      instructions: 'Classify, prioritise, route.',
    });
    const [url, init] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      `https://api.github.com/repos/giantswarm/skills/contents/support/ticket-triage/SKILL.md?ref=${COMMIT}`,
    );
    expect(init.headers.Authorization).toBe('Bearer integration-token');
  });

  it('throws the upstream status when the file is missing', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    })) as unknown as typeof fetch;

    await expect(
      readSkillContentFromGitHub({
        repoUrl: 'https://github.com/giantswarm/skills',
        path: '',
        commit: COMMIT,
        githubCredentialsProvider: credentials,
      }),
    ).rejects.toBeInstanceOf(GitHubApiError);
  });
});

describe('readSkillContentFromGit', () => {
  const REPO = 'http://gitserver.agent-platform.svc.cluster.local/skills.git';
  let outside: string;

  beforeEach(async () => {
    outside = await mkdtemp(path.join(os.tmpdir(), 'skill-content-outside-'));
  });

  afterEach(async () => {
    await rm(outside, { recursive: true, force: true });
  });

  /** A clone that writes the given files into the checkout. */
  function fakeClone(
    files: Record<string, string>,
    result = { commit: COMMIT, ref: 'main' },
    extra?: (dir: string) => Promise<void>,
  ): GitClient {
    return {
      async clone(dir) {
        for (const [file, content] of Object.entries(files)) {
          await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
          await writeFile(path.join(dir, file), content, 'utf8');
        }
        await extra?.(dir);
        return result;
      },
    };
  }

  it('reads the SKILL.md from the checkout of the commit', async () => {
    const content = await readSkillContentFromGit({
      repoUrl: `${REPO}/`,
      path: 'support/ticket-triage',
      commit: COMMIT,
      gitClient: fakeClone({ 'support/ticket-triage/SKILL.md': SKILL_MD }),
    });

    expect(content).toEqual({
      repoUrl: REPO,
      path: 'support/ticket-triage',
      commit: COMMIT,
      name: 'ticket-triage',
      description: 'How to triage a ticket.',
      instructions: 'Classify, prioritise, route.',
    });
  });

  it('falls back to the directory name without frontmatter', async () => {
    const content = await readSkillContentFromGit({
      repoUrl: REPO,
      path: 'notes',
      commit: COMMIT,
      gitClient: fakeClone({ 'notes/SKILL.md': 'Just a body.' }),
    });

    expect(content).toMatchObject({
      name: 'notes',
      description: '',
      instructions: 'Just a body.',
    });
  });

  it('answers 409 when the branch moved on from the commit asked for', async () => {
    const promise = readSkillContentFromGit({
      repoUrl: REPO,
      path: 'notes',
      commit: COMMIT,
      gitClient: fakeClone(
        { 'notes/SKILL.md': SKILL_MD },
        { commit: 'f'.repeat(40), ref: 'main' },
      ),
    });

    await expect(promise).rejects.toBeInstanceOf(GitFetchError);
    await expect(promise).rejects.toMatchObject({ status: 409 });
  });

  it('answers 404 for a missing file', async () => {
    await expect(
      readSkillContentFromGit({
        repoUrl: REPO,
        path: 'gone',
        commit: COMMIT,
        gitClient: fakeClone({}),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does not follow a symlink out of the checkout', async () => {
    await writeFile(path.join(outside, 'SKILL.md'), 'secret', 'utf8');

    await expect(
      readSkillContentFromGit({
        repoUrl: REPO,
        path: 'escape',
        commit: COMMIT,
        gitClient: fakeClone({}, undefined, async dir => {
          await symlink(outside, path.join(dir, 'escape'));
        }),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
