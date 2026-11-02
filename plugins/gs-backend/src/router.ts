import {
  HttpAuthService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
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
  parseRepoUrl,
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
  isSkillFilePath,
  MAX_INLINE_FILE_BYTES,
  needsFileBytes,
  repositoryFilePath,
  SkillFileList,
  skillFileContent,
} from './agentSkills/skillFiles';
import {
  containerRegistryServiceRef,
  mimirServiceRef,
} from '@giantswarm/backstage-plugin-gs-node';
import { readSignedInConfig } from './signedInConfig';
import {
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
   * The entry of `agentPlatform.skills.repositories` a caller-named
   * repository URL is, compared the way the caches key it (`repositoryKey`:
   * case-insensitive, tolerating `.git` and trailing slashes); `undefined`
   * for any other repository. The skill read routes act only on these, and
   * read the configured URL rather than the caller's spelling of it: this
   * backend can reach hosts the browser cannot, and reads with the portal's
   * own GitHub token.
   */
  const configuredSkillRepository = (repoUrl: string): string | undefined => {
    const repositories =
      config.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];
    const target = repositoryKey(repoUrl);
    return repositories.find(url => repositoryKey(url) === target)?.trim();
  };

  /** The 400 for a repository that is not a configured skill source. */
  const notConfigured = (repoUrl: string) =>
    new InputError(
      `${repoUrl} is not one of the configured skill repositories`,
    );

  /** A full commit id (SHA-1 or SHA-256). */
  const COMMIT_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

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
   * - ref, commit: the ref read and the commit it resolved to
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

    const { ref } = parsed.data;
    const repoUrl = configuredSkillRepository(parsed.data.repoUrl);
    if (!repoUrl) {
      throw notConfigured(parsed.data.repoUrl);
    }
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
                  githubCredentialsProvider,
                  previous,
                  logger,
                  signal,
                })
              : discoverAgentSkillsFromGit({ repoUrl, ref, signal }),
          ),
      );
      res.json({ ...result, readAt: new Date(readAt).toISOString(), stale });
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
    commit: z.string().regex(COMMIT_RE, {
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
    mustRead?: string,
  ): Promise<SkillDiscoverySnapshot> => {
    const key = `${repositoryKey(repoUrl)}#${ref ?? ''}#${commit}`;
    const cloneAt =
      (keep: string | undefined) => async (signal: AbortSignal) => {
        const snapshot = await discoverAgentSkillsFromGit({
          repoUrl,
          ref,
          commit,
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
    const { path, commit, ref } = parsed.data;
    const repoUrl = configuredSkillRepository(parsed.data.repoUrl);
    if (!repoUrl) {
      throw notConfigured(parsed.data.repoUrl);
    }

    try {
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
          const snapshot = await readGitCommit(repoUrl, ref, commit);
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
    const { path, commit, ref, file } = parsed.data;
    const repoUrl = configuredSkillRepository(parsed.data.repoUrl);
    if (!repoUrl) {
      throw notConfigured(parsed.data.repoUrl);
    }
    const isGitHub = isGitHubUrl(repoUrl);
    const filePath = repositoryFilePath(path, file);
    const notFound = (message: string) => {
      res.status(404).json({ error: { message } });
    };

    try {
      let gitRead: SkillDiscoverySnapshot | undefined;
      let list = skillDiscoveryCache.readSkillFiles(repoUrl, path, commit);
      // A commit whose file lists are known answers a missing skill from
      // memory: a fresh read would list the same (capped) tree again.
      if (!list && !skillDiscoveryCache.knownCommit(repoUrl, commit)) {
        if (isGitHub) {
          list = (await readGitHubCommitFiles(repoUrl, commit)).get(path);
        } else {
          gitRead = await readGitCommit(repoUrl, ref, commit, filePath);
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
            await readGitCommit(repoUrl, ref, commit, filePath)
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
      kind: z.enum(['create', 'update']).optional(),
      path: z
        .string()
        .refine(isSkillDirectory, {
          message: 'path must be a relative skill directory',
        })
        .optional(),
      baseCommit: z
        .string()
        .regex(COMMIT_RE, { message: 'baseCommit must be a full commit id' })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const { repoUrl, skillName, description, instructions, kind } = parsed.data;
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
