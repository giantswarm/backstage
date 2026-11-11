import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { AuthenticationError, InputError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import {
  DEFAULT_ALLOWED_OWNERS,
  fetchGitHubRawContent,
} from './githubRawContent';
import {
  discoverAgentSkills,
  GitHubApiError,
  SkillDiscoverySnapshot,
} from './agentSkills/discoverAgentSkills';
import {
  discoverAgentSkillsFromGit,
  GitFetchError,
} from './agentSkills/discoverAgentSkillsFromGit';
import {
  createSkillPullRequest,
  GITHUB_TOKEN_HEADER,
  isSkillDirectory,
  MAX_SKILL_DISPLAY_NAME,
  MAX_SKILL_INSTRUCTIONS,
  SKILL_NAME_RE,
  SKILL_PULL_REQUEST_BODY_LIMIT,
} from './agentSkills/createSkillPullRequest';
import {
  listSkillFilesFromGitHub,
  readSkillContentFromGitHub,
  readSkillFileFromGitHub,
  SkillContent,
  skillContentFromRaw,
} from './agentSkills/readSkillContent';
import {
  repositoryKey,
  SkillDiscoveryCache,
} from './agentSkills/skillDiscoveryCache';
import { UpstreamReadGuard } from './agentSkills/upstreamReadGuard';
import {
  pullRequestBase,
  skillRepositoriesByKey,
  SkillRepository,
} from './agentSkills/skillRepositories';
import {
  COMMIT_ID_RE,
  isBelowPath,
  isSkillFilePath,
  MAX_INLINE_FILE_BYTES,
  needsFileBytes,
  repositoryFilePath,
  SkillFileList,
  skillFileContent,
} from './agentSkills/skillFiles';
import {
  containerRegistryServiceRef,
  MUSTER_AUTH_HEADER,
  MusterServerNotConnectedError,
  mimirServiceRef,
  reportedErrorHandler,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  requireWritableSource,
  skillSourcesReader,
  type SkillSource,
} from './agentSkills/skillManagerSources';
import { readSignedInConfig } from './signedInConfig';
import {
  isValidTag,
  MAX_TAG_LENGTH,
  shortSha,
  SUBJECT_TOKEN_HEADER,
} from '@giantswarm/backstage-plugin-gs-common';
import { ManagementClusterVersionsService } from './services/ManagementClusterVersions';

export async function createRouter({
  config,
  containerRegistry,
  mimir,
  githubCredentialsProvider,
  httpAuth,
  managementClusterVersions,
  logger,
}: {
  config: RootConfigService;
  containerRegistry: typeof containerRegistryServiceRef.T;
  mimir: typeof mimirServiceRef.T;
  githubCredentialsProvider: GithubCredentialsProvider;
  httpAuth: HttpAuthService;
  managementClusterVersions: ManagementClusterVersionsService;
  logger?: LoggerService;
}): Promise<express.Router> {
  const router = Router();
  const readSkillSources = logger
    ? skillSourcesReader(config, logger)
    : undefined;
  const isGitHubUrl = (repoUrl: string): boolean =>
    repoUrl.toLowerCase().startsWith('https://github.com/');
  // The skill pull request carries a whole SKILL.md (up to
  // MAX_SKILL_INSTRUCTIONS characters), more than the 100 KB default allows.
  // Registered first: the general parser below skips a body already read.
  router.use(
    '/agent-skills/pull-request',
    express.json({ limit: SKILL_PULL_REQUEST_BODY_LIMIT }),
  );
  router.use(express.json());

  // The skill listings this instance read, per repository and ref (see
  // SkillDiscoveryCache): page views answer from memory, not from GitHub.
  const skillDiscoveryCache = new SkillDiscoveryCache({ logger });
  // Every skill read upstream on a cache miss: misses remembered, concurrent
  // reads shared and capped (security audit 1, M2).
  const upstreamReads = new UpstreamReadGuard();
  /**
   * The entries of `agentPlatform.skills.repositories`, parsed once (and the
   * ones left out logged once), by `repositoryKey`. The skill routes act only
   * on these, looked up the way the caches key a caller-named URL
   * (case-insensitive, tolerating `.git` and trailing slashes), and read the
   * configured URL rather than the caller's spelling of it: this backend can
   * reach hosts the browser cannot, and reads with the portal's own GitHub
   * token. An entry may be a plain URL or `{ url, ref, path, readOnly }` (see
   * `readSkillRepositories`).
   */
  const skillRepositories = skillRepositoriesByKey(config, logger);
  const configuredSkillRepository = (
    repoUrl: string,
  ): SkillRepository | undefined =>
    skillRepositories.get(repositoryKey(repoUrl));

  /** The 404 for a skill outside the configured `path` of its repository. */
  const outsideScanPath = (repository: SkillRepository, path: string) =>
    new GitFetchError(
      404,
      `${path || 'The root'} is not below ${repository.path} in ${repository.url}.`,
    );

  /** The 400 for a repository that is not a configured skill source. */
  const notConfigured = (repoUrl: string) =>
    new InputError(
      `${repoUrl} is not one of the configured skill repositories`,
    );

  /**
   * An optional git ref. Empty (`?ref=`) means the default branch, exactly
   * as absent does, so it is normalized to absent: it must neither key a
   * cache entry of its own nor reach a provider as ''.
   */
  const optionalRef = z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform(ref => ref || undefined);

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
   * authentication for private repository access — but only when the
   * repository owner is listed in `gs.githubRawContent.allowedOwners`
   * (default: giantswarm). The URL is caller-supplied and the portal's
   * GitHub App can read repositories the signed-in user cannot, so for
   * any other owner the fetch goes out without credentials and only
   * public content comes back (security audit 1, I-R3).
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

    const allowedOwners =
      config.getOptionalStringArray('gs.githubRawContent.allowedOwners') ??
      DEFAULT_ALLOWED_OWNERS;

    const response = await fetchGitHubRawContent(
      url,
      githubCredentialsProvider,
      allowedOwners,
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
   * Answered from an in-memory cache per repository and ref
   * (`SkillDiscoveryCache`): fresh for 10 minutes, revalidated cheaply when
   * the ref has not moved, and served stale (`stale: true`) when GitHub
   * refuses with a rate limit or upstream is down — a listing never surfaces
   * a rate limit while there is one to show. Discovery reads with the
   * portal's own credentials, never a person's, so the cache is shared.
   *
   * Only the configured `agentPlatform.skills.repositories` (400 otherwise),
   * for both providers: the backend reads with the portal's own GitHub token
   * (which can read private repositories) and can reach cluster-internal
   * hosts, and the portal only ever lists the configured sources. That also
   * keeps the cache to configured repositories (security audit 1, L2).
   *
   * Two providers, chosen by the repository's host:
   * - github.com URLs go through the GitHub REST API (no clone; subject to
   *   GitHub's API rate limit — 60/h unauthenticated — with precise wording
   *   when it bites).
   * - Every other http(s) URL is read over the plain git protocol (a depth-1
   *   clone, no REST API and no API rate limit) — a Gitea in a lab cluster,
   *   any git host.
   *
   * Query parameters:
   * - repoUrl: one of the configured skill repositories
   * - ref: Optional git ref (branch; for GitHub also a tag/SHA); defaults to
   *   the default branch (also when empty)
   *
   * Returns:
   * - skills: Array of { name, description, repoUrl, path, ref, commit,
   *   contentReadable } — `contentReadable` is false for a skill whose
   *   SKILL.md the portal could not read (listed from the tree, with the
   *   metadata at hand; the portal cannot show or edit it)
   * - ref, commit: the ref read and the commit it resolved to; refKind:
   *   branch, tag or commit, for a configured ref
   * - proposable: whether the pull-request route takes a skill into this
   *   source; path: the directory scanned ('' = the whole repository)
   * - truncated: true when some skills may be missing (repo too large)
   * - readAt: when the listing was read upstream (ISO time)
   * - stale: true when an older listing is served because upstream failed
   */
  router.get('/agent-skills', async (req, res) => {
    const schema = z.object({
      repoUrl: z
        .string()
        .url()
        .refine(u => /^https?:\/\//.test(u), {
          message: 'Only http(s) repository URLs are allowed',
        }),
      ref: optionalRef,
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const repository = configuredSkillRepository(parsed.data.repoUrl);
    if (!repository) {
      throw notConfigured(parsed.data.repoUrl);
    }
    const { url: repoUrl, path: scanPath, readOnly } = repository;
    const ref = parsed.data.ref ?? repository.ref;
    const isGitHub = isGitHubUrl(repoUrl);

    try {
      const { result, readAt, stale } = await skillDiscoveryCache.discover(
        repoUrl,
        ref,
        previous =>
          upstreamReads.limit(isGitHub ? 'github' : 'clone', signal =>
            isGitHub
              ? discoverAgentSkills({
                  repoUrl,
                  ref,
                  ...(scanPath ? { scanPath } : {}),
                  githubCredentialsProvider,
                  previous,
                  logger,
                  signal,
                })
              : discoverAgentSkillsFromGit({
                  repoUrl,
                  ref,
                  ...(scanPath ? { scanPath } : {}),
                  signal,
                }),
          ),
        scanPath,
      );
      // Whether Add skill can target this source: the rules the pull-request
      // route enforces, said here so the portal does not repeat them. Only
      // for the configured ref; a caller's own `ref` takes no pull requests.
      const proposable =
        !readOnly &&
        isGitHub &&
        ref === repository.ref &&
        (result.refKind ?? 'branch') === 'branch' &&
        pullRequestBase(repository) !== null;
      res.json({
        ...result,
        proposable,
        path: scanPath,
        // A read-only source lists its skills; the portal proposes no
        // changes to them (the pull-request route refuses).
        ...(readOnly
          ? {
              skills: result.skills.map(skill => ({ ...skill, readOnly })),
              readOnly,
            }
          : {}),
        readAt: new Date(readAt).toISOString(),
        stale,
      });
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

  /** The query both content routes take: a skill at a commit. */
  const skillAtCommitQuery = z.object({
    repoUrl: z
      .string()
      .url()
      .refine(u => /^https?:\/\//.test(u), {
        message: 'Only http(s) repository URLs are allowed',
      }),
    // Discovery's syntax rule, not the create slug: every listed skill
    // (`ops/Incident Review`, `skills/über`) must open.
    path: z.string().default('').refine(isSkillDirectory, {
      message: 'path must be a relative skill directory',
    }),
    commit: z.string().regex(COMMIT_ID_RE, {
      message: 'commit must be a full commit id',
    }),
    ref: optionalRef,
  });

  /**
   * A generic-git repository read at `commit` outside a listing: one depth-1
   * clone whose head must still be `commit` (a 409 otherwise), scanned like
   * discovery — every SKILL.md, every skill's files, the small files' bytes —
   * and remembered, so the next views are answered from memory. Through
   * `upstreamReads`, keyed on repository, ref and commit only: the file
   * viewer's concurrent requests (`/content` and `/content/file`, any files)
   * share one clone, a 404 or 409 is answered from memory for a while, and
   * only a few clones run at once.
   *
   * `mustRead` (a repository-relative file the caller is about to answer)
   * is kept whatever the scan's budget by the clone that runs for it. A
   * caller that joined a clone made for another file and finds its listed
   * small file past that clone's budget (a commit with over 16 MB of small
   * files) reads once more, keyed with the file.
   */
  const readGitCommit = async (
    repoUrl: string,
    ref: string | undefined,
    commit: string,
    scanPath: string,
    mustRead?: string,
  ): Promise<SkillDiscoverySnapshot> => {
    const key = `${repositoryKey(repoUrl)}#${ref ?? ''}#${commit}#${scanPath}`;
    const cloneAt =
      (keep: string | undefined) => async (signal: AbortSignal) => {
        const snapshot = await discoverAgentSkillsFromGit({
          repoUrl,
          ref,
          commit,
          ...(scanPath ? { scanPath } : {}),
          mustRead: keep,
          signal,
        });
        skillDiscoveryCache.rememberPinned(repoUrl, commit, {
          files: snapshot.files ?? new Map(),
          contents: snapshot.contents,
          fileContents: snapshot.fileContents,
          truncated: snapshot.truncated,
        });
        return snapshot;
      };
    const shared = await upstreamReads.read('clone', key, cloneAt(mustRead));
    if (
      mustRead === undefined ||
      shared.fileContents?.has(mustRead) ||
      !keepsBytes(shared, mustRead)
    ) {
      return shared;
    }
    return upstreamReads.read('clone', `${key}#${mustRead}`, cloneAt(mustRead));
  };

  /**
   * Every skill's files of a github.com repository at a commit no listing
   * covers (an agent's older pin): one tree read, remembered (through
   * `upstreamReads`, as the clone above).
   */
  const readGitHubCommitFiles = (
    repoUrl: string,
    commit: string,
  ): Promise<Map<string, SkillFileList>> =>
    upstreamReads.read(
      'github',
      `tree#${repositoryKey(repoUrl)}#${commit}`,
      async signal => {
        const files = await listSkillFilesFromGitHub({
          repoUrl,
          commit,
          githubCredentialsProvider,
          signal,
        });
        skillDiscoveryCache.rememberPinned(repoUrl, commit, {
          files,
          // A capped tree marks every list truncated; with no list at all
          // there is no telling, so an empty map counts as capped too.
          truncated:
            files.size === 0 || [...files.values()].some(l => l.truncated),
        });
        return files;
      },
    );

  /** A 404 for a skill directory without a SKILL.md at the commit. */
  const noSkillAt = (repoUrl: string, path: string, commit: string) =>
    new GitFetchError(
      404,
      `${path ? `${path}/SKILL.md` : 'SKILL.md'} was not found in ${repoUrl} at ${shortSha(commit)}.`,
    );

  /**
   * GET /agent-skills/content
   *
   * One skill's SKILL.md at a commit, split into frontmatter `name`,
   * `description` and the Markdown body (`instructions`) — what the portal
   * prefills a skill edit with — plus the skill's other files: `files`
   * (`{ path, size, sha }`, path relative to the skill directory, SKILL.md
   * first) and `filesTruncated` (the skill has more than 200 files, or
   * GitHub truncated the repository tree). A nested skill's files belong to
   * it, not to the skill above it.
   *
   * Answered from the discovery cache when the listing read that commit (no
   * request upstream — no rate limit, no 409 for a branch that moved on since
   * the listing). Otherwise github.com repositories are read through the
   * contents API, with the GitHub integration's token like discovery, and the
   * file list through one tree read — best effort: when the tree read fails
   * the content is still answered, without `files`/`filesTruncated`. Any
   * other http(s) repository is read from one depth-1 clone, whose head must
   * still be the commit asked for (409 otherwise — re-reading the catalog
   * picks up the new head); that clone also lists the files and keeps the
   * small ones for `/content/file`.
   *
   * Only the configured `agentPlatform.skills.repositories`, for both
   * providers: the route reads what the catalog lists and nothing else.
   *
   * Query parameters:
   * - repoUrl: one of the configured skill repositories
   * - path: the skill directory ('' or absent for a skill at the root)
   * - commit: the full commit id to read at
   * - ref: optional branch the commit is the head of (git provider only)
   *
   * Returns { repoUrl, path, commit, name, description, instructions,
   * files?, filesTruncated? }.
   */
  router.get('/agent-skills/content', async (req, res) => {
    const parsed = skillAtCommitQuery.safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const { path, commit } = parsed.data;
    const repository = configuredSkillRepository(parsed.data.repoUrl);
    if (!repository) {
      throw notConfigured(parsed.data.repoUrl);
    }
    const { url: repoUrl, path: scanPath } = repository;
    const ref = parsed.data.ref ?? repository.ref;

    try {
      if (!isBelowPath(path, scanPath)) {
        throw outsideScanPath(repository, path);
      }
      let known = skillDiscoveryCache.readContent(repoUrl, path, commit);
      let files = skillDiscoveryCache.readSkillFiles(repoUrl, path, commit);
      // A commit whose whole skill list is known has no skill at a path
      // missing from it: answer 404 without reading upstream again.
      if (
        !known &&
        !files &&
        skillDiscoveryCache.knownCommit(repoUrl, commit)?.truncated === false
      ) {
        throw noSkillAt(repoUrl, path, commit);
      }
      let content: SkillContent;
      if (isGitHubUrl(repoUrl)) {
        content = known
          ? skillContentFromRaw(known.raw, {
              repoUrl: known.repoUrl,
              path,
              commit,
            })
          : await upstreamReads.read(
              'github',
              `content#${repositoryKey(repoUrl)}#${commit}#${path}`,
              signal =>
                readSkillContentFromGitHub({
                  repoUrl,
                  path,
                  commit,
                  githubCredentialsProvider,
                  signal,
                }),
            );
        if (!files) {
          files = await readGitHubCommitFiles(content.repoUrl, commit).then(
            all => all.get(path),
            error => {
              logger?.info('Could not list the files of a skill', {
                repository: repoUrl,
                error: (error as Error)?.message,
              });
              return undefined;
            },
          );
        }
      } else {
        if (!known || !files) {
          const snapshot = await readGitCommit(repoUrl, ref, commit, scanPath);
          const raw = snapshot.contents.get(path);
          if (raw === undefined) {
            throw noSkillAt(
              snapshot.skills[0]?.repoUrl ?? repoUrl,
              path,
              commit,
            );
          }
          known = { raw, repoUrl: snapshot.skills[0]?.repoUrl ?? repoUrl };
          files = snapshot.files?.get(path);
        }
        content = skillContentFromRaw(known.raw, {
          repoUrl: known.repoUrl,
          path,
          commit,
        });
      }
      res.json({
        ...content,
        ...(files
          ? { files: files.files, filesTruncated: files.truncated }
          : {}),
      });
    } catch (error) {
      // Expected outcomes keep their upstream status (404 file gone, 409 the
      // branch moved on, 403/429 rate limit), like discovery — not 500s.
      if (error instanceof GitHubApiError || error instanceof GitFetchError) {
        res.status(error.status).json({
          error: { message: `Failed to read the skill: ${error.message}` },
        });
        return;
      }
      throw error;
    }
  });

  /**
   * GET /agent-skills/content/file
   *
   * One file of a skill at a commit, for the Instructions tab's file viewer.
   *
   * The same gates as `/content` (a configured repository, a skill directory,
   * a full commit id), and `file` — relative to the skill directory, no `..`
   * or `.` segment, no leading `/` — **must be one of the skill's listed
   * files** (the `files` `/content` answers). That list is the security
   * boundary: the route reads with the portal's own credentials, and never
   * serves a path outside the skill (nor a symlink, nor a file of a nested
   * skill below it, nor one past the 200-file cap — 404).
   *
   * Returns { path, size, sha, binary, truncated, content? }: `content` is the
   * file as UTF-8 text, present only for a text file up to 512 KB; a binary
   * file (by extension, or a NUL byte in its first 8,000) answers `binary:
   * true` and an oversize one `truncated: true`, both without `content` (the
   * UI links to the repository). An oversize or binary-by-extension file is
   * answered from its listed size and name without being read at all.
   *
   * Content at a commit never changes: the answer is `Cache-Control: private,
   * max-age=86400, immutable`, and the server keeps small files in a
   * size-capped LRU (repository#commit#path, 32 MB).
   *
   * Reads on a cache miss:
   * - github.com: the file list from one tree read (when no listing covers
   *   the commit), the file from the contents API at the commit — one request
   *   per file, then from memory.
   * - generic git: never a clone per click. Discovery's checkout scan (and
   *   `/content`'s, for a commit no listing holds) already keeps every small
   *   listed file. Only when the file cache evicted it, or no read covered the
   *   commit, does the route clone once more — one depth-1 clone that
   *   repopulates the whole commit (concurrent requests share it, whichever
   *   files they ask for, `/content`'s too); its head must still be the
   *   commit asked for, so a branch that moved on answers 409 ("reload the
   *   skill"), as `/content` does.
   *
   * Every upstream read on a miss, here and in `/content`, goes through
   * `UpstreamReadGuard`: a 404, 409 or 422 is answered from memory for five
   * minutes per read, concurrent reads of one key share one, at most two
   * clones and four GitHub reads run at once (32 more wait each; past that,
   * 503), and a read is aborted with a 504 past its deadline (60 s for a
   * clone, 30 s for a GitHub read), so random commit ids cannot make the
   * backend clone or spend the GitHub token without bound, and a stalled
   * upstream cannot hold a slot. A path missing from a commit whose file
   * lists are already known is a 404 from memory, here and in `/content`
   * (re-reading the same commit would list the same tree), so random paths
   * at a known commit cost no upstream read either.
   *
   * Query parameters: repoUrl, path, commit, ref (as `/content`), and file.
   */
  router.get('/agent-skills/content/file', async (req, res) => {
    const parsed = skillAtCommitQuery
      .extend({
        file: z.string().refine(isSkillFilePath, {
          message: 'file must be a path relative to the skill directory',
        }),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const { path, commit, file } = parsed.data;
    const repository = configuredSkillRepository(parsed.data.repoUrl);
    if (!repository) {
      throw notConfigured(parsed.data.repoUrl);
    }
    const { url: repoUrl, path: scanPath } = repository;
    const ref = parsed.data.ref ?? repository.ref;
    const isGitHub = isGitHubUrl(repoUrl);
    const filePath = repositoryFilePath(path, file);
    const notFound = (message: string) => {
      res.status(404).json({ error: { message } });
    };

    try {
      if (!isBelowPath(path, scanPath)) {
        throw outsideScanPath(repository, path);
      }
      let gitRead: SkillDiscoverySnapshot | undefined;
      let list = skillDiscoveryCache.readSkillFiles(repoUrl, path, commit);
      // A commit whose file lists are known answers a missing skill from
      // memory: a fresh read would list the same (capped) tree again.
      if (!list && !skillDiscoveryCache.knownCommit(repoUrl, commit)) {
        if (isGitHub) {
          list = (await readGitHubCommitFiles(repoUrl, commit)).get(path);
        } else {
          gitRead = await readGitCommit(
            repoUrl,
            ref,
            commit,
            scanPath,
            filePath,
          );
          list = gitRead.files?.get(path);
        }
      }
      if (!list) {
        notFound(
          `There is no skill at ${path || 'the root'} of ${repoUrl} at ${shortSha(commit)}.`,
        );
        return;
      }
      const entry = list.files.find(f => f.path === file);
      if (!entry) {
        notFound(
          `${file} is not ${list.truncated ? 'among the listed files' : 'a file'} of the skill at ${path || 'the root'} of ${repoUrl} at ${shortSha(commit)}.`,
        );
        return;
      }

      let read: { bytes?: Uint8Array; binary?: boolean } | undefined;
      if (needsFileBytes(entry)) {
        // A clone just made has the bytes at hand, whatever the cache kept.
        const scanned = gitRead?.fileContents?.get(filePath);
        read = scanned
          ? { bytes: scanned }
          : skillDiscoveryCache.readFile(repoUrl, commit, filePath);
        if (!read && isGitHub) {
          const bytes = await upstreamReads.read(
            'github',
            `file#${repositoryKey(repoUrl)}#${commit}#${filePath}`,
            signal =>
              readSkillFileFromGitHub({
                repoUrl,
                filePath,
                commit,
                githubCredentialsProvider,
                signal,
              }),
          );
          read = skillDiscoveryCache.rememberFile(
            repoUrl,
            commit,
            filePath,
            bytes,
          );
        } else if (!read) {
          const bytes = (
            await readGitCommit(repoUrl, ref, commit, scanPath, filePath)
          ).fileContents?.get(filePath);
          if (!bytes) {
            notFound(
              `${file} could not be read from ${repoUrl} at ${shortSha(commit)}.`,
            );
            return;
          }
          read = { bytes };
        }
      }

      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      res.json(skillFileContent(entry, read));
    } catch (error) {
      // Expected outcomes keep their upstream status (404, 409 the branch
      // moved on, 403/429 rate limit), like `/content` — not 500s.
      if (error instanceof GitHubApiError || error instanceof GitFetchError) {
        res.status(error.status).json({
          error: { message: `Failed to read the skill file: ${error.message}` },
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
   * of the configured skill repositories — or, with `kind: 'update'`, one that
   * rewrites an existing skill's `<path>/SKILL.md` — authored **as the
   * signed-in person**:
   * their GitHub access token — minted by the frontend through
   * `githubAuthApiRef`, i.e. their own GitHub grant in muster — travels in the
   * `gs-github-token` header, and every GitHub call runs with it. Nothing is
   * applied anywhere: the skill joins the catalog once a teammate merges the
   * pull request and discovery re-reads the repository's head.
   *
   * Body:
   * - repoUrl: one of `agentPlatform.skills.repositories` (compared
   *   case-insensitively, tolerating `.git` and a trailing slash)
   * - skillName: the frontmatter name; for `create` also the directory, so a
   *   lowercase slug; an `update` may send the skill's existing name even
   *   when it is not one (checked against the file)
   * - description: frontmatter `description`
   * - instructions: the SKILL.md body (up to 100,000 characters; the route's
   *   JSON body limit is raised to fit it)
   * - tags: frontmatter `metadata.tags`, each lowercase letters and digits
   *   with single `-` between, at most 63 characters; replaces the skill's
   *   tags (`[]` removes them); absent keeps an update's
   * - kind: `create` (default) or `update`
   * - path: for `update`, the skill directory ('' at the repository root)
   * - baseCommit: for `update`, the commit the edit started from — a 409 when
   *   the skill's SKILL.md changed on the default branch since
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
      // A slug for `create` (checked below); an update's existing name may be
      // any single line.
      skillName: z
        .string()
        .min(1)
        .max(MAX_SKILL_DISPLAY_NAME)
        .refine(name => !/\p{Cc}/u.test(name), {
          message: 'skillName must be a single line of text',
        }),
      description: z.string().trim().min(1).max(1024),
      instructions: z.string().trim().min(1).max(MAX_SKILL_INSTRUCTIONS),
      tags: z
        .array(
          z.string().refine(isValidTag, {
            message: `Each tag must be lowercase letters and digits with single dashes between, at most ${MAX_TAG_LENGTH} characters`,
          }),
        )
        // The limit is checked against the stored tags when the SKILL.md is
        // written (`withSkillTags`): an unchanged list past it goes through.
        .optional(),
      kind: z.enum(['create', 'update']).optional(),
      path: z
        .string()
        .refine(isSkillDirectory, {
          message: 'path must be a relative skill directory',
        })
        .optional(),
      baseCommit: z
        .string()
        .regex(COMMIT_ID_RE, { message: 'baseCommit must be a full commit id' })
        .optional(),
      installation: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const { repoUrl, skillName, description, instructions, kind } = parsed.data;
    const tags =
      parsed.data.tags === undefined
        ? undefined
        : [...new Set(parsed.data.tags)];
    if (kind === 'update') {
      if (parsed.data.path === undefined) {
        throw new InputError(
          'An update needs the path of the skill directory it rewrites',
        );
      }
      if (parsed.data.baseCommit === undefined) {
        throw new InputError(
          'An update needs the baseCommit the edit started from, so a change made since is not overwritten',
        );
      }
    } else if (!SKILL_NAME_RE.test(skillName)) {
      throw new InputError(
        'skillName must be a lowercase slug (letters, digits and dashes, up to 63 characters)',
      );
    }

    // Only the catalog's writable sources: a pull request anywhere else would
    // add a skill no one can see. With an installation, its skill-manager's
    // sources as the person sees them; without one, the portal's configured
    // list (deprecated).
    let base: string | undefined;
    let parentDir: string | undefined;
    if (parsed.data.installation !== undefined) {
      if (!readSkillSources) {
        throw new Error('gs-backend reads skill sources only with a logger');
      }
      const musterToken = req.header(MUSTER_AUTH_HEADER);
      if (!musterToken) {
        throw new AuthenticationError(
          `Missing ${MUSTER_AUTH_HEADER} header: the skill sources are read from the installation's skill-manager as the signed-in person.`,
        );
      }
      let sources: SkillSource[];
      try {
        sources = await readSkillSources(parsed.data.installation, musterToken);
      } catch (error) {
        if (error instanceof MusterServerNotConnectedError) {
          res.status(401).json({
            error: {
              name: error.name,
              message: error.message,
              server: error.server,
              authUrl: error.authUrl,
            },
          });
          return;
        }
        throw error;
      }
      base = requireWritableSource(sources, {
        repoUrl,
        kind: kind ?? 'create',
        skillName,
        path: parsed.data.path,
      }).ref;
    } else {
      // Only the configured sources: the catalog lists these and nothing
      // else, so a pull request anywhere else would add a skill no one can see.
      const repository = configuredSkillRepository(repoUrl);
      if (!repository) {
        throw new InputError(
          `${repoUrl} is not one of the configured skill repositories`,
        );
      }
      // A read-only source (the platform's own skills) takes no pull requests
      // from the portal; agent-manager refuses the same.
      if (repository.readOnly) {
        throw new InputError(`${repoUrl} is a read-only skill repository`);
      }
      // Pull requests target a branch: the configured one, else the default
      // branch. A source read at a commit or a `refs/tags/` ref takes none (a
      // plain name that is a tag is refused by `createSkillPullRequest`, which
      // asks GitHub).
      const branch = pullRequestBase(repository);
      if (branch === null) {
        throw new InputError(
          `${repoUrl} is read at ${repository.ref}, not a branch`,
        );
      }
      if (
        kind === 'update' &&
        !isBelowPath(parsed.data.path ?? '', repository.path)
      ) {
        throw new InputError(
          `${parsed.data.path || 'The root'} is not below ${repository.path} in ${repoUrl}`,
        );
      }
      base = branch || undefined;
      // A new skill goes where discovery scans.
      parentDir = repository.path || undefined;
    }

    try {
      res.json(
        await createSkillPullRequest({
          repoUrl,
          skillName,
          description,
          instructions,
          ...(tags !== undefined ? { tags } : {}),
          token,
          ...(parentDir ? { parentDir } : {}),
          ...(base ? { base } : {}),
          ...(kind === 'update'
            ? {
                kind,
                path: parsed.data.path,
                baseCommit: parsed.data.baseCommit,
              }
            : {}),
          ...(logger ? { logger } : {}),
        }),
      );
    } catch (error) {
      // Expected outcomes keep their upstream status (409 skill or branch
      // exists, or the edited skill changed since the edit started; 403 no
      // push access or rate limit; 404 no read access or the edited skill
      // gone; 422 an edit that changes nothing or renames to a non-slug), like
      // the discovery route above — not 500s, keeping Sentry quiet.
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

  // Last, so that every route above reaches it. A Mimir that could not answer
  // `/mimir/query` or `/mimir/query_range` is a `MimirUnavailableError`,
  // which `MimirService` has already logged once: this answers its 503, with
  // the `reason` the frontend picks its words from, without the error
  // middleware reporting it again.
  router.use(reportedErrorHandler());

  return router;
}

/**
 * Whether a clone's scan would keep the bytes of `filePath` (repository-
 * relative) when asked to: a listed file of some skill, small enough to be
 * answered inline. Anything else no clone keeps, so reading again is waste.
 */
function keepsBytes(snapshot: SkillDiscoverySnapshot, filePath: string) {
  for (const [dir, list] of snapshot.files ?? []) {
    for (const file of list.files) {
      if (
        repositoryFilePath(dir, file.path) === filePath &&
        file.size <= MAX_INLINE_FILE_BYTES
      ) {
        return true;
      }
    }
  }
  return false;
}
