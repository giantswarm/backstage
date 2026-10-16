export type MarkdownPart =
  { kind: 'markdown'; text: string } | { kind: 'mermaid'; source: string };

// A CommonMark fence: up to three spaces, then three or more backticks or
// tildes; a backtick fence's info string holds no backtick.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A link reference definition, `[label]: url`; footnotes (`[^1]:`) excluded.
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*\S/;

const closesFence = (line: string, marker: string) =>
  new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(line);

/**
 * Splits markdown at its top-level ```mermaid fences, so the diagrams render
 * as diagrams and the text around them as markdown. Fences nested in a list
 * item or a block quote stay code. Link reference definitions apply to the
 * whole document, so every markdown part carries them all.
 */
export function splitMermaid(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const definitions: string[] = [];
  let markdown: string[] = [];
  let fence: { marker: string; mermaid?: string[] } | undefined;

  const flushMarkdown = () => {
    if (markdown.some(line => line.trim() !== '')) {
      parts.push({ kind: 'markdown', text: markdown.join('\n') });
    }
    markdown = [];
  };

  for (const line of content.split(/\r?\n/)) {
    if (fence) {
      if (closesFence(line, fence.marker)) {
        if (fence.mermaid) {
          parts.push({ kind: 'mermaid', source: fence.mermaid.join('\n') });
        } else {
          markdown.push(line);
        }
        fence = undefined;
      } else {
        (fence.mermaid ?? markdown).push(line);
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      if (open[2].trim().split(/\s+/)[0] === 'mermaid') {
        flushMarkdown();
        fence = { marker: open[1], mermaid: [] };
      } else {
        markdown.push(line);
        fence = { marker: open[1] };
      }
      continue;
    }
    if (REFERENCE_DEFINITION.test(line)) {
      definitions.push(line);
    }
    markdown.push(line);
  }
  // An unclosed fence runs to the end of the document.
  if (fence?.mermaid) {
    parts.push({ kind: 'mermaid', source: fence.mermaid.join('\n') });
  }
  flushMarkdown();

  const markdownParts = parts.filter(part => part.kind === 'markdown');
  if (definitions.length === 0 || markdownParts.length < 2) {
    return parts;
  }
  return parts.map(part =>
    part.kind === 'markdown'
      ? { kind: 'markdown', text: `${part.text}\n\n${definitions.join('\n')}` }
      : part,
  );
}
