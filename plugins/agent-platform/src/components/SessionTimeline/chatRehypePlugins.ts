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

/**
 * Model output can quote tool output verbatim, so raw HTML in a message is
 * untrusted: it is parsed (agents wrap long output in `<details>`) and then
 * sanitised to GitHub's allow-list, minus resource-loading elements.
 */
export const chatRehypePlugins: NonNullable<Options['rehypePlugins']> = [
  rehypeRaw,
  [rehypeSanitize, chatSanitizeSchema],
];
