const SAFE_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

type GitHubDocument = {
  owner: string;
  repo: string;
  ref: string;
  // Path of the document inside the repository, without a leading slash.
  path: string;
};

// Where the ref ends can't be told from the URL alone, so a branch or tag name
// is taken as one segment, after `refs/heads/` or `refs/tags/` if present. A
// name with a slash (`release/v1`) is split in the wrong place. Plain relative
// links still come out right, since ref and path are joined back together, but
// `/`-rooted links and `..` up to the root resolve against the wrong root.
function splitRef(segments: string[]): { ref: string; path: string } | null {
  const refLength =
    segments[0] === 'refs' && ['heads', 'tags'].includes(segments[1]) ? 3 : 1;
  if (segments.length <= refLength) {
    return null;
  }
  return {
    ref: segments.slice(0, refLength).join('/'),
    path: segments.slice(refLength).join('/'),
  };
}

function parseGitHubDocument(url: URL): GitHubDocument | null {
  const segments = url.pathname.split('/').filter(Boolean);

  let repoSegments: string[];
  if (url.hostname === 'raw.githubusercontent.com') {
    repoSegments = segments;
  } else if (
    url.hostname === 'github.com' &&
    (segments[2] === 'blob' || segments[2] === 'raw')
  ) {
    repoSegments = [...segments.slice(0, 2), ...segments.slice(3)];
  } else {
    return null;
  }

  const [owner, repo, ...rest] = repoSegments;
  const refAndPath = splitRef(rest);
  return owner && repo && refAndPath ? { owner, repo, ...refAndPath } : null;
}

// The scheme of an href, or null for a relative one. As in react-markdown's
// default `uriTransformer`, anything before the first colon is a scheme unless
// a `/`, `?` or `#` comes first, so `java\tscript:` counts as one.
function schemeOf(href: string): string | null {
  const colon = href.indexOf(':');
  if (colon === -1 || /[/?#]/.test(href.slice(0, colon))) {
    return null;
  }
  return href.slice(0, colon).toLowerCase();
}

// The allowlist `uriTransformer` applies, which a custom `transformLinkUri`
// replaces. An unsafe link loses its href and renders as text.
function sanitize(href: string): string {
  const scheme = schemeOf(href);
  return scheme === null || SAFE_PROTOCOLS.includes(scheme) ? href : '';
}

/**
 * Returns a link transform for markdown loaded from `sourceUrl`, which
 * resolves relative links against that document instead of the page it is
 * shown on. Links in a document from a GitHub repository point to the file on
 * github.com at the same ref, the way GitHub renders them. Returns `undefined`
 * when `sourceUrl` is not an http(s) URL.
 */
export function createMarkdownLinkResolver(
  sourceUrl: string | undefined,
): ((href: string) => string) | undefined {
  if (!sourceUrl) {
    return undefined;
  }

  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return undefined;
  }
  if (source.protocol !== 'http:' && source.protocol !== 'https:') {
    return undefined;
  }

  const gitHubDocument = parseGitHubDocument(source);

  return (rawHref: string) => {
    const href = rawHref.trim();
    if (
      href === '' ||
      href.startsWith('#') ||
      href.startsWith('//') ||
      schemeOf(href) !== null
    ) {
      return sanitize(href);
    }

    if (!gitHubDocument) {
      return sanitize(new URL(href, source).href);
    }

    // Resolved on a throwaway origin, so `..` stops at the repository root
    // and a leading `/` means the root, as on GitHub.
    const { owner, repo, ref, path } = gitHubDocument;
    const resolved = new URL(href, `https://repo.invalid/${path}`);
    return `https://github.com/${owner}/${repo}/blob/${ref}${resolved.pathname}${resolved.search}${resolved.hash}`;
  };
}
