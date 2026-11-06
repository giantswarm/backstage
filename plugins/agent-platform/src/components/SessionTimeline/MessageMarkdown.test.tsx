import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { MessageMarkdown } from './MessageMarkdown';

describe('MessageMarkdown', () => {
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

  it('navigates in the app for a same-origin link, query kept', async () => {
    await renderInTestApp(
      <MessageMarkdown text="[Start a session with General Assistant](/?agent=golem%2Fkagent%2Fdefault-agent&prompt=Watch%20backups)" />,
    );

    const link = screen.getByRole('link', {
      name: 'Start a session with General Assistant',
    });
    expect(link).toHaveAttribute(
      'href',
      '/?agent=golem%2Fkagent%2Fdefault-agent&prompt=Watch%20backups',
    );
    expect(link).not.toHaveAttribute('target');
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
