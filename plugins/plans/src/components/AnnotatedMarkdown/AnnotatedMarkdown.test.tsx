import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanPullFile, PlanReviewComment } from '../../apis';
import { AnnotatedMarkdown } from './AnnotatedMarkdown';

const addedFile: PlanPullFile = {
  filename: 'doc.md',
  status: 'added',
  additions: 5,
  deletions: 0,
};

const content = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';

describe('AnnotatedMarkdown', () => {
  it('renders markdown blocks with a gutter button per block', () => {
    render(
      <AnnotatedMarkdown
        content={content}
        file={addedFile}
        comments={[]}
        onCreate={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    // Heading (line 1), first paragraph (line 3), second paragraph (line 5).
    expect(screen.getByLabelText('Comment on line 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment on line 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment on line 5')).toBeInTheDocument();
  });

  it('opens a composer and creates a comment anchored to the block line', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockResolvedValue({});
    render(
      <AnnotatedMarkdown
        content={content}
        file={addedFile}
        comments={[]}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByLabelText('Comment on line 3'));
    await user.type(
      screen.getByPlaceholderText('Comment on line 3'),
      'Looks good',
    );
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    expect(onCreate).toHaveBeenCalledWith({
      body: 'Looks good',
      path: 'doc.md',
      line: 3,
    });
  });

  it('offsets anchors by the frontmatter the renderer strips', () => {
    const withFrontmatter = `---\ntitle: Foo\n---\n# Title\n\nBody text.\n`;
    render(
      <AnnotatedMarkdown
        content={withFrontmatter}
        file={addedFile}
        comments={[]}
        onCreate={jest.fn()}
      />,
    );

    // Body line 1 (# Title) is file line 4 after the 3 frontmatter lines.
    expect(screen.getByLabelText('Comment on line 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment on line 6')).toBeInTheDocument();
  });

  it('renders existing threads under their anchor block with replies', () => {
    const comments: PlanReviewComment[] = [
      { id: 1, body: 'Root comment', path: 'doc.md', line: 3, author: 'a' },
      { id: 2, body: 'A reply', path: 'doc.md', inReplyTo: 1, author: 'b' },
      { id: 3, body: 'Other file', path: 'other.md', line: 3 },
    ];
    render(
      <AnnotatedMarkdown
        content={content}
        file={addedFile}
        comments={comments}
        onCreate={jest.fn()}
      />,
    );

    expect(screen.getByText('Root comment')).toBeInTheDocument();
    expect(screen.getByText('A reply')).toBeInTheDocument();
    expect(screen.queryByText('Other file')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reply')).toBeInTheDocument();
  });

  it('hides the gutter button on blocks outside the diff', () => {
    const modified: PlanPullFile = {
      filename: 'doc.md',
      status: 'modified',
      additions: 1,
      deletions: 0,
      // Only line 5 (second paragraph) is on the RIGHT side of the diff.
      patch: '@@ -5,0 +5,1 @@\n+Second paragraph.',
    };
    render(
      <AnnotatedMarkdown
        content={content}
        file={modified}
        comments={[]}
        onCreate={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Comment on line 5')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Comment on line 1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Comment on line 3'),
    ).not.toBeInTheDocument();
  });

  it('anchors list items on the item line, not the surrounding list', () => {
    const listContent = 'Intro.\n\n- first item\n- second item\n';
    render(
      <AnnotatedMarkdown
        content={listContent}
        file={addedFile}
        comments={[]}
        onCreate={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Comment on line 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment on line 4')).toBeInTheDocument();
  });
});
