import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { useLocation } from 'react-router-dom';
import { GSMarkdownContent } from './GSMarkdownContent';

const LocationHash = () => <output>{`hash:${useLocation().hash}`}</output>;

describe('GSMarkdownContent', () => {
  it('renders markdown content', () => {
    render(<GSMarkdownContent content={'# Heading\n\nA paragraph of text.'} />);

    expect(
      screen.getByRole('heading', { name: 'Heading' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A paragraph of text.')).toBeInTheDocument();
  });

  it('renders GFM tables by default', () => {
    render(<GSMarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} />);

    // GFM table syntax produces a real <table> only when the gfm dialect is
    // active, which is the default for this component.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
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

    it('jumps to an anchor from raw HTML', async () => {
      await renderMarkdown(
        ['[Install](#install)', '', '<a name="install"></a>Install it.'].join(
          '\n',
        ),
      );

      fireEvent.click(screen.getByRole('link', { name: 'Install' }));

      const anchor = document.activeElement;
      expect(anchor).toHaveAttribute('name', 'user-content-install');
      await waitFor(() => expect(scrolledTo).toEqual([anchor]));
    });

    it('jumps to a footnote and back', async () => {
      await renderMarkdown('A claim[^1].\n\n[^1]: The source.');

      const reference = screen.getByRole('link', { name: '1' });
      fireEvent.click(reference);

      const note = document.activeElement;
      expect(note).toHaveTextContent('The source.');
      await waitFor(() => expect(scrolledTo).toEqual([note]));

      fireEvent.click(screen.getByRole('link', { name: /back to content/i }));

      expect(reference).toHaveFocus();
      await waitFor(() => expect(scrolledTo).toEqual([note, reference]));
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
});
