import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { GSPageLayout } from './GSPageLayout';

const tabs = [
  { id: 'list', label: 'List view', href: 'list' },
  { id: 'tree', label: 'Tree view', href: 'tree' },
];

// PageBlueprint mounts the page at a splat route (`/flux/*`); `mountPath` makes
// renderInTestApp do the same, so GSPageLayout can derive the base path from
// the splat remainder just like it does in the real app.
function renderAt(pathname: string) {
  return renderInTestApp(
    <GSPageLayout title="Flux" tabs={tabs}>
      <div>content</div>
    </GSPageLayout>,
    { mountPath: '/flux', initialRouteEntries: [pathname] },
  );
}

describe('GSPageLayout', () => {
  it('renders sub-page tabs with absolute hrefs, not relative ones', async () => {
    await renderAt('/flux/list');

    // Relative hrefs (`list`/`tree`) would append to the URL and break tab
    // navigation; they must resolve to absolute paths under the page base.
    expect(screen.getByRole('tab', { name: 'List view' })).toHaveAttribute(
      'href',
      '/flux/list',
    );
    expect(screen.getByRole('tab', { name: 'Tree view' })).toHaveAttribute(
      'href',
      '/flux/tree',
    );
  });

  it('resolves absolute hrefs when the sub-route contains encoded characters', async () => {
    // `location.pathname` stays percent-encoded while the splat param is
    // decoded; the base path must still resolve to `/flux`, not the deep path.
    await renderAt('/flux/tree/some%20nested%20id');

    expect(screen.getByRole('tab', { name: 'List view' })).toHaveAttribute(
      'href',
      '/flux/list',
    );
    expect(screen.getByRole('tab', { name: 'Tree view' })).toHaveAttribute(
      'href',
      '/flux/tree',
    );
  });

  it('marks the tab for the current sub-route as active', async () => {
    await renderAt('/flux/tree');

    expect(screen.getByRole('tab', { name: 'Tree view' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'List view' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('renders only the content when noHeader is set', async () => {
    await renderInTestApp(
      <GSPageLayout title="Flux" tabs={tabs} noHeader>
        <div>content</div>
      </GSPageLayout>,
    );

    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
