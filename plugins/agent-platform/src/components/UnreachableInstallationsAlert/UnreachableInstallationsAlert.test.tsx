import { renderInTestApp } from '@backstage/test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      screen.getByText("Couldn't read 2 environments"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Agents/)).toBeInTheDocument();
    expect(screen.getByText(/gremlin, gauss/)).toBeInTheDocument();
  });

  it('uses the singular form for a single installation', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert installations={['gremlin']} />,
    );

    expect(screen.getByText("Couldn't read 1 environment")).toBeInTheDocument();
  });

  it('names the reason and the request id per installation', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss']}
        resourceName="Sessions"
        failures={{
          gremlin: { reason: 'authentication failed', requestId: 'req-1' },
          gauss: { reason: 'timed out' },
        }}
      />,
    );

    expect(
      screen.getByText(
        "Skipped because their Sessions couldn't be read: gremlin (authentication failed, request id req-1); gauss (timed out).",
      ),
    ).toBeInTheDocument();
  });

  it('names three installations in full, with no disclosure', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss', 'golem']}
      />,
    );

    expect(screen.getByText(/gremlin, gauss, golem\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/more/)).toBeNull();
    expect(screen.queryByRole('button', { name: /environments/ })).toBeNull();
  });

  it('caps 300 installations at five names, with the rest behind a disclosure', async () => {
    const installations = Array.from(
      { length: 300 },
      (_, index) => `inst-${index + 1}`,
    );
    await renderInTestApp(
      <UnreachableInstallationsAlert installations={installations} />,
    );

    expect(
      screen.getByText(
        /: inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/inst-6,/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'All 300 environments' }),
    ).toBeInTheDocument();
  });

  it('groups 300 failures by reason, the request ids behind the disclosure', async () => {
    const installations = Array.from(
      { length: 300 },
      (_, index) => `inst-${index + 1}`,
    );
    const failures = Object.fromEntries(
      installations.map((installation, index) => [
        installation,
        index % 2 === 0
          ? { reason: 'timed out', requestId: `req-${index + 1}` }
          : { reason: 'permission denied' },
      ]),
    );
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={installations}
        resourceName="Sessions"
        failures={failures}
      />,
    );

    expect(
      screen.getByText(
        "Skipped because their Sessions couldn't be read: inst-1, inst-3, inst-5, inst-7, inst-9 and 145 more (timed out); inst-2, inst-4, inst-6, inst-8, inst-10 and 145 more (permission denied).",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'All 300 environments' }),
    );
    expect(
      screen.getByText('inst-1 (timed out, request id req-1)'),
    ).toBeVisible();
    expect(screen.getByText('inst-300 (permission denied)')).toBeVisible();
  });

  describe('closing', () => {
    it('announces as an alert and closes with its close button', async () => {
      await renderInTestApp(
        <UnreachableInstallationsAlert installations={['gremlin', 'gauss']} />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent("Couldn't read 2 environments");

      await userEvent.click(
        within(alert).getByRole('button', { name: 'Close' }),
      );

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText("Couldn't read 2 environments")).toBeNull();
    });

    it('closes the long form, with its disclosure, too', async () => {
      const installations = Array.from(
        { length: 300 },
        (_, index) => `inst-${index + 1}`,
      );
      await renderInTestApp(
        <UnreachableInstallationsAlert installations={installations} />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(screen.queryByRole('alert')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'All 300 environments' }),
      ).toBeNull();
    });

    it('shows again when a different set of environments fails', async () => {
      const { rerender } = await renderInTestApp(
        <UnreachableInstallationsAlert installations={['gremlin']} />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('alert')).toBeNull();

      rerender(<UnreachableInstallationsAlert installations={['gremlin']} />);
      expect(screen.queryByRole('alert')).toBeNull();

      rerender(
        <UnreachableInstallationsAlert installations={['gremlin', 'gauss']} />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't read 2 environments",
      );
    });
  });
});
