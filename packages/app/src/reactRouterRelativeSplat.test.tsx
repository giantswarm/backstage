import { MemoryRouter, Route, Routes, useHref } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

/**
 * Canary for the react-router behaviour our entity page tabs depend on.
 *
 * Upstream `@backstage/plugin-catalog` builds entity tab hrefs *relative*
 * (`''`, `'deployments'`, …) and renders them through the bui `Header`, which
 * resolves them with `useHref`. Under react-router 6 that resolves against the
 * matched route's base, which is what makes those hrefs correct. React Router 7
 * turns on `v7_relativeSplatPath`, where they resolve against the full current
 * pathname instead — every tab link then gains the active tab segment, and the
 * Overview tab's `''` resolves to the current URL, so it stops navigating
 * (backstage/backstage#32805, #27894; upstream reverted to v6 in #32809).
 *
 * If this test starts failing, the entity page tabs are broken again: either
 * react-router moved to the v7 semantics, or the future flag got enabled.
 * See the react-router hold in renovate-custom.json5.
 */
const Probe = () => (
  <>
    <span data-testid="empty">{useHref('')}</span>
    <span data-testid="sibling">{useHref('deployments')}</span>
  </>
);

describe('react-router relative resolution inside a splat route', () => {
  it('resolves relative hrefs against the route base, not the current pathname', () => {
    render(
      <MemoryRouter
        initialEntries={['/catalog/default/component/backstage/circleci']}
      >
        <Routes>
          <Route path="/catalog/:namespace/:kind/:name/*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('empty')).toHaveTextContent(
      '/catalog/default/component/backstage',
    );
    expect(screen.getByTestId('sibling')).toHaveTextContent(
      '/catalog/default/component/backstage/deployments',
    );
  });
});
