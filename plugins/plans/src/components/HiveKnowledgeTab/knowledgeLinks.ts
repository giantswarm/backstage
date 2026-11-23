import {
  documentPageLink,
  resolveRepositoryLink,
} from '../../lib/repositoryLinks';

/**
 * A link in the knowledge document at `documentPath` as Knowledge opens it:
 * another markdown document of the repository on the same page
 * (`pageHref`, `?doc=` naming it), anything else as written.
 */
export function knowledgeDocumentLink(
  href: string,
  documentPath: string,
  pageHref: string,
): string {
  const target = resolveRepositoryLink(href, documentPath);
  if (!target || target.folder || !/\.mdx?$/i.test(target.path)) return href;
  return documentPageLink(pageHref, target.path, target.hash);
}
