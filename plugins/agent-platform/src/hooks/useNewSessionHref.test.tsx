import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { newSessionExternalRouteRef } from '../routes';
import { useNewSessionHref } from './useNewSessionHref';

function Probe() {
  const newSessionHref = useNewSessionHref();
  return (
    <ul>
      <li data-testid="plain">{String(newSessionHref?.())}</li>
      <li data-testid="with-agent">
        {String(newSessionHref?.({ id: 'lab/kagent/helper agent' }))}
      </li>
    </ul>
  );
}

describe('useNewSessionHref', () => {
  it('leads to the bound home, with the agent preselected when given', async () => {
    await renderInTestApp(<Probe />, {
      mountedRoutes: { '/': newSessionExternalRouteRef },
    });

    expect(screen.getByTestId('plain')).toHaveTextContent(/^\/$/);
    expect(screen.getByTestId('with-agent')).toHaveTextContent(
      '/?agent=lab%2Fkagent%2Fhelper%20agent',
    );
  });

  it('is undefined while the app binds no home', async () => {
    await renderInTestApp(<Probe />);

    expect(screen.getByTestId('plain')).toHaveTextContent('undefined');
  });
});
