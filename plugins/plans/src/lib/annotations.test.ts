import { PlanPullFile, PlanReviewComment } from '../apis/types';
import {
  commentableLines,
  firstCommentableLine,
  frontmatterOffset,
  groupThreads,
  isCommentable,
  threadsForBlock,
} from './annotations';

function file(overrides: Partial<PlanPullFile>): PlanPullFile {
  return {
    filename: 'doc.md',
    status: 'modified',
    additions: 0,
    deletions: 0,
    ...overrides,
  };
}

function comment(overrides: Partial<PlanReviewComment>): PlanReviewComment {
  return { id: 1, body: 'hi', ...overrides };
}

describe('commentableLines', () => {
  it('accepts every line for added files', () => {
    const lines = commentableLines(file({ status: 'added' }));
    expect(lines).toBe('all');
    expect(isCommentable(lines, 1)).toBe(true);
    expect(isCommentable(lines, 9999)).toBe(true);
  });

  it('accepts only RIGHT-side hunk lines for modified files', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' # Title',
      '-old line',
      '+new line',
      '+another line',
      ' trailing',
      '@@ -10,2 +11,2 @@',
      ' context',
      '-gone',
      '+here',
    ].join('\n');
    const lines = commentableLines(file({ patch }));
    // First hunk covers new lines 1-4, second hunk 11-12.
    expect([...(lines as Set<number>)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 11, 12,
    ]);
    expect(isCommentable(lines, 4)).toBe(true);
    expect(isCommentable(lines, 5)).toBe(false);
    expect(isCommentable(lines, 10)).toBe(false);
    expect(isCommentable(lines, 12)).toBe(true);
  });

  it('accepts nothing when the patch is missing', () => {
    const lines = commentableLines(file({}));
    expect(isCommentable(lines, 1)).toBe(false);
  });
});

describe('firstCommentableLine', () => {
  it('anchors to the block start for added files', () => {
    expect(firstCommentableLine('all', 7, 9)).toBe(7);
  });

  it('anchors to the first diff line inside the block range', () => {
    const lines = new Set([8, 9]);
    expect(firstCommentableLine(lines, 7, 9)).toBe(8);
    expect(firstCommentableLine(lines, 9, 12)).toBe(9);
  });

  it('is undefined when the block has no diff lines', () => {
    expect(firstCommentableLine(new Set([20]), 7, 9)).toBeUndefined();
    expect(firstCommentableLine(new Set<number>(), 1, 5)).toBeUndefined();
  });
});

describe('frontmatterOffset', () => {
  it('is zero without frontmatter', () => {
    expect(frontmatterOffset('# Title\n\ntext\n')).toBe(0);
  });

  it('counts the stripped frontmatter lines', () => {
    const markdown = '---\ntitle: Foo\ntags: [a]\n---\n# Title\n';
    // splitFrontmatter removes 4 lines; body line 1 (# Title) is file line 5.
    expect(frontmatterOffset(markdown)).toBe(4);
  });

  it('handles CRLF frontmatter', () => {
    const markdown = '---\r\ntitle: Foo\r\n---\r\n# Title\r\n';
    expect(frontmatterOffset(markdown)).toBe(3);
  });
});

describe('groupThreads', () => {
  it('groups replies under their root and drops orphans', () => {
    const threads = groupThreads([
      comment({ id: 1, line: 5 }),
      comment({ id: 2, inReplyTo: 1 }),
      comment({ id: 3, inReplyTo: 1 }),
      comment({ id: 4, inReplyTo: 99 }),
      comment({ id: 5, line: 8 }),
    ]);
    expect(threads).toHaveLength(2);
    expect(threads[0].root.id).toBe(1);
    expect(threads[0].replies.map(r => r.id)).toEqual([2, 3]);
    expect(threads[1].root.id).toBe(5);
    expect(threads[1].replies).toEqual([]);
  });
});

describe('threadsForBlock', () => {
  const threads = groupThreads([
    comment({ id: 1, line: 5 }),
    comment({ id: 2, line: 10 }),
    comment({ id: 3 }), // no line anchor (outdated/LEFT side)
  ]);

  it('returns threads whose root line falls in the inclusive range', () => {
    expect(threadsForBlock(threads, 5, 9).map(t => t.root.id)).toEqual([1]);
    expect(threadsForBlock(threads, 5, 10).map(t => t.root.id)).toEqual([
      1, 2,
    ]);
    expect(threadsForBlock(threads, 6, 9)).toEqual([]);
  });

  it('never matches threads without a line anchor', () => {
    expect(threadsForBlock(threads, 0, 1000).map(t => t.root.id)).toEqual([
      1, 2,
    ]);
  });
});
