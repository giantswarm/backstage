import { memo, useState, useRef, useEffect, useMemo, useContext } from 'react';
import { useMessagePartText } from '@assistant-ui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { createMarkdownComponents, useMarkdownStyles } from './MarkdownText';
import { AnimateContext } from '../AnimateContext';

// Characters revealed per animation frame (~300 chars/sec at 60fps).
const CHARS_PER_FRAME = 10;

// How long to pause text reveal after a block-level construct (table, code
// block, so text resumes only after its CSS
// fadeInUp animation (0.3s) has finished. Slightly longer than the CSS
// duration to account for render delay.
const REVEAL_ANIMATION_PAUSE_MS = 350;

/**
 * If `pos` is inside the non-visual part of a markdown link — the `](url)`
 * suffix — returns the position just after the closing `)` so only the visible
 * link text `[text]` is animated. Otherwise returns `pos` unchanged.
 */
function advancePastLinkUrl(text: string, pos: number): number {
  // Walk backwards to find a `](` that could be the bridge between link text
  // and URL. We look for the pattern `](` ending at or before pos.
  let searchFrom = pos;
  while (searchFrom >= 0) {
    const closeBracket = text.lastIndexOf('](', searchFrom);
    if (closeBracket === -1) return pos;

    const urlStart = closeBracket + 2;

    // pos must be inside the `](url)` section, i.e. >= closeBracket.
    if (pos < closeBracket) return pos;

    // Make sure there is an opening `[` before this `](`.
    const openBracket = text.lastIndexOf('[', closeBracket - 1);
    if (openBracket === -1) {
      searchFrom = closeBracket - 1;
      continue;
    }

    // Find the closing `)`.
    const closeParen = text.indexOf(')', urlStart);
    if (closeParen === -1) return pos;

    const linkEnd = closeParen + 1;

    // pos must be within the `](url)` span.
    if (pos >= closeBracket && pos <= linkEnd) {
      return linkEnd;
    }

    searchFrom = closeBracket - 1;
  }

  return pos;
}

/**
 * A rule applied during text-reveal animation. Returns the desired reveal
 * position given the current `pos`. May advance past a markdown construct so
 * it appears whole, or return a position less than `pos` to halt the animation
 * before a not-yet-complete construct (the tick loop guards against
 * un-revealing already-shown text).
 */
type SkipRule = {
  advance: (text: string, pos: number) => number;
  /** Pause (ms) after this rule advances, e.g. to wait for a CSS animation. */
  pauseMs?: number;
};

/**
 * If `pos` is inside a markdown table block (a run of lines starting with `|`),
 * returns the position just after the last row of that block so the entire table
 * is revealed at once. Otherwise returns `pos` unchanged.
 */
function advancePastTable(text: string, pos: number): number {
  // Find the start of the line that contains `pos`.
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;

  // Walk backwards to find the first row of the table block in case we landed
  // somewhere in the middle of it.
  let blockStart = lineStart;
  while (blockStart > 0) {
    const prevEnd = blockStart - 1;
    const prevStart = text.lastIndexOf('\n', prevEnd - 1) + 1;
    if (!text.slice(prevStart, prevEnd).trimStart().startsWith('|')) break;
    blockStart = prevStart;
  }

  // If the current line doesn't start a table row, nothing to skip.
  const lineEnd = text.indexOf('\n', blockStart);
  const firstLine = text.slice(
    blockStart,
    lineEnd === -1 ? text.length : lineEnd,
  );
  if (!firstLine.trimStart().startsWith('|')) return pos;

  // Scan forward to the first line that is NOT a table row.
  let scanPos = blockStart;
  while (scanPos < text.length) {
    const nextLineEnd = text.indexOf('\n', scanPos);
    const line = text.slice(
      scanPos,
      nextLineEnd === -1 ? text.length : nextLineEnd,
    );
    if (!line.trimStart().startsWith('|')) break;
    scanPos = nextLineEnd === -1 ? text.length : nextLineEnd + 1;
  }

  return scanPos;
}

/**
 * Handles fenced code blocks (` ``` `-delimited) for the text-reveal animation.
 *
 * - If `pos` is inside a *closed* block, returns the position just after the
 *   closing fence so the entire block is revealed at once.
 * - If `pos` is at or past an *unclosed* opening fence (still streaming),
 *   returns the opening fence's start so the animation halts there. This
 *   prevents partial fenced content (e.g. an in-flight mermaid diagram) from
 *   being parsed and rendered repeatedly as more text arrives.
 */
function advancePastFencedCodeBlock(text: string, pos: number): number {
  const fences: { start: number; end: number }[] = [];
  let lineStart = 0;
  while (lineStart < text.length) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    if (/^\s*```/.test(text.slice(lineStart, lineEnd))) {
      fences.push({ start: lineStart, end: lineEnd });
    }
    lineStart = lineEnd + 1;
  }

  for (let i = 0; i < fences.length; i += 2) {
    const open = fences[i];
    const close = fences[i + 1];
    if (pos < open.start) return pos;
    if (!close) return open.start;
    if (pos <= close.end) return Math.min(text.length, close.end + 1);
  }
  return pos;
}

/**
 * Handles `<details>` HTML blocks for the text-reveal animation.
 *
 * - If `pos` is inside a *closed* `<details>...</details>` block, returns the
 *   position just after the closing tag so the entire block is revealed at
 *   once.
 * - If `pos` is at or past an *unclosed* opening `<details>` tag (still
 *   streaming), returns the opening tag's start so the animation halts there.
 *   This prevents partial HTML (which rehype-raw may parse erratically) from
 *   being rendered repeatedly as more text arrives.
 */
function advancePastDetailsBlock(text: string, pos: number): number {
  const openRe = /<details(?:\s[^>]*)?>/gi;
  const closeRe = /<\/details\s*>/gi;

  let searchFrom = 0;
  while (searchFrom < text.length) {
    openRe.lastIndex = searchFrom;
    const open = openRe.exec(text);
    if (!open) return pos;

    if (pos < open.index) return pos;

    closeRe.lastIndex = open.index + open[0].length;
    const close = closeRe.exec(text);
    if (!close) return open.index;

    const blockEnd = close.index + close[0].length;
    if (pos <= blockEnd) return Math.min(text.length, blockEnd);

    searchFrom = blockEnd;
  }

  return pos;
}

/**
 * Pipeline of skip rules applied during text-reveal animation.
 * Each rule may advance the position past a markdown construct so it appears
 * whole, or hold the animation before a not-yet-complete construct.
 *
 * Order matters: the fenced-code-block rule runs last so it can clamp
 * advancement made by earlier rules into a still-streaming code fence.
 */
const SKIP_RULES: SkipRule[] = [
  { advance: advancePastTable, pauseMs: REVEAL_ANIMATION_PAUSE_MS },
  { advance: advancePastDetailsBlock, pauseMs: REVEAL_ANIMATION_PAUSE_MS },
  { advance: advancePastLinkUrl },
  { advance: advancePastFencedCodeBlock, pauseMs: REVEAL_ANIMATION_PAUSE_MS },
];

const StreamingMarkdownTextImpl = () => {
  const classes = useMarkdownStyles();
  const { text: targetText, status } = useMessagePartText();
  const isStreaming = status.type === 'running';

  // Also animate if this message was added after the Thread's initial render
  // (i.e. by user interaction, not loaded from history).  Handles the case
  // where all SSE chunks arrive in one TCP read and are batched into one
  // render, so the component mounts with status 'complete'.
  const animateNewMessages = useContext(AnimateContext);
  const isNewMessage = useRef(animateNewMessages).current;

  const shouldAnimate = isStreaming || isNewMessage;

  const components = useMemo(
    () => createMarkdownComponents(classes, { animate: shouldAnimate }),
    [classes, shouldAnimate],
  );

  const revealedRef = useRef(shouldAnimate ? 0 : targetText.length);
  const [displayedText, setDisplayedText] = useState(() =>
    shouldAnimate ? '' : targetText,
  );

  useEffect(() => {
    if (!isStreaming && !isNewMessage) {
      // Historical message — display immediately, no animation.
      revealedRef.current = targetText.length;
      setDisplayedText(targetText);
      return undefined;
    }

    if (!isStreaming && displayedText === targetText) {
      // Animation has caught up after stream ended — nothing to do.
      return undefined;
    }

    // Use a cancelled flag so cleanup from a previous effect run stops any
    // pending RAF or setTimeout from that run without needing to track IDs.
    let cancelled = false;

    const tick = () => {
      if (cancelled || revealedRef.current >= targetText.length) return;

      const rawLen = Math.min(
        revealedRef.current + CHARS_PER_FRAME,
        targetText.length,
      );

      // Run each skip rule in sequence. A rule may advance the position past
      // a markdown construct (optionally requesting a pause for a CSS
      // animation) or hold the position before a not-yet-complete construct.
      let newLen = rawLen;
      let pauseMs = 0;
      for (const rule of SKIP_RULES) {
        const result = rule.advance(targetText, newLen);
        if (result > newLen && rule.pauseMs) {
          pauseMs = rule.pauseMs;
        }
        newLen = result;
      }

      // Never un-reveal text that has already been shown.
      newLen = Math.max(newLen, revealedRef.current);

      if (newLen === revealedRef.current) {
        // No progress (e.g. animation is held before an unclosed fence).
        // Stop ticking; the effect re-runs whenever targetText changes, which
        // will resume the animation once more text arrives.
        return;
      }

      revealedRef.current = newLen;
      setDisplayedText(targetText.slice(0, newLen));

      if (newLen < targetText.length) {
        if (pauseMs > 0) {
          setTimeout(tick, pauseMs);
        } else {
          requestAnimationFrame(tick);
        }
      }
    };

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, targetText]);

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components={components as any}
    >
      {displayedText}
    </Markdown>
  );
};

export const StreamingMarkdownText = memo(StreamingMarkdownTextImpl);
