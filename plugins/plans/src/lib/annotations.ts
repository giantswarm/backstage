import { PlanPullFile, PlanReviewComment } from '../apis/types';
import { parsePatch } from './diff';
import { splitFrontmatter } from './files';

/**
 * Line numbers (new-file side) that can carry a review comment. 'all' is used
 * for added files, where every line is part of the diff.
 */
export type CommentableLines = 'all' | ReadonlySet<number>;

/**
 * Which new-file lines of a pull file accept review comments. Added files
 * accept comments on every line; modified/renamed files only on lines present
 * on the RIGHT side of the diff. Files without a patch (binary, oversized)
 * accept none.
 */
export function commentableLines(file: PlanPullFile): CommentableLines {
  if (file.status === 'added') {
    return 'all';
  }
  const lines = new Set<number>();
  if (file.patch) {
    for (const line of parsePatch(file.patch)) {
      if (line.newLine !== undefined) {
        lines.add(line.newLine);
      }
    }
  }
  return lines;
}

export function isCommentable(lines: CommentableLines, line: number): boolean {
  return lines === 'all' ? true : lines.has(line);
}

/**
 * Number of source lines `splitFrontmatter` strips from the top of a
 * document. Rendered-body line N corresponds to file line N + offset, which
 * is the anchor review comments need.
 */
export function frontmatterOffset(markdown: string): number {
  const { body } = splitFrontmatter(markdown);
  if (body === markdown) {
    return 0;
  }
  const stripped = markdown.slice(0, markdown.length - body.length);
  return stripped.split('\n').length - 1;
}

/**
 * First file line in [startLine, endLine] that can carry a new comment --
 * the anchor used when commenting on a rendered block. Undefined when the
 * block contains no commentable line.
 */
export function firstCommentableLine(
  lines: CommentableLines,
  startLine: number,
  endLine: number,
): number | undefined {
  if (lines === 'all') {
    return startLine;
  }
  for (let line = startLine; line <= endLine; line++) {
    if (lines.has(line)) {
      return line;
    }
  }
  return undefined;
}

export interface ReviewThread {
  root: PlanReviewComment;
  replies: PlanReviewComment[];
}

/**
 * Group flat review comments into threads (root + replies). Replies whose
 * root is missing from the list are dropped.
 */
export function groupThreads(comments: PlanReviewComment[]): ReviewThread[] {
  const roots = new Map<number, ReviewThread>();
  for (const comment of comments) {
    if (comment.inReplyTo === undefined) {
      roots.set(comment.id, { root: comment, replies: [] });
    }
  }
  for (const comment of comments) {
    if (comment.inReplyTo !== undefined) {
      roots.get(comment.inReplyTo)?.replies.push(comment);
    }
  }
  return [...roots.values()];
}

/**
 * Threads anchored inside a rendered block's file-line range (inclusive).
 * Callers convert markdown source positions to file lines first:
 * fileLine = position line + frontmatterOffset. Threads without a line
 * anchor (LEFT-side/outdated) never match.
 */
export function threadsForBlock(
  threads: ReviewThread[],
  startLine: number,
  endLine: number,
): ReviewThread[] {
  return threads.filter(
    ({ root }) =>
      root.line !== undefined && root.line >= startLine && root.line <= endLine,
  );
}
