import {
  HttpAuthService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { fetchGitHubRawContent } from './githubRawContent';
import {
  discoverAgentSkills,
  GitHubApiError,
  parseRepoUrl,
} from './agentSkills/discoverAgentSkills';
import {
  discoverAgentSkillsFromGit,
  GitFetchError,
} from './agentSkills/discoverAgentSkillsFromGit';
import {
  createSkillPullRequest,
  GITHUB_TOKEN_HEADER,
  SKILL_NAME_RE,
} from './agentSkills/createSkillPullRequest';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { mimirServiceRef } from './services/MimirService';
import { readSignedInConfig } from './signedInConfig';
import { SUBJECT_TOKEN_HEADER } from '@giantswarm/backstage-plugin-gs-common';
import { ManagementClusterVersionsService } from './services/ManagementClusterVersions';

export async function createRouter({
  config,
  containerRegistry,
  mimir,
  githubCredentialsProvider,
  httpAuth,
  managementClusterVersions,
}: {
  config: RootConfigService;
  containerRegistry: typeof containerRegistryServiceRef.T;
  mimir: typeof mimirServiceRef.T;
  githubCredentialsProvider: GithubCredentialsProvider;
  httpAuth: HttpAuthService;
  managementClusterVersions: ManagementClusterVersionsService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  /**
   * GET /config
   *
   * The configuration the signed-in frontend reads: the paths listed in
   * `SIGNED_IN_CONFIG_PATHS`, in app-config shape. The unauthenticated
   * `index.html` carries only what the sign-in page needs, so everything else
   * a Giant Swarm plugin reads in the browser -- the installations map (with
   * the customer-identifying base domains), admin groups, link templates, the
   * muster and MCP server lists -- comes from this route once, after the main
   * sign-in. Authenticated by default in the new backend system.
   */
  router.get('/config', async (_req, res) => {
    res.json(readSignedInConfig(config));
  });

  /**
   * GET /installations/versions
   *
   * Every management cluster's Kubernetes version and Giant Swarm release,
   * read as the signed-in person in one request: the Installations page's
   * version columns. The person's main Dex ID token travels in the
   * `gs-subject-token` header; each installation's answer is a version, an
   * absent value with the reason, or the short reason it failed. The
   * installations only the browser can read as the person are listed apart
   * (`readInBrowser`).
   */
  router.get('/installations/versions', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const subjectToken = req.header(SUBJECT_TOKEN_HEADER);
    if (!subjectToken) {
      throw new InputError(`Missing ${SUBJECT_TOKEN_HEADER} header`);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(await managementClusterVersions.read(credentials, subjectToken));
  });

  /**
   * GET /container-registry/tags
   *
   * Fetches tags from a container registry for a given repository.
   *
   * Query parameters:
   * - registry: The container registry (e.g., ghcr.io)
   * - repository: The repository path (e.g., giantswarm/my-app)
   *
   * Returns:
   * - tags: Array of version tags sorted by semver (newest first)
   * - latestStableVersion: The most recent non-prerelease version
   */
  router.get('/container-registry/tags', async (req, res) => {
    const schema = z.object({
      registry: z.string(),
      repository: z.string(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { registry, repository } = parsed.data;

    res.json(await containerRegistry.getTags(registry, repository));
  });

  /**
   * GET /container-registry/tag-manifest
   *
   * Fetches the manifest for a specific tag from a container registry.
   *
   * Query parameters:
   * - registry: The container registry (e.g., ghcr.io)
   * - repository: The repository path (e.g., giantswarm/my-app)
   * - tag: The tag to fetch the manifest for (e.g., 1.0.0)
   *
   * Returns:
   * - The raw manifest content
   */
  router.get('/container-registry/tag-manifest', async (req, res) => {
    const schema = z.object({
      registry: z.string(),
      repository: z.string(),
      tag: z.string(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { registry, repository, tag } = parsed.data;

    res.json(await containerRegistry.getTagManifest(registry, repository, tag));
  });

  /**
   * GET /mimir/query
   *
   * Proxies an instant PromQL query to the Mimir observability endpoint
   * for the given installation.
   *
   * Query parameters:
   * - query: PromQL expression
   * - installationName: GS installation name
   *
   * Headers:
   * - X-Mimir-Token: OIDC token for the installation (required)
   */
  router.get('/mimir/query', async (req, res) => {
    const schema = z.object({
      query: z.string().min(1),
      installationName: z.string().min(1),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const oidcToken = req.headers['x-mimir-token'];
    if (!oidcToken || typeof oidcToken !== 'string') {
      throw new InputError('Missing required header: X-Mimir-Token');
    }

    const { query, installationName } = parsed.data;

    res.json(await mimir.query({ query, installationName, oidcToken }));
  });

  /**
   * GET /mimir/query_range
   *
   * Proxies a range PromQL query to the Mimir observability endpoint for the
   * given installation, for a series over time rather than one value.
   *
   * Query parameters:
   * - query: PromQL expression
   * - installationName: GS installation name
   * - start, end: Unix seconds
   * - step: resolution, a Prometheus duration (`1d`) or seconds
   *
   * Headers:
   * - X-Mimir-Token: OIDC token for the installation (required)
   */
  router.get('/mimir/query_range', async (req, res) => {
    const schema = z.object({
      query: z.string().min(1),
      installationName: z.string().min(1),
      // Validated as non-empty strings and passed through verbatim: Mimir owns
      // what a legal timestamp and step are, and duplicating its grammar here
      // would only reject ranges it accepts.
      start: z.string().min(1),
      end: z.string().min(1),
      step: z.string().min(1),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const oidcToken = req.headers['x-mimir-token'];
    if (!oidcToken || typeof oidcToken !== 'string') {
      throw new InputError('Missing required header: X-Mimir-Token');
    }

    const { query, installationName, start, end, step } = parsed.data;

    res.json(
      await mimir.queryRange({
        query,
        installationName,
        start,
        end,
        step,
        oidcToken,
      }),
    );
  });

  /**
   * GET /github/raw-content
   *
   * Proxies a fetch to a raw.githubusercontent.com URL, adding GitHub
   * authentication for private repository access.
   *
   * Query parameters:
   * - url: The raw.githubusercontent.com URL to fetch
   *
   * Returns:
   * - The raw content as text
   */
  router.get('/github/raw-content', async (req, res) => {
    const schema = z.object({
      url: z
        .string()
        .url()
        .refine(u => u.startsWith('https://raw.githubusercontent.com/'), {
          message: 'Only raw.githubusercontent.com URLs are allowed',
        }),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { url } = parsed.data;

    const response = await fetchGitHubRawContent(
      url,
      githubCredentialsProvider,
    );
    if (!response.ok) {
      res.status(response.status).json({
        error: { message: `Failed to fetch content: HTTP ${response.status}` },
      });
      return;
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain';
    res.setHeader('Content-Type', contentType);
    const body = await response.text();
    res.send(body);
  });

  /**
   * GET /agent-skills
   *
   * Discovers agent skills in a git repository by finding every `SKILL.md`
   * file and reading its `name`/`description` frontmatter, at the head commit
   * of the ref. Each skill maps to a chart `skills[]` entry pinned to that
   * commit (`{ name, path, git: { url, commit } }`).
   *
   * Two providers, chosen by the repository's host:
   * - github.com URLs go through the GitHub REST API (no clone; subject to
   *   GitHub's API rate limit — 60/h unauthenticated — with precise wording
   *   when it bites). Any github.com repository may be asked for.
   * - Every other http(s) URL is read over the plain git protocol (a depth-1
   *   clone, no REST API and no API rate limit) — a Gitea in a lab cluster,
   *   any git host. To keep the backend from cloning arbitrary URLs a caller
   *   names (it can reach cluster-internal hosts), a non-GitHub URL must be
   *   one of the configured `agentPlatform.skills.repositories`.
   *
   * Query parameters:
   * - repoUrl: The repository URL (https://github.com/<owner>/<repo>, or a
   *   configured http(s) git URL)
   * - ref: Optional git ref (branch; for GitHub also a tag/SHA); defaults to
   *   the default branch
   *
   * Returns:
   * - skills: Array of { name, description, repoUrl, path, ref, commit }
   * - ref, commit: the ref read and the commit it resolved to
   * - truncated: true when some skills may be missing (repo too large / a read
   *   failed)
   */
  router.get('/agent-skills', async (req, res) => {
    const schema = z.object({
      repoUrl: z
        .string()
        .url()
        .refine(u => /^https?:\/\//.test(u), {
          message: 'Only http(s) repository URLs are allowed',
        }),
      ref: z.string().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { repoUrl, ref } = parsed.data;
    const isGitHub = repoUrl.toLowerCase().startsWith('https://github.com/');

    if (!isGitHub) {
      // Only the configured sources: the generic provider clones whatever URL
      // it is handed, and this backend can reach hosts the browser cannot.
      const repositories =
        config.getOptionalStringArray('agentPlatform.skills.repositories') ??
        [];
      const normalize = (url: string) =>
        url
          .trim()
          .replace(/\/+$/, '')
          .replace(/\.git$/i, '')
          .toLowerCase();
      const target = normalize(repoUrl);
      if (!repositories.some(url => normalize(url) === target)) {
        throw new InputError(
          `${repoUrl} is not one of the configured skill repositories; only github.com repositories can be discovered ad hoc`,
        );
      }
    }

    try {
      const result = isGitHub
        ? await discoverAgentSkills({
            repoUrl,
            ref,
            githubCredentialsProvider,
          })
        : await discoverAgentSkillsFromGit({ repoUrl, ref });
      res.json(result);
    } catch (error) {
      // Forward the upstream status (repo not found → 404, rate limit →
      // 403/429, unreachable git host → 502) rather than letting it surface
      // as a 500 (which the sibling /github/raw-content route also avoids,
      // keeping Sentry quiet for these expected outcomes).
      if (error instanceof GitHubApiError || error instanceof GitFetchError) {
        res.status(error.status).json({
          error: { message: `Failed to discover skills: ${error.message}` },
        });
        return;
      }
      throw error;
    }
  });

  /**
   * POST /agent-skills/pull-request
   *
   * Opens a pull request that adds a new skill (`<skillName>/SKILL.md`) to one
   * of the configured skill repositories, authored **as the signed-in person**:
   * their GitHub access token — minted by the frontend through
   * `githubAuthApiRef`, i.e. their own GitHub grant in muster — travels in the
   * `gs-github-token` header, and every GitHub call runs with it. Nothing is
   * applied anywhere: the skill joins the catalog once a teammate merges the
   * pull request and discovery re-reads the repository's head.
   *
   * Body:
   * - repoUrl: one of `agentPlatform.skills.repositories` (compared
   *   case-insensitively, tolerating `.git` and a trailing slash)
   * - skillName: the skill's directory and frontmatter name (lowercase slug)
   * - description: frontmatter `description`
   * - instructions: the SKILL.md body
   *
   * Returns { pullRequestUrl, number, branch, base, path }. A person without
   * the header gets 401 (the frontend connects GitHub through muster first);
   * GitHub's refusals — no push access, the skill or branch already existing,
   * rate limits — are forwarded with their upstream status, not turned into
   * 500s.
   */
  router.post('/agent-skills/pull-request', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });

    const token = req.header(GITHUB_TOKEN_HEADER);
    if (!token) {
      res.status(401).json({
        error: {
          message: `Missing ${GITHUB_TOKEN_HEADER} header: the pull request is opened as the signed-in person, with their own GitHub grant. Connect GitHub and try again.`,
        },
      });
      return;
    }

    const schema = z.object({
      repoUrl: z
        .string()
        .url()
        .refine(u => u.startsWith('https://github.com/'), {
          message: 'Only github.com repository URLs are allowed',
        }),
      skillName: z.string().regex(SKILL_NAME_RE, {
        message:
          'skillName must be a lowercase slug (letters, digits and dashes, up to 63 characters)',
      }),
      description: z.string().trim().min(1).max(1024),
      instructions: z.string().trim().min(1).max(100_000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const { repoUrl, skillName, description, instructions } = parsed.data;

    // Only the configured sources: the catalog lists these and nothing else,
    // so a pull request anywhere else would add a skill no one can see.
    const repositories =
      config.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];
    const slugOf = (url: string) => {
      const { owner, repo } = parseRepoUrl(url.trim().replace(/\/+$/, ''));
      return `${owner}/${repo}`.toLowerCase();
    };
    const target = slugOf(repoUrl);
    const configured = repositories.some(url => {
      try {
        return slugOf(url) === target;
      } catch {
        return false;
      }
    });
    if (!configured) {
      throw new InputError(
        `${repoUrl} is not one of the configured skill repositories`,
      );
    }

    try {
      res.json(
        await createSkillPullRequest({
          repoUrl,
          skillName,
          description,
          instructions,
          token,
        }),
      );
    } catch (error) {
      // Expected outcomes keep their upstream status (409 skill exists, 403 no
      // push access or rate limit, 404 no read access), like the discovery
      // route above — not 500s, keeping Sentry quiet.
      if (error instanceof GitHubApiError) {
        res.status(error.status).json({
          error: {
            message: `Failed to open the pull request: ${error.message}`,
          },
        });
        return;
      }
      throw error;
    }
  });

  return router;
}
