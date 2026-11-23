const ORIGIN = 'https://repository.invalid';

/** Where a link in a repository document points within the repository. */
export interface RepositoryLinkTarget {
  /** The repository path, decoded, without a leading or trailing slash. */
  path: string;
  /** The link's `#fragment` with its `#`, or empty. */
  hash: string;
  /** The link names a folder: it ends in `/`, or it is the repository root. */
  folder: boolean;
}

const encodePath = (path: string) =>
  path.split('/').map(encodeURIComponent).join('/');

/**
 * Resolves a link in the document at `documentPath` the way GitHub does: a
 * relative path against the document's folder, a `/path` against the
 * repository root. Undefined for a link that names no repository path: an
 * absolute URL, `mailto:` and the other schemes, a bare `#fragment` or
 * `?query`, and a path that does not decode.
 */
export function resolveRepositoryLink(
  href: string,
  documentPath: string,
): RepositoryLinkTarget | undefined {
  if (!href || href.startsWith('#') || href.startsWith('?')) return undefined;
  let destination: URL;
  let path: string;
  try {
    destination = new URL(href, `${ORIGIN}/${encodePath(documentPath)}`);
    path = decodeURIComponent(destination.pathname.slice(1));
  } catch {
    return undefined;
  }
  if (destination.origin !== ORIGIN) return undefined;
  return {
    path: path.replace(/\/+$/, ''),
    hash: destination.hash,
    folder: path === '' || path.endsWith('/'),
  };
}

/** A repository path's page on GitHub at `ref`: a file's blob, a folder's tree. */
export function githubPathUrl(
  repo: string,
  ref: string,
  target: RepositoryLinkTarget,
): string {
  const kind = target.folder ? 'tree' : 'blob';
  const path = target.path ? `/${encodePath(target.path)}` : '';
  return `https://github.com/${repo}/${kind}/${encodePath(ref)}${path}${
    target.hash
  }`;
}

/**
 * The portal URL that opens `path` on the page at `pageHref` (its pathname
 * and query): `?doc=` names the document, `params` add what the page needs
 * besides, every other parameter stays, and `hash` is kept.
 */
export function documentPageLink(
  pageHref: string,
  path: string,
  hash: string,
  params: Record<string, string> = {},
): string {
  const page = new URL(pageHref, ORIGIN);
  for (const [name, value] of Object.entries(params)) {
    page.searchParams.set(name, value);
  }
  page.searchParams.set('doc', path);
  page.hash = hash;
  return `${page.pathname}${page.search}${page.hash}`;
}

/**
 * A link in a plan document as the portal opens it. A document in
 * `documents`, the ones the page renders, opens on the same page at its
 * `#anchor`, or at `#top` without one, so the page shows its start
 * (`documentPageLink`, `params` per path). Any other file or folder of the
 * repository opens on GitHub at `ref`. A link out of the repository, or into
 * the document itself (`#anchor`), stays as written.
 */
export function planDocumentLink(
  href: string,
  options: {
    documentPath: string;
    pageHref: string;
    documents: ReadonlySet<string>;
    repo: string;
    ref: string;
    params?: (path: string) => Record<string, string>;
  },
): string {
  const target = resolveRepositoryLink(href, options.documentPath);
  if (!target) return href;
  if (!target.folder && options.documents.has(target.path)) {
    return documentPageLink(
      options.pageHref,
      target.path,
      target.hash || '#top',
      options.params?.(target.path),
    );
  }
  return githubPathUrl(options.repo, options.ref, target);
}
