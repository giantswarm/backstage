import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook } from '@testing-library/react';
import { useDetailsPane } from './useDetailsPane';

function wrapperAt(entry: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
}

const PANE = {
  cluster: 'gazelle',
  kind: 'MCPServer',
  namespace: 'muster',
  name: 'walrus-mcp-kubernetes',
};

describe('useDetailsPane getRoute', () => {
  it('builds a route carrying the pane parameters only', () => {
    const { result } = renderHook(() => useDetailsPane('instance'), {
      wrapper: wrapperAt('/servers/kubernetes?installation=gazelle'),
    });

    expect(result.current.getRoute('/servers/kubernetes', PANE)).toBe(
      '/servers/kubernetes?pane=instance&cluster=gazelle&kind=MCPServer&name=walrus-mcp-kubernetes&namespace=muster',
    );
  });

  it('keeps the page’s own parameters, and drops a previous pane’s, with keepSearch', () => {
    const { result } = renderHook(() => useDetailsPane('instance'), {
      wrapper: wrapperAt(
        '/servers/kubernetes?installation=gazelle&pane=instance&name=old&apiVersion=v1',
      ),
    });

    const route = result.current.getRoute('/servers/kubernetes', PANE, {
      keepSearch: true,
    });
    const params = new URLSearchParams(route.split('?')[1]);
    expect(params.get('installation')).toBe('gazelle');
    expect(params.get('name')).toBe('walrus-mcp-kubernetes');
    expect(params.getAll('pane')).toEqual(['instance']);
    expect(params.has('apiVersion')).toBe(false);
  });
});
