/** The parts of a hast node, react-markdown's `node`, the lookup reads. */
export type MermaidSourceNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: MermaidSourceNode[];
};

const textOf = (node: MermaidSourceNode): string =>
  node.type === 'text'
    ? (node.value ?? '')
    : (node.children ?? []).map(textOf).join('');

const classNamesOf = (node: MermaidSourceNode) => {
  const className = node.properties?.className;
  return Array.isArray(className) ? className.map(String) : [];
};

/**
 * The source of a ` ```mermaid ` fence: the `<pre><code class="language-mermaid">`
 * element react-markdown hands a `pre` component as `node`. Undefined for
 * any other block, so a renderer draws the diagram only where this answers.
 */
export function mermaidSource(pre: MermaidSourceNode | undefined) {
  const code = pre?.children?.find(child => child.type === 'element');
  if (code?.tagName !== 'code') return undefined;
  if (!classNamesOf(code).includes('language-mermaid')) return undefined;
  return textOf(code).replace(/\n+$/, '');
}
