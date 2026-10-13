import { mockServices } from '@backstage/backend-test-utils';
import {
  branchCandidates,
  createSkillPullRequest,
  existingSkillName,
  isSkillDirectory,
  renderSkillMarkdown,
  SKILL_NAME_RE,
  updateBranchName,
} from './createSkillPullRequest';
import { GitHubApiError } from './discoverAgentSkills';
import { parseFrontmatter, splitSkillMarkdown } from './frontmatter';

type Handler = (init?: RequestInit) => {
  status: number;
  body?: unknown;
};

/** Routes `fetch` by `METHOD url`, recording every call's body. */
function mockGithub(handlers: Record<string, Handler>) {
  const calls: { key: string; body?: unknown }[] = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    const handler = handlers[key];
    if (!handler) {
      throw new Error(`Unexpected request: ${key}`);
    }
    calls.push({
      key,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const { status, body } = handler(init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const API = 'https://api.github.com/repos/giantswarm/skills';
/** The default branch's head in the create fixtures. */
const HEAD_A = 'a'.repeat(40);

const happyHandlers: Record<string, Handler> = {
  [`GET ${API}`]: () => ({
    status: 200,
    body: { default_branch: 'main', permissions: { push: true } },
  }),
  [`GET ${API}/contents/ticket-triage/SKILL.md?ref=${HEAD_A}`]: () => ({
    status: 404,
  }),
  [`GET ${API}/commits/main`]: () => ({
    status: 200,
    body: { sha: 'a'.repeat(40) },
  }),
  [`POST ${API}/git/refs`]: () => ({ status: 201, body: {} }),
  [`PUT ${API}/contents/ticket-triage/SKILL.md`]: () => ({
    status: 201,
    body: {},
  }),
  [`POST ${API}/pulls`]: () => ({
    status: 201,
    body: {
      html_url: 'https://github.com/giantswarm/skills/pull/42',
      number: 42,
    },
  }),
};

const input = {
  repoUrl: 'https://github.com/giantswarm/skills',
  skillName: 'ticket-triage',
  description: 'How to triage a ticket.',
  instructions: 'Classify, prioritise, route.',
  token: 'gh-token',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createSkillPullRequest', () => {
  it('creates the branch off the default branch head, puts the SKILL.md and opens the PR', async () => {
    const calls = mockGithub(happyHandlers);

    const result = await createSkillPullRequest(input);

    expect(result).toEqual({
      pullRequestUrl: 'https://github.com/giantswarm/skills/pull/42',
      number: 42,
      branch: 'add-skill/ticket-triage',
      base: 'main',
      path: 'ticket-triage/SKILL.md',
    });

    const ref = calls.find(call => call.key === `POST ${API}/git/refs`);
    expect(ref?.body).toEqual({
      ref: 'refs/heads/add-skill/ticket-triage',
      sha: 'a'.repeat(40),
    });

    const put = calls.find(
      call => call.key === `PUT ${API}/contents/ticket-triage/SKILL.md`,
    );
    const putBody = put?.body as {
      branch: string;
      content: string;
      message: string;
    };
    expect(putBody.branch).toBe('add-skill/ticket-triage');
    expect(putBody.message).toBe('feat: add skill ticket-triage');
    const written = Buffer.from(putBody.content, 'base64').toString('utf8');
    expect(parseFrontmatter(written)).toEqual({
      name: 'ticket-triage',
      description: 'How to triage a ticket.',
    });
    expect(written).toContain('Classify, prioritise, route.');

    const pr = calls.find(call => call.key === `POST ${API}/pulls`);
    expect(pr?.body).toMatchObject({
      title: 'feat: add skill ticket-triage',
      head: 'add-skill/ticket-triage',
      base: 'main',
    });

    // Every call carries the person's token: the PR is authored as them.
    for (const [, init] of (fetch as jest.Mock).mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer gh-token',
      });
    }
  });

  it('refuses in words when the person has no push access', async () => {
    mockGithub({
      [`GET ${API}`]: () => ({
        status: 200,
        body: { default_branch: 'main', permissions: { push: false } },
      }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      new GitHubApiError(
        403,
        "You don't have push access to giantswarm/skills, which opening the pull request needs (the branch is created as you).",
      ),
    );
  });

  it('refuses with 409 when the skill already exists on the default branch', async () => {
    mockGithub({
      ...happyHandlers,
      [`GET ${API}/contents/ticket-triage/SKILL.md?ref=${HEAD_A}`]: () => ({
        status: 200,
        body: {},
      }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      'A skill named ticket-triage already exists in giantswarm/skills.',
    );
  });

  it('refuses with 409, naming it, when the branch has an open pull request', async () => {
    const calls = mockGithub({
      ...happyHandlers,
      [`POST ${API}/git/refs`]: () => ({
        status: 422,
        body: { message: 'Reference already exists' },
      }),
      [`GET ${API}/pulls?head=giantswarm%3Aadd-skill%2Fticket-triage&state=open&per_page=1`]:
        () => ({
          status: 200,
          body: [{ html_url: 'https://github.com/giantswarm/skills/pull/7' }],
        }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      new GitHubApiError(
        409,
        'A pull request for this skill is already open from add-skill/ticket-triage: https://github.com/giantswarm/skills/pull/7.',
      ),
    );
    expect(
      calls.filter(call => call.key === `POST ${API}/git/refs`),
    ).toHaveLength(1);
    expect(calls.map(call => call.key)).not.toContain(
      `PUT ${API}/contents/ticket-triage/SKILL.md`,
    );
  });

  it("forwards GitHub's refusal with its status and message", async () => {
    mockGithub({
      [`GET ${API}`]: () => ({ status: 404, body: { message: 'Not Found' } }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      new GitHubApiError(
        404,
        'GitHub refused to read giantswarm/skills (404: Not Found).',
      ),
    );
  });
});

describe('createSkillPullRequest — update', () => {
  const markdown = (name: string) =>
    [
      '---',
      `name: ${name}`,
      'description: Old description.',
      'license: Apache-2.0',
      '---',
      '',
      'Old body.',
      '',
    ].join('\n');
  const existingMarkdown = markdown('ticket-triage');
  const FILE = 'plugins/support/ticket-triage/SKILL.md';
  const BRANCH = 'update-skill/plugins-support-ticket-triage';
  /** The default branch's head now. */
  const HEAD = 'b'.repeat(40);
  /** The commit the edit started from (an older one). */
  const START = 'c'.repeat(40);

  const fileAnswer =
    (content: string, sha = 'blob-sha-1'): Handler =>
    () => ({
      status: 200,
      body: {
        type: 'file',
        sha,
        encoding: 'base64',
        content: Buffer.from(content, 'utf8').toString('base64'),
      },
    });

  const updateHandlers: Record<string, Handler> = {
    [`GET ${API}`]: () => ({
      status: 200,
      body: { default_branch: 'main', permissions: { push: true } },
    }),
    [`GET ${API}/commits/main`]: () => ({
      status: 200,
      body: { sha: HEAD },
    }),
    // Unchanged between the start commit and the head: the same blob.
    [`GET ${API}/contents/${FILE}?ref=${HEAD}`]: fileAnswer(existingMarkdown),
    [`GET ${API}/contents/${FILE}?ref=${START}`]: fileAnswer(existingMarkdown),
    [`POST ${API}/git/refs`]: () => ({ status: 201, body: {} }),
    [`PUT ${API}/contents/${FILE}`]: () => ({ status: 200, body: {} }),
    [`POST ${API}/pulls`]: () => ({
      status: 201,
      body: {
        html_url: 'https://github.com/giantswarm/skills/pull/43',
        number: 43,
      },
    }),
  };

  const update = {
    ...input,
    description: 'New description.',
    instructions: 'New body.',
    kind: 'update' as const,
    path: 'plugins/support/ticket-triage',
    baseCommit: START,
  };

  it('rewrites the SKILL.md the edit started from, on a branch named after its directory', async () => {
    const calls = mockGithub(updateHandlers);

    const result = await createSkillPullRequest(update);

    expect(result).toEqual({
      pullRequestUrl: 'https://github.com/giantswarm/skills/pull/43',
      number: 43,
      branch: BRANCH,
      base: 'main',
      path: FILE,
    });
    expect(
      calls.find(call => call.key === `POST ${API}/git/refs`)?.body,
    ).toEqual({ ref: `refs/heads/${BRANCH}`, sha: HEAD });

    const put = calls.find(call => call.key === `PUT ${API}/contents/${FILE}`)
      ?.body as {
      branch: string;
      content: string;
      sha: string;
      message: string;
    };
    expect(put.branch).toBe(BRANCH);
    expect(put.sha).toBe('blob-sha-1');
    expect(put.message).toBe('fix: update skill ticket-triage');
    const written = Buffer.from(put.content, 'base64').toString('utf8');
    // The form's fields replace theirs; the keys the form does not show stay.
    expect(splitSkillMarkdown(written)).toEqual({
      frontmatter: {
        name: 'ticket-triage',
        description: 'New description.',
        license: 'Apache-2.0',
      },
      body: 'New body.\n',
    });

    expect(
      calls.find(call => call.key === `POST ${API}/pulls`)?.body,
    ).toMatchObject({
      title: 'fix: update skill ticket-triage',
      head: BRANCH,
      base: 'main',
      body: expect.stringContaining('starting from commit ccccccc'),
    });

    for (const [, init] of (fetch as jest.Mock).mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer gh-token',
      });
    }
  });

  it('refuses with 409, and creates no branch, when the skill changed since the edit started', async () => {
    const calls = mockGithub({
      ...updateHandlers,
      // Someone merged a change to the skill after the edit was opened.
      [`GET ${API}/contents/${FILE}?ref=${HEAD}`]: fileAnswer(
        markdown('ticket-triage').replace('Old body.', 'Their change.'),
        'blob-sha-2',
      ),
    });

    await expect(createSkillPullRequest(update)).rejects.toThrow(
      new GitHubApiError(
        409,
        `The skill changed since you started editing: ${FILE} on main is no longer the version of commit ccccccc. Reload the skill and make the edit on its current version.`,
      ),
    );
    expect(calls.map(call => call.key)).not.toContain(`POST ${API}/git/refs`);
    expect(calls.map(call => call.key)).not.toContain(
      `PUT ${API}/contents/${FILE}`,
    );
  });

  it('reads the file once when the edit started from the current head', async () => {
    const calls = mockGithub(updateHandlers);

    await createSkillPullRequest({ ...update, baseCommit: HEAD });

    expect(
      calls.filter(call => call.key.startsWith(`GET ${API}/contents/`)),
    ).toHaveLength(1);
  });

  it('writes the root SKILL.md for a skill at the repository root', async () => {
    const root: Record<string, Handler> = {};
    for (const [key, handler] of Object.entries(updateHandlers)) {
      root[key.replace(FILE, 'SKILL.md')] = handler;
    }
    mockGithub(root);

    const result = await createSkillPullRequest({ ...update, path: '' });

    expect(result.path).toBe('SKILL.md');
    // The repository's name stands in for the directory.
    expect(result.branch).toBe('update-skill/skills');
  });

  it('keeps a frontmatter name that is not a slug, branching off the directory', async () => {
    const named = markdown('Ticket Triage (v2)');
    const calls = mockGithub({
      ...updateHandlers,
      [`GET ${API}/contents/${FILE}?ref=${HEAD}`]: fileAnswer(named),
      [`GET ${API}/contents/${FILE}?ref=${START}`]: fileAnswer(named),
    });

    const result = await createSkillPullRequest({
      ...update,
      skillName: 'Ticket Triage (v2)',
    });

    expect(result.branch).toBe(BRANCH);
    const put = calls.find(call => call.key === `PUT ${API}/contents/${FILE}`)
      ?.body as { content: string };
    const written = Buffer.from(put.content, 'base64').toString('utf8');
    expect(parseFrontmatter(written)).toEqual({
      name: 'Ticket Triage (v2)',
      description: 'New description.',
    });
    expect(
      calls.find(call => call.key === `POST ${API}/pulls`)?.body,
    ).toMatchObject({ title: 'fix: update skill Ticket Triage (v2)' });
  });

  it('refuses with 422 a name that is neither a slug nor the existing one', async () => {
    const calls = mockGithub(updateHandlers);

    await expect(
      createSkillPullRequest({ ...update, skillName: 'Something Else' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(calls.map(call => call.key)).not.toContain(`POST ${API}/git/refs`);
  });

  it('refuses with 404 when the skill is gone from the default branch', async () => {
    mockGithub({
      ...updateHandlers,
      [`GET ${API}/contents/${FILE}?ref=${HEAD}`]: () => ({ status: 404 }),
    });

    await expect(createSkillPullRequest(update)).rejects.toThrow(
      new GitHubApiError(
        404,
        `There is no ${FILE} on main in giantswarm/skills any more — the skill may have been moved or removed since it was read.`,
      ),
    );
  });

  it('refuses with 422 when the edit changes nothing', async () => {
    mockGithub(updateHandlers);

    await expect(
      createSkillPullRequest({
        ...update,
        description: 'Old description.',
        instructions: 'Old body.',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetch).not.toHaveBeenCalledWith(
      `${API}/git/refs`,
      expect.anything(),
    );
  });

  const refExists = () => ({
    status: 422,
    body: { message: 'Reference already exists' },
  });
  const pullsOf = (branch: string) =>
    `GET ${API}/pulls?head=${encodeURIComponent(
      `giantswarm:${branch}`,
    )}&state=open&per_page=1`;
  const SUFFIXED = `${BRANCH}-bbbbbbb`;

  it('refuses with 409, naming it, when the branch has an open pull request', async () => {
    mockGithub({
      ...updateHandlers,
      [`POST ${API}/git/refs`]: refExists,
      [pullsOf(BRANCH)]: () => ({
        status: 200,
        body: [{ html_url: 'https://github.com/giantswarm/skills/pull/40' }],
      }),
    });

    await expect(createSkillPullRequest(update)).rejects.toThrow(
      new GitHubApiError(
        409,
        `A pull request for this skill is already open from ${BRANCH}: https://github.com/giantswarm/skills/pull/40.`,
      ),
    );
  });

  it('leaves a branch without an open pull request alone and pushes to one suffixed with the head', async () => {
    // update-skill/<dir> outlived its merged pull request.
    const calls = mockGithub({
      ...updateHandlers,
      [`POST ${API}/git/refs`]: init =>
        JSON.parse(String(init?.body)).ref === `refs/heads/${BRANCH}`
          ? refExists()
          : { status: 201, body: {} },
      [pullsOf(BRANCH)]: () => ({ status: 200, body: [] }),
    });

    const result = await createSkillPullRequest(update);

    expect(result.branch).toBe(SUFFIXED);
    expect(
      calls
        .filter(call => call.key === `POST ${API}/git/refs`)
        .map(call => call.body),
    ).toEqual([
      { ref: `refs/heads/${BRANCH}`, sha: HEAD },
      { ref: `refs/heads/${SUFFIXED}`, sha: HEAD },
    ]);
    expect(
      (
        calls.find(call => call.key === `PUT ${API}/contents/${FILE}`)
          ?.body as { branch: string }
      ).branch,
    ).toBe(SUFFIXED);
    expect(
      calls.find(call => call.key === `POST ${API}/pulls`)?.body,
    ).toMatchObject({ head: SUFFIXED });
    // Never force-updated, never deleted: it may hold someone's work.
    expect(calls.map(call => call.key)).not.toContain(
      `PATCH ${API}/git/refs/heads/${BRANCH}`,
    );
    expect(calls.map(call => call.key)).not.toContain(
      `DELETE ${API}/git/refs/heads/${BRANCH}`,
    );
  });

  it('refuses with 409 once every candidate branch is left over', async () => {
    const pulls: Record<string, Handler> = {};
    for (const branch of branchCandidates(BRANCH, HEAD)) {
      pulls[pullsOf(branch)] = () => ({ status: 200, body: [] });
    }
    mockGithub({
      ...updateHandlers,
      ...pulls,
      [`POST ${API}/git/refs`]: refExists,
    });

    await expect(createSkillPullRequest(update)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Delete the stale branches'),
    });
  });

  it('says a pull request may be open when GitHub cannot list them', async () => {
    mockGithub({
      ...updateHandlers,
      [`POST ${API}/git/refs`]: refExists,
      [pullsOf(BRANCH)]: () => ({ status: 403 }),
    });

    await expect(createSkillPullRequest(update)).rejects.toThrow(
      new GitHubApiError(
        409,
        `The branch ${BRANCH} already exists in giantswarm/skills, and a pull request for this skill may already be open.`,
      ),
    );
  });

  describe('when a step after the branch fails', () => {
    const DELETE_REF = `DELETE ${API}/git/refs/heads/${BRANCH}`;

    it.each([
      [
        'the write',
        {
          [`PUT ${API}/contents/${FILE}`]: () => ({
            status: 409,
            body: { message: 'sha does not match' },
          }),
        },
        409,
      ],
      [
        'the pull request',
        {
          [`POST ${API}/pulls`]: () => ({
            status: 502,
            body: { message: 'Server Error' },
          }),
        },
        502,
      ],
    ])(
      'deletes the branch it created when %s fails, and forwards the failure',
      async (_, failing, status) => {
        const calls = mockGithub({
          ...updateHandlers,
          ...failing,
          [DELETE_REF]: () => ({ status: 204 }),
        });

        await expect(createSkillPullRequest(update)).rejects.toMatchObject({
          status,
        });
        expect(calls.map(call => call.key)).toContain(DELETE_REF);
      },
    );

    it('still forwards the failure when the cleanup fails, logging it at debug', async () => {
      const logger = mockServices.logger.mock();
      mockGithub({
        ...updateHandlers,
        [`POST ${API}/pulls`]: () => ({ status: 403 }),
        [DELETE_REF]: () => ({ status: 403 }),
      });

      await expect(
        createSkillPullRequest({ ...update, logger }),
      ).rejects.toMatchObject({ status: 403 });
      expect(logger.debug).toHaveBeenCalledWith(
        'Could not delete the branch of a failed skill edit',
        expect.objectContaining({ branch: BRANCH, status: 403 }),
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not delete a branch it did not create', async () => {
      const calls = mockGithub({
        ...updateHandlers,
        [`POST ${API}/git/refs`]: () => ({ status: 403 }),
      });

      await expect(createSkillPullRequest(update)).rejects.toMatchObject({
        status: 403,
      });
      expect(calls.map(call => call.key)).not.toContain(DELETE_REF);
    });
  });
});

describe('existingSkillName', () => {
  it('follows discovery: frontmatter name, else directory, else repository', () => {
    expect(existingSkillName({ name: ' Notes ' }, 'a/notes', 'skills')).toBe(
      'Notes',
    );
    expect(existingSkillName({}, 'a/My_Notes', 'skills')).toBe('My_Notes');
    expect(existingSkillName({ name: 3 }, '', 'skills')).toBe('skills');
  });
});

describe('updateBranchName', () => {
  it.each([
    ['ticket-triage', 'update-skill/ticket-triage'],
    [
      'plugins/gs-base/skills/registries',
      'update-skill/plugins-gs-base-skills-registries',
    ],
    ['My_Skill.v2', 'update-skill/my-skill-v2'],
    ['', 'update-skill/skills'],
    ['___', 'update-skill/skill'],
  ])('%p → %p', (dir, branch) =>
    expect(updateBranchName(dir, 'skills')).toBe(branch),
  );
});

describe('isSkillDirectory', () => {
  // Discovery's syntax rule: whatever directory a listed skill has opens.
  it.each([
    '',
    'ticket-triage',
    'plugins/gs-base/skills/registries',
    'a.b_c',
    'ops/Incident Review',
    'skills/über',
  ])('accepts %p', path => expect(isSkillDirectory(path)).toBe(true));
  it.each([
    '/abs',
    'trail/',
    'a//b',
    '..',
    'a/../b',
    './a',
    'a\\b',
    'a\nb',
    'a\u0000b',
  ])('refuses %p', path => expect(isSkillDirectory(path)).toBe(false));
});

describe('branchCandidates', () => {
  it('tries the skill’s branch, then suffixes with the short head, then numbers', () => {
    expect(
      branchCandidates('update-skill/notes', 'abcdef0'.padEnd(40, '1')),
    ).toEqual([
      'update-skill/notes',
      'update-skill/notes-abcdef0',
      'update-skill/notes-abcdef0-2',
      'update-skill/notes-abcdef0-3',
    ]);
  });
});

describe('renderSkillMarkdown', () => {
  it('writes frontmatter that survives a description with YAML punctuation', () => {
    const written = renderSkillMarkdown({
      skillName: 'notes',
      description: 'Sort: "tickets" — #fast',
      instructions: 'Body',
    });
    expect(parseFrontmatter(written)).toEqual({
      name: 'notes',
      description: 'Sort: "tickets" — #fast',
    });
  });
});

describe('SKILL_NAME_RE', () => {
  it.each(['ticket-triage', 'a', 'a1-b2'])('accepts %s', name =>
    expect(SKILL_NAME_RE.test(name)).toBe(true),
  );
  it.each(['Ticket', '-lead', 'trail-', 'a/b', 'a..b', '', 'x'.repeat(64)])(
    'refuses %s',
    name => expect(SKILL_NAME_RE.test(name)).toBe(false),
  );
});
