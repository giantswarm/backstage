import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { UnreachableInstallationsAlert } from './UnreachableInstallationsAlert';

describe('UnreachableInstallationsAlert', () => {
  it('renders nothing when no installations are unreachable', async () => {
    const { container } = await renderInTestApp(
      <UnreachableInstallationsAlert installations={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('pluralises and lists the installations', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss']}
        resourceName="Agents"
      />,
    );

    expect(
      screen.getByText("Couldn't read 2 installations"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Agents/)).toBeInTheDocument();
    expect(screen.getByText(/gremlin, gauss/)).toBeInTheDocument();
  });

  it('uses the singular form for a single installation', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert installations={['gremlin']} />,
    );

    expect(
      screen.getByText("Couldn't read 1 installation"),
    ).toBeInTheDocument();
  });
});
