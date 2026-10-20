import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { useLocation } from 'react-router-dom';
import { GSMarkdownContent } from './GSMarkdownContent';

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn(async (id: string, source: string) => {
      if (source.startsWith('graph oops')) {
        throw new Error('Parse error on line 1:');
      }
      return { svg: `<svg id="${id}"><text>${source}</text></svg>` };
    }),
  },
}));

const LocationHash = () => <output>{`hash:${useLocation().hash}`}</output>;

describe('GSMarkdownContent', () => {
  it('renders markdown content', () => {
    render(<GSMarkdownContent content={'# Heading\n\nA paragraph of text.'} />);

    expect(
      screen.getByRole('heading', { name: 'Heading' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A paragraph of text.')).toBeInTheDocument();
  });

  it('links a footnote reference to its note and back', async () => {
    const { container } = await renderInTestApp(
      <GSMarkdownContent content={'A claim[^1].\n\n[^1]: The source.'} />,
    );
    const fragmentOf = (link: Element | null) =>
      link?.getAttribute('href')?.split('#')[1];

    const reference = screen.getByRole('link', { name: '1' });
    const note = screen.getByText('The source.').closest('li');
    expect(note).toHaveAttribute('id', 'user-content-fn-1');
    expect(fragmentOf(reference)).toBe(note!.id);

    const backReference = screen.getByRole('link', {
      name: 'Back to content',
    });
    expect(reference).toHaveAttribute('id', 'user-content-fnref-1');
    expect(fragmentOf(backReference)).toBe(reference.id);
    expect(
      container.querySelector('[id^="user-content-user-content-"]'),
    ).toBeNull();
  });

  it('opens links out of the document in the link target, footnotes in the page', async () => {
    await renderInTestApp(
      <GSMarkdownContent
        linkTarget="_blank"
        content={
          'See [the docs](/docs/default/component/backstage)[^1].\n\n[^1]: The source.'
        }
      />,
    );

    expect(screen.getByRole('link', { name: 'the docs' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByRole('link', { name: '1' })).not.toHaveAttribute(
      'target',
    );
    expect(
      screen.getByRole('link', { name: 'Back to content' }),
    ).not.toHaveAttribute('target');
  });

  it('renders GFM tables by default', () => {
    render(<GSMarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} />);

    // GFM table syntax produces a real <table> only when the gfm dialect is
    // active, which is the default for this component.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  });

  it('keeps a wide table, a long URL or a long token inside a phone’s width', () => {
    const wide = `| ${Array.from({ length: 8 }, (_, i) => `column_${i}`).join(
      ' | ',
    )} |\n|${' - |'.repeat(8)}\n| ${Array.from(
      { length: 8 },
      (_, i) => `value_${i}`,
    ).join(' | ')} |`;
    const { container } = render(
      <GSMarkdownContent
        content={`${wide}\n\nSee https://example.com/a/very/long/path/that/never/breaks/on/its/own and \`kubernetes_troubleshooting_and_incident_response\`.`}
      />,
    );

    // The table scrolls itself; everything else breaks where it must.
    expect(screen.getByRole('table')).toHaveStyle({
      display: 'block',
      overflowX: 'auto',
      maxWidth: '100%',
    });
    expect(container.firstElementChild).toHaveStyle({
      overflowWrap: 'anywhere',
    });
    // Cells keep whole words, so the table scrolls rather than squeezing.
    expect(screen.getByRole('columnheader', { name: 'column_0' })).toHaveStyle({
      overflowWrap: 'normal',
    });
    expect(screen.getByRole('cell', { name: 'value_0' })).toHaveStyle({
      overflowWrap: 'normal',
    });
  });

  it('applies a caller-provided className to the wrapper', () => {
    const { container } = render(
      <GSMarkdownContent content="text" className="custom-class" />,
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('resolves relative links against the source URL', async () => {
    await renderInTestApp(
      <GSMarkdownContent
        content="See [the values](helm/trivy/values.yaml) and [below](#configuration)."
        sourceUrl="https://raw.githubusercontent.com/giantswarm/trivy-app/refs/tags/v0.18.1/README.md"
      />,
    );

    const valuesLink = screen.getByRole('link', { name: /the values/ });
    expect(valuesLink).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/trivy-app/blob/refs/tags/v0.18.1/helm/trivy/values.yaml',
    );
    expect(valuesLink).toHaveAttribute('target', '_blank');
    expect(valuesLink).toHaveAttribute('rel', 'noopener');
    // In-page anchors stay on the page; the router adds the current path.
    expect(screen.getByRole('link', { name: 'below' })).toHaveAttribute(
      'href',
      '/#configuration',
    );
  });

  it('leaves relative links alone without a source URL', async () => {
    await renderInTestApp(
      <GSMarkdownContent content="See [the values](helm/trivy/values.yaml)." />,
    );

    expect(
      screen.getByRole('link', { name: /the values/ }),
    ).not.toHaveAttribute('target');
  });

  it('renders an unsafe link as text when resolving against a source URL', async () => {
    // common-mark skips rehype-sanitize, so only the link resolver guards it.
    await renderInTestApp(
      <GSMarkdownContent
        dialect="common-mark"
        content="[click](javascript:alert(1))"
        sourceUrl="https://raw.githubusercontent.com/giantswarm/trivy-app/refs/tags/v0.18.1/README.md"
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('click')).toBeInTheDocument();
  });

  describe('in-page anchors', () => {
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

    async function renderMarkdown(content: string) {
      await renderInTestApp(
        <>
          <GSMarkdownContent content={content} />
          <LocationHash />
        </>,
      );
    }

    it('jumps to a heading by its GitHub slug', async () => {
      await renderMarkdown(
        [
          '- [Values](#valuesyaml)',
          '- [Upgrading](#upgrading-to-v2)',
          '',
          '## values.yaml',
          '',
          '## Upgrading to v2',
        ].join('\n'),
      );

      fireEvent.click(screen.getByRole('link', { name: 'Values' }));

      const heading = screen.getByRole('heading', { name: 'values.yaml' });
      expect(heading).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([heading]));
      // The router does not see the click.
      expect(screen.getByText('hash:')).toBeInTheDocument();
    });

    it('numbers repeated headings the way GitHub does', async () => {
      await renderMarkdown(
        ['[Second](#example-1)', '', '## Example', '', '## Example'].join('\n'),
      );

      fireEvent.click(screen.getByRole('link', { name: 'Second' }));

      const second = screen.getAllByRole('heading', { name: 'Example' })[1];
      expect(second).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([second]));
    });

    it('jumps to an id from raw HTML', async () => {
      await renderMarkdown(
        ['[Install](#install)', '', '<div id="install">Install it.</div>'].join(
          '\n',
        ),
      );

      fireEvent.click(screen.getByRole('link', { name: 'Install' }));

      const anchor = screen.getByText('Install it.');
      expect(anchor).toHaveAttribute('id', 'user-content-install');
      expect(anchor).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([anchor]));
    });

    it('jumps to a footnote', async () => {
      await renderMarkdown('A claim[^1].\n\n[^1]: The source.');

      fireEvent.click(screen.getByRole('link', { name: '1' }));

      const note = document.activeElement;
      expect(note).toHaveTextContent('The source.');
      await waitFor(() => expect(scrolledTo).toEqual([note]));
    });

    it('jumps back from a footnote to its reference', async () => {
      await renderMarkdown('A claim[^1].\n\n[^1]: The source.');

      fireEvent.click(screen.getByRole('link', { name: 'Back to content' }));

      const reference = screen.getByRole('link', { name: '1' });
      expect(reference).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([reference]));
    });

    it.each(['#', '#top'])(
      'scrolls to the top of the document on %s',
      async href => {
        await renderMarkdown(`## Intro\n\n[Back to top](${href})`);

        fireEvent.click(screen.getByRole('link', { name: 'Back to top' }));

        expect(scrolledTo).toHaveLength(1);
        expect(scrolledTo[0]).toContainElement(
          screen.getByRole('heading', { name: 'Intro' }),
        );
        expect(screen.getByText('hash:')).toBeInTheDocument();
      },
    );

    it('scrolls to the top on # even past a heading without text', async () => {
      await renderMarkdown('## ![](diagram.png)\n\n[Back to top](#)');

      fireEvent.click(screen.getByRole('link', { name: 'Back to top' }));

      expect(scrolledTo).toHaveLength(1);
      expect(scrolledTo[0]).toContainElement(screen.getByRole('heading'));
      expect(screen.getByRole('heading')).not.toHaveFocus();
    });

    it('finds a heading by the id it is rendered with', async () => {
      await renderMarkdown('[Values](#values-yaml)\n\n## values.yaml');

      fireEvent.click(screen.getByRole('link', { name: 'Values' }));

      const heading = screen.getByRole('heading', { name: 'values.yaml' });
      expect(heading).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([heading]));
    });

    it('does nothing for an anchor that is not in the document', async () => {
      await renderMarkdown('[Missing](#missing)');

      fireEvent.click(screen.getByRole('link', { name: 'Missing' }));

      expect(scrolledTo).toEqual([]);
      expect(screen.getByText('hash:')).toBeInTheDocument();
    });

    it('leaves links to other pages to the router', async () => {
      await renderMarkdown(
        '[Elsewhere](/catalog/default/component/other#install)\n\n## Install',
      );

      fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));

      expect(scrolledTo).toEqual([]);
      expect(
        screen.getByRole('heading', { name: 'Install' }),
      ).not.toHaveFocus();
    });

    it('leaves a modified click to the browser', async () => {
      await renderMarkdown('[Install](#install)\n\n## Install');

      fireEvent.click(screen.getByRole('link', { name: 'Install' }), {
        ctrlKey: true,
      });

      expect(scrolledTo).toEqual([]);
      expect(
        screen.getByRole('heading', { name: 'Install' }),
      ).not.toHaveFocus();
    });
  });

  describe('Mermaid diagrams', () => {
    const fence = (source: string, indent = '') =>
      [
        `${indent}${'```'}mermaid`,
        `${indent}${source}`,
        `${indent}${'```'}`,
      ].join('\n');

    it('renders mermaid blocks as diagrams and other languages as code', async () => {
      const { container } = render(
        <GSMarkdownContent
          content={[
            '# Architecture',
            '',
            fence('graph TD; A-->B'),
            '',
            'Between the diagrams.',
            '',
            fence('graph oops'),
            '',
            '```yaml',
            'kind: Pod',
            '```',
          ].join('\n')}
        />,
      );

      expect(
        screen.getByRole('heading', { name: 'Architecture' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Between the diagrams.')).toBeInTheDocument();
      expect(await screen.findAllByTestId('mermaid-diagram')).toHaveLength(1);
      expect(await screen.findByRole('note')).toBeInTheDocument();
      expect(container.querySelector('code.language-yaml')).toHaveTextContent(
        'kind: Pod',
      );
      // A diagram never sits inside a <pre>.
      expect(container.querySelector('pre [data-testid]')).toBeNull();
    });

    it('keeps a diagram inside the HTML block around it', async () => {
      const { container } = render(
        <GSMarkdownContent
          content={[
            '<details><summary>Diagram</summary>',
            '',
            fence('graph TD; A-->B'),
            '',
            '</details>',
            '',
            '<!--',
            fence('graph TD; Hidden---Comment'),
            '-->',
          ].join('\n')}
        />,
      );

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.closest('details')).not.toBeNull();
      expect(container.querySelectorAll('details')).toHaveLength(1);
      // The commented-out diagram stays hidden, as on GitHub.
      expect(screen.getAllByTestId('mermaid-diagram')).toHaveLength(1);
      expect(container).not.toHaveTextContent('Hidden');
    });

    it('keeps a diagram in its list item, the list whole', async () => {
      const { container } = render(
        <GSMarkdownContent
          content={[
            '1. Step one:',
            '',
            fence('graph TD; A-->B', '   '),
            '',
            '2. Step two',
          ].join('\n')}
        />,
      );

      const diagram = await screen.findByTestId('mermaid-diagram');
      expect(diagram.closest('li')).toHaveTextContent('Step one');
      expect(container.querySelectorAll('ol')).toHaveLength(1);
      expect(container.querySelectorAll('li')).toHaveLength(2);
    });

    it('resolves references and footnotes across a diagram', async () => {
      const { container } = await renderInTestApp(
        <GSMarkdownContent
          content={[
            'See [the spec][spec] and a note.[^1]',
            '',
            fence('graph TD; A-->B'),
            '',
            '[spec]:',
            '  https://example.com/spec',
            '',
            '[^1]: The note.',
          ].join('\n')}
        />,
      );

      await screen.findByTestId('mermaid-diagram');
      expect(screen.getByRole('link', { name: /the spec/ })).toHaveAttribute(
        'href',
        'https://example.com/spec',
      );
      // The footnote referenced before the diagram is the one note after it.
      expect(container).not.toHaveTextContent('[^1]');
      expect(container.querySelectorAll('sup a')).toHaveLength(1);
      expect(screen.getByText('The note.').closest('ol li')).not.toBeNull();
    });
  });
});
