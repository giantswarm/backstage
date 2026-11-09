import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
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
    expect(link).toHaveAttribute('href', '#details');
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
