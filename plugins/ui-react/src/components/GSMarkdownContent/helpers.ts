import GithubSlugger from 'github-slugger';

// rehype-sanitize prefixes ids and names from raw HTML (and footnotes) with
// this, as GitHub does; a `#name` link still finds `user-content-name`.
const CLOBBER_PREFIX = 'user-content-';

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/**
 * Returns the fragment of `link` when it points into the page it is on, or
 * `undefined` when it leads elsewhere. `pageHref` is the router's href of the
 * current page; a `#heading` link rendered through the router is that plus the
 * fragment, and a bare `#` link is that alone.
 */
export function getInPageFragment(
  link: HTMLAnchorElement,
  pageHref: string,
): string | undefined {
  const href = link.getAttribute('href');
  if (href === pageHref) {
    return '';
  }
  return href?.startsWith(`${pageHref}#`)
    ? href.slice(pageHref.length + 1)
    : undefined;
}

/**
 * Finds the element a `#fragment` link in rendered markdown points to, the way
 * GitHub resolves it: an element with that id or name, with or without the
 * sanitizer's prefix, or else the heading whose GitHub slug it is. Headings
 * are matched by slug only, since `MarkdownContent` gives them ids of its own.
 * Returns `'top'` for `#` and `#top` when nothing else matches.
 */
export function findAnchorTarget(
  container: HTMLElement,
  fragment: string,
): HTMLElement | 'top' | undefined {
  const name = decodeFragment(fragment);
  const candidates = [name, `${CLOBBER_PREFIX}${name}`];

  const named = Array.from(
    container.querySelectorAll<HTMLElement>('[id], a[name]'),
  ).find(
    element =>
      !element.matches(HEADINGS) &&
      (candidates.includes(element.id) ||
        candidates.includes(element.getAttribute('name') ?? '')),
  );
  if (named) {
    return named;
  }

  // One slugger for the whole document, so repeated headings get GitHub's
  // `-1`, `-2` suffixes in order.
  const slugger = new GithubSlugger();
  const slug = name.toLowerCase();
  const heading = Array.from(
    container.querySelectorAll<HTMLElement>(HEADINGS),
  ).find(element => slugger.slug(element.textContent ?? '') === slug);
  if (heading) {
    return heading;
  }

  return name === '' || slug === 'top' ? 'top' : undefined;
}
