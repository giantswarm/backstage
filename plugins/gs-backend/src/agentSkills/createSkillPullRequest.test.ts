import {
  createSkillPullRequest,
  renderSkillMarkdown,
  SKILL_NAME_RE,
} from './createSkillPullRequest';
import { GitHubApiError } from './discoverAgentSkills';
import { parseFrontmatter } from './frontmatter';

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

const happyHandlers: Record<string, Handler> = {
  [`GET ${API}`]: () => ({
    status: 200,
    body: { default_branch: 'main', permissions: { push: true } },
  }),
  [`GET ${API}/contents/ticket-triage/SKILL.md?ref=main`]: () => ({
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
    const putBody = put?.body as { branch: string; content: string };
    expect(putBody.branch).toBe('add-skill/ticket-triage');
    const written = Buffer.from(putBody.content, 'base64').toString('utf8');
    expect(parseFrontmatter(written)).toEqual({
      name: 'ticket-triage',
      description: 'How to triage a ticket.',
    });
    expect(written).toContain('Classify, prioritise, route.');

    const pr = calls.find(call => call.key === `POST ${API}/pulls`);
    expect(pr?.body).toMatchObject({
      title: 'Add skill: ticket-triage',
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
      [`GET ${API}/contents/ticket-triage/SKILL.md?ref=main`]: () => ({
        status: 200,
        body: {},
      }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      'A skill named ticket-triage already exists in giantswarm/skills.',
    );
  });

  it('refuses with 409 when the branch already exists (an open PR)', async () => {
    mockGithub({
      ...happyHandlers,
      [`POST ${API}/git/refs`]: () => ({
        status: 422,
        body: { message: 'Reference already exists' },
      }),
    });

    await expect(createSkillPullRequest(input)).rejects.toThrow(
      'The branch add-skill/ticket-triage already exists in giantswarm/skills — a pull request for this skill may already be open.',
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
