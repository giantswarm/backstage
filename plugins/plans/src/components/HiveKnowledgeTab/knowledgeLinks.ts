export function knowledgeDocumentLink(
  href: string,
  documentPath: string,
  pageHref: string,
): string {
  if (!href || href.startsWith('#') || href.startsWith('?')) return href;

  const origin = 'https://knowledge.invalid';
  let destination: URL;
  let path: string;
  try {
    destination = new URL(href, `${origin}/${documentPath}`);
    path = decodeURIComponent(destination.pathname.slice(1));
  } catch {
    return href;
  }
  if (destination.origin !== origin || !/\.mdx?$/i.test(path)) return href;

  const page = new URL(pageHref, origin);
  page.searchParams.set('doc', path);
  page.hash = destination.hash;
  return `${page.pathname}${page.search}${page.hash}`;
}
