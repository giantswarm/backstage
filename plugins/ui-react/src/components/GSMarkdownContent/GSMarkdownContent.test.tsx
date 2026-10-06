import { render, screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { GSMarkdownContent } from './GSMarkdownContent';

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
    // In-page anchors of a GitHub document open it on github.com, where the
    // heading ids match.
    const anchorLink = screen.getByRole('link', { name: /below/ });
    expect(anchorLink).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/trivy-app/blob/refs/tags/v0.18.1/README.md#configuration',
    );
    expect(anchorLink).toHaveAttribute('target', '_blank');
    expect(anchorLink).toHaveAttribute('rel', 'noopener');
  });

  it('keeps in-page anchors on the page for a non-GitHub source', async () => {
    await renderInTestApp(
      <GSMarkdownContent
        content="See [below](#configuration)."
        sourceUrl="https://docs.example.com/apps/README.md"
      />,
    );

    // The router adds the current path.
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
});
