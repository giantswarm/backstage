import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { useMessagePartText, useAuiState } from '@assistant-ui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createMarkdownComponents, useMarkdownStyles } from './MarkdownText';

// Characters revealed per animation frame (~300 chars/sec at 60fps).
const CHARS_PER_FRAME = 10;

// How recently a message must have been created (ms) to receive animation.
// Handles the case where all SSE chunks arrive in one TCP read and are batched
// into a single React render, so the component mounts with status 'complete'.
const NEW_MESSAGE_THRESHOLD_MS = 10_000;

// How long to pause text reveal after a table appears, so text resumes only
// after the table's CSS fadeInUp animation (0.3s) has finished.
// Slightly longer than the CSS duration to account for render delay.
const TABLE_ANIMATION_PAUSE_MS = 350;

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
 * A rule that may advance the reveal position past a markdown construct so it
 * appears whole rather than character-by-character.
 */
type SkipRule = {
  advance: (text: string, pos: number) => number;
  /** Pause (ms) after this rule fires, e.g. to wait for a CSS animation. */
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
 * Pipeline of skip rules applied during text-reveal animation.
 * Each rule may advance the position past a markdown construct so it appears
 * whole. Add new entries here to handle additional constructs.
 */
const SKIP_RULES: SkipRule[] = [
  { advance: advancePastTable, pauseMs: TABLE_ANIMATION_PAUSE_MS },
  { advance: advancePastLinkUrl },
];

const StreamingMarkdownTextImpl = () => {
  const classes = useMarkdownStyles();
  const components = useMemo(
    () => createMarkdownComponents(classes),
    [classes],
  );
  const { text: targetText, status } = useMessagePartText();
  const isStreaming = status.type === 'running';

  // Also animate if the message was created very recently — handles the case
  // where all SSE chunks arrive in one TCP read and are batched into one render.
  const createdAt = useAuiState((s: any) => s.message.createdAt as Date);
  const isNewMessage =
    Date.now() - (createdAt?.getTime?.() ?? 0) < NEW_MESSAGE_THRESHOLD_MS;

  const shouldAnimate = isStreaming || isNewMessage;

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
      // a markdown construct and optionally request a pause (e.g. for CSS
      // animations to finish before text resumes).
      let newLen = rawLen;
      let pauseMs = 0;
      for (const rule of SKIP_RULES) {
        const advanced = rule.advance(targetText, newLen);
        if (advanced > newLen) {
          newLen = advanced;
          if (rule.pauseMs) {
            pauseMs = rule.pauseMs;
          }
        }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Markdown remarkPlugins={[remarkGfm]} components={components as any}>
      {displayedText}
    </Markdown>
  );
};

export const StreamingMarkdownText = memo(StreamingMarkdownTextImpl);
