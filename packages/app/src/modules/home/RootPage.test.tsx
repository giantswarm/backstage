import { configApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RootPage } from './RootPage';

jest.mock('./HomePage', () => ({
  HomePage: () => <div data-testid="home-page" />,
}));

function renderRootPage(data: object) {
  return render(
    <TestApiProvider apis={[[configApiRef, mockApis.config({ data })]]}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootPage />} />
          <Route
            path="/agent-platform"
            element={<div data-testid="agent-platform-page" />}
          />
        </Routes>
      </MemoryRouter>
    </TestApiProvider>,
  );
}

describe('RootPage', () => {
  it('renders the home page when app.rootRedirect is unset', () => {
    renderRootPage({ app: { title: 'Test' } });

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-platform-page')).not.toBeInTheDocument();
  });

  it('redirects to app.rootRedirect when it is set', () => {
    renderRootPage({ app: { rootRedirect: '/agent-platform' } });

    expect(screen.getByTestId('agent-platform-page')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });
});
