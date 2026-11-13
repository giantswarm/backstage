import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options } from 'react-markdown';

/**
 * Elements whose only purpose is to load a resource. `img` stays in the schema
 * because the chat's `img` component renders it as a link, never as an element
 * the browser fetches.
 */
const REMOTE_LOADING_TAGS = new Set(['picture', 'source']);

const chatSanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    tag => !REMOTE_LOADING_TAGS.has(tag),
  ),
};

const CLOBBER_PREFIX = defaultSchema.clobberPrefix ?? 'user-content-';

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * The sanitiser prefixes every `id`, as GitHub does, so an in-page link
 * (`#fn-1`, a GFM footnote) points at the prefixed id, as GitHub's own script
 * resolves it.
 */
function rehypePrefixFragmentLinks() {
  const visit = (node: HastNode) => {
    const href = node.properties?.href;
    if (
      node.tagName === 'a' &&
      typeof href === 'string' &&
      href.length > 1 &&
      href.startsWith('#') &&
      !href.startsWith(`#${CLOBBER_PREFIX}`)
    ) {
      node.properties!.href = `#${CLOBBER_PREFIX}${href.slice(1)}`;
    }
    node.children?.forEach(visit);
  };
  return visit;
}

/**
 * Model output can quote tool output verbatim, so raw HTML in a message is
 * untrusted: it is parsed (agents wrap long output in `<details>`) and then
 * sanitised to GitHub's allow-list, minus resource-loading elements.
 */
export const chatRehypePlugins: NonNullable<Options['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, chatSanitizeSchema],
  rehypePrefixFragmentLinks,
];

/**
 * Footnote ids go unprefixed into the sanitiser, which adds the one prefix
 * they keep.
 */
export const chatRemarkRehypeOptions: NonNullable<
  Options['remarkRehypeOptions']
> = { clobberPrefix: '' };
