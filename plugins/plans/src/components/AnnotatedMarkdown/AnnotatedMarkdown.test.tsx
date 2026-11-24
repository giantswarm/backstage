import { ReactElement } from 'react';
import {
  act,
  fireEvent,
  render as renderInDocument,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTheme, ThemeProvider } from '@material-ui/core/styles';
import { MemoryRouter } from 'react-router-dom';
import { PlanPullFile, PlanReviewComment } from '../../apis';
import { planDocumentLink } from '../../lib/repositoryLinks';
import { AnnotatedMarkdown } from './AnnotatedMarkdown';

// The document renders its links through the router, as on the review page.
const render = (ui: ReactElement) =>
  renderInDocument(ui, { wrapper: MemoryRouter });

const mermaid = {
  initialize: jest.fn(),
  render: jest.fn(async (id: string, source: string) => {
    if (!source.startsWith('graph')) {
      throw new Error('No diagram type detected matching given configuration');
    }
    return { svg: `<svg id="${id}"><g class="node"></g></svg>` };
  }),
};
jest.mock('mermaid', () => ({ __esModule: true, default: mermaid }));

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

  it('keeps the draft and shows the error when the comment fails while the page re-renders', async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    const request = new Promise((_, r) => {
      reject = r;
    });
    const onCreate = jest.fn().mockReturnValue(request);
    const { rerender } = render(
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
    expect(onCreate).toHaveBeenCalledTimes(1);

    // The review page re-renders while the request is in flight (its
    // mutation turns pending), handing down fresh prop identities. The
    // composer that owns the request must survive that.
    rerender(
      <AnnotatedMarkdown
        content={content}
        file={addedFile}
        comments={[]}
        onCreate={comment => onCreate(comment)}
      />,
    );

    await act(async () => {
      reject(new Error('GitHub responded with 403'));
    });

    expect(
      await screen.findByText('GitHub responded with 403'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Comment on line 3')).toHaveValue(
      'Looks good',
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('closes the composer and shows the thread once the comment is created', async () => {
    const user = userEvent.setup();
    let resolve!: (value: unknown) => void;
    const request = new Promise(r => {
      resolve = r;
    });
    const onCreate = jest.fn().mockReturnValue(request);
    const { rerender } = render(
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

    // The comments refetch lands before the mutation settles.
    rerender(
      <AnnotatedMarkdown
        content={content}
        file={addedFile}
        comments={[
          { id: 9, body: 'Looks good', path: 'doc.md', line: 3, author: 'a' },
        ]}
        onCreate={comment => onCreate(comment)}
      />,
    );
    expect(screen.getByPlaceholderText('Comment on line 3')).toHaveValue(
      'Looks good',
    );

    await act(async () => {
      resolve({});
    });

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('Comment on line 3'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Looks good')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Reply')).toBeInTheDocument();
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
  describe('Mermaid diagrams', () => {
    const withDiagrams = [
      '# Plan',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '```mermaid',
      'not a diagram',
      '```',
      '',
    ].join('\n');

    beforeEach(() => jest.clearAllMocks());

    it('renders a mermaid fence as its diagram and keeps the block commentable', async () => {
      const comments: PlanReviewComment[] = [
        { id: 1, body: 'Arrow reversed?', path: 'doc.md', line: 3 },
      ];
      render(
        <AnnotatedMarkdown
          content={withDiagrams}
          file={addedFile}
          comments={comments}
          onCreate={jest.fn()}
        />,
      );

      const [diagram] = await screen.findAllByTestId('mermaid-diagram');
      expect(diagram.querySelector('svg')).not.toBeNull();
      expect(screen.queryByText(/A --> B/)).toBeNull();
      expect(mermaid.render).toHaveBeenCalledWith(
        expect.any(String),
        'graph TD\n  A --> B',
      );
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'default' }),
      );

      // The fence starts on line 3: its gutter button and thread stay with it.
      const block = diagram.parentElement as HTMLElement;
      expect(
        within(block).getByLabelText('Comment on line 3'),
      ).toBeInTheDocument();
      expect(within(block).getByText('Arrow reversed?')).toBeInTheDocument();
    });

    it('shows an invalid diagram as its source with a note', async () => {
      render(
        <AnnotatedMarkdown
          content={withDiagrams}
          file={addedFile}
          comments={[]}
          onCreate={jest.fn()}
        />,
      );

      expect(await screen.findByRole('note')).toHaveTextContent(
        'No diagram type detected',
      );
      expect(screen.getByText('not a diagram')).toBeInTheDocument();
      expect(screen.getByLabelText('Comment on line 8')).toBeInTheDocument();
    });

    it('draws the diagram in Mermaid’s dark theme in a dark portal', async () => {
      render(
        <ThemeProvider theme={createTheme({ palette: { type: 'dark' } })}>
          <AnnotatedMarkdown
            content={withDiagrams}
            file={addedFile}
            comments={[]}
            onCreate={jest.fn()}
          />
        </ThemeProvider>,
      );

      await screen.findAllByTestId('mermaid-diagram');
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' }),
      );
      expect(mermaid.initialize).not.toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'default' }),
      );
    });
  });

  describe('links', () => {
    const RealScrollIntoView = Element.prototype.scrollIntoView;
    let scrolledTo: Element[];

    beforeAll(() => {
      // jsdom does not scroll.
      Element.prototype.scrollIntoView = function scrollIntoView(
        this: Element,
      ) {
        scrolledTo.push(this);
      };
    });

    afterAll(() => {
      Element.prototype.scrollIntoView = RealScrollIntoView;
    });

    beforeEach(() => {
      scrolledTo = [];
    });

    const plan: PlanPullFile = {
      filename: 'beekeeper/PRD.md',
      status: 'added',
      additions: 20,
      deletions: 0,
    };
    const resolveLink = (href: string) =>
      planDocumentLink(href, {
        documentPath: plan.filename,
        pageHref: '/hive/plans/pr/7?repo=giantswarm%2Fteam-plans&team=Team',
        documents: new Set([plan.filename, 'beekeeper/design/operations.md']),
        repo: 'giantswarm/team-plans',
        ref: 'plan/beekeeper',
      });
    const document = [
      '# Beekeeper',
      '',
      '- [Operations](design/operations.md)',
      '- [Failures](design/operations.md#failures)',
      '- [Design folder](design/)',
      '- [Workflow](workflows/sdlc.yaml)',
      '- [Upstream](https://example.com/spec)',
      '- [The solution](#the-solution-muster--beekeeper)',
      '',
      '## The solution: muster & beekeeper',
      '',
      'Text.',
    ].join('\n');

    it('opens a document of the pull request here and anything else on GitHub', () => {
      render(
        <AnnotatedMarkdown
          content={document}
          file={plan}
          comments={[]}
          onCreate={jest.fn()}
          resolveLink={resolveLink}
        />,
      );

      const href = (name: string) =>
        new URL(
          screen
            .getByRole('link', { name: new RegExp(`^${name}`) })
            .getAttribute('href')!,
          'https://portal.example.com',
        );

      const operations = href('Operations');
      expect(operations.pathname).toBe('/hive/plans/pr/7');
      expect(operations.searchParams.get('doc')).toBe(
        'beekeeper/design/operations.md',
      );
      expect(operations.searchParams.get('repo')).toBe('giantswarm/team-plans');
      expect(operations.searchParams.get('team')).toBe('Team');
      expect(operations.hash).toBe('#top');
      expect(href('Failures').hash).toBe('#failures');

      expect(href('Design folder').href).toBe(
        'https://github.com/giantswarm/team-plans/tree/plan/beekeeper/beekeeper/design',
      );
      expect(href('Workflow').href).toBe(
        'https://github.com/giantswarm/team-plans/blob/plan/beekeeper/beekeeper/workflows/sdlc.yaml',
      );
      expect(href('Upstream').href).toBe('https://example.com/spec');
      // A page out of the portal opens in a new tab.
      expect(
        screen.getByRole('link', { name: /^Design folder/ }),
      ).toHaveAttribute('target', '_blank');
    });

    it('jumps to a heading by its GitHub slug', async () => {
      render(
        <AnnotatedMarkdown
          content={document}
          file={plan}
          comments={[]}
          onCreate={jest.fn()}
          resolveLink={resolveLink}
        />,
      );

      fireEvent.click(screen.getByRole('link', { name: 'The solution' }));

      const heading = screen.getByRole('heading', {
        name: 'The solution: muster & beekeeper',
      });
      expect(heading).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([heading]));
    });

    it('scrolls to the fragment it opens with', async () => {
      render(
        <AnnotatedMarkdown
          content={document}
          file={plan}
          comments={[]}
          onCreate={jest.fn()}
          fragment="the-solution-muster--beekeeper"
        />,
      );

      const heading = screen.getByRole('heading', {
        name: 'The solution: muster & beekeeper',
      });
      await waitFor(() => expect(scrolledTo).toEqual([heading]));
    });
  });
});
