import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from '@backstage/ui';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BUIRouterProvider } from './BUIRouterProvider';

function Location() {
  return <p>{`at ${useLocation().pathname}`}</p>;
}

describe('BUIRouterProvider', () => {
  it('resolves and follows a relative link against the matched route, as the app does', async () => {
    render(
      <MemoryRouter initialEntries={['/workflows/deploy/overview']}>
        <BUIRouterProvider>
          <Routes>
            <Route
              path="/workflows/:name/*"
              element={
                <>
                  <Link href="run">Run</Link>
                  <Location />
                </>
              }
            />
          </Routes>
        </BUIRouterProvider>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Run' });
    expect(link).toHaveAttribute('href', '/workflows/deploy/run');
    await userEvent.click(link);
    expect(screen.getByText('at /workflows/deploy/run')).toBeInTheDocument();
  });
});
