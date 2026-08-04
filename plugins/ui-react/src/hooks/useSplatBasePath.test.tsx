import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { useSplatBasePath } from './useSplatBasePath';

const Probe = () => <div data-testid="base">{useSplatBasePath()}</div>;

function renderAt(routePath: string, url: string) {
  const { unmount } = render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={routePath} element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  const basePath = screen.getByTestId('base').textContent;
  // Several cases per test, so tear down between renders instead of relying on
  // the per-test cleanup.
  unmount();
  return basePath;
}

describe('useSplatBasePath', () => {
  it('strips the matched splat remainder', () => {
    expect(renderAt('/flux/*', '/flux/list')).toBe('/flux');
    expect(
      renderAt('/agent-platform/muster/*', '/agent-platform/muster/tools'),
    ).toBe('/agent-platform/muster');
  });

  it('handles a multi-segment and an empty remainder', () => {
    expect(renderAt('/flux/*', '/flux/tree/kustomization/foo')).toBe('/flux');
    expect(renderAt('/flux/*', '/flux')).toBe('/flux');
  });

  // A pathname segment holding an encoded slash decodes into two parts of the
  // splat param, so counting the param's segments would strip one segment too
  // many and return a path above the mount point.
  it('does not over-strip when a splat segment contains an encoded slash', () => {
    expect(renderAt('/flux/*', '/flux/workflows/a%2Fb')).toBe('/flux');
    expect(renderAt('/flux/*', '/flux/a%2Fb%2Fc')).toBe('/flux');
  });

  it('keeps a base path for deeply encoded remainders instead of escaping to the root', () => {
    // Segment-counting would yield '/' here, which callers turn into the
    // protocol-relative '//sub'.
    expect(renderAt('/x/*', '/x/a%2Fb%2Fc%2Fd')).toBe('/x');
  });

  it('returns an empty string when the whole path is the splat', () => {
    expect(renderAt('/*', '/list/tree')).toBe('');
  });
});
