const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_PROTOCOLS = ['http', 'https', 'mailto', 'tel'];

type GitHubDocument = {
  owner: string;
  repo: string;
  ref: string;
  // Path of the document inside the repository, without a leading slash.
  path: string;
};

// A ref may contain slashes, so only the fully qualified `refs/heads/<name>`
// and `refs/tags/<name>` forms are taken as more than one path segment.
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

  if (url.hostname === 'raw.githubusercontent.com') {
    const [owner, repo, ...rest] = segments;
    const refAndPath = splitRef(rest);
    return owner && repo && refAndPath ? { owner, repo, ...refAndPath } : null;
  }

  if (url.hostname === 'github.com') {
    const [owner, repo, kind, ...rest] = segments;
    if (kind !== 'blob' && kind !== 'raw') {
      return null;
    }
    const refAndPath = splitRef(rest);
    return owner && repo && refAndPath ? { owner, repo, ...refAndPath } : null;
  }

  return null;
}

// The same allowlist react-markdown's default `uriTransformer` applies, which a
// custom `transformLinkUri` replaces. An unsafe link loses its href and renders
// as text.
function sanitize(href: string): string {
  const scheme = SCHEME.exec(href);
  if (!scheme) {
    return href;
  }
  const protocol = scheme[0].slice(0, -1).toLowerCase();
  return SAFE_PROTOCOLS.includes(protocol) ? href : '';
}

function isRelative(href: string): boolean {
  return (
    href !== '' &&
    !href.startsWith('#') &&
    !href.startsWith('//') &&
    !SCHEME.test(href)
  );
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

  return (href: string) => {
    if (!isRelative(href)) {
      return sanitize(href);
    }

    try {
      if (!gitHubDocument) {
        return new URL(href, source).href;
      }

      // Resolved on a throwaway origin, so `..` stops at the repository root
      // and a leading `/` means the root, as on GitHub.
      const { owner, repo, ref, path } = gitHubDocument;
      const resolved = new URL(href, `https://repo.invalid/${path}`);
      return `https://github.com/${owner}/${repo}/blob/${ref}${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return sanitize(href);
    }
  };
}
