/**
 * Fenced code blocks in a markdown reply, for the create-agent assist's
 * "use as system prompt" affordance.
 *
 * kagent replies are plain markdown — there is no structured suggestion
 * protocol — so a fenced block is the only machine-recognisable container an
 * agent's draft can travel in. The assist's opening prompt asks the agent to
 * fence its proposed system prompt for exactly this reason.
 */
export type FencedBlock = {
  /** The fence's info string (usually a language), empty when none. */
  info: string;
  /** The block's content, without the fences, as written. */
  code: string;
};

/**
 * Matches an opening or closing fence line: up to three leading spaces, then a
 * run of at least three backticks or tildes (CommonMark).
 */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Every completed fenced code block in the markdown, in order.
 *
 * A fence left open at the end of the text yields nothing: mid-stream, a block
 * still being produced must not be offered as a suggestion, and in a finished
 * message an unclosed fence is malformed markdown whose extent is a guess.
 */
export function extractFencedBlocks(markdown: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let open: { fence: string; info: string; lines: string[] } | undefined;

  for (const line of markdown.split('\n')) {
    const match = line.match(FENCE_LINE);
    if (open) {
      const closes =
        match &&
        match[1][0] === open.fence[0] &&
        match[1].length >= open.fence.length &&
        match[2].trim() === '';
      if (closes) {
        blocks.push({ info: open.info, code: open.lines.join('\n') });
        open = undefined;
      } else {
        open.lines.push(line);
      }
      continue;
    }
    if (match) {
      // A backtick fence's info string cannot contain a backtick (CommonMark);
      // such a line is inline code, not a fence.
      if (match[1][0] === '`' && match[2].includes('`')) {
        continue;
      }
      open = { fence: match[1], info: match[2].trim(), lines: [] };
    }
  }

  return blocks;
}
