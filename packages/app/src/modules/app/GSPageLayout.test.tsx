import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';
import { GSPageLayout } from './GSPageLayout';

// Routed content that registers a header action, the way a tab's index page
// registers its "New agent" button.
function TabContent() {
  useProvidePageHeaderActions(<button type="button">New agent</button>);
  return <div>content</div>;
}

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

  it("renders the page's own header actions alongside the ones the content registers", async () => {
    await renderInTestApp(
      <GSPageLayout
        title="Agent Platform"
        tabs={tabs}
        headerActions={[<select key="scope" aria-label="Installation scope" />]}
      >
        <TabContent />
      </GSPageLayout>,
      { mountPath: '/agent-platform', initialRouteEntries: ['/agent-platform/list'] },
    );

    // The section-wide control is not displaced by the tab's button.
    expect(
      screen.getByRole('combobox', { name: 'Installation scope' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New agent' }),
    ).toBeInTheDocument();
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
