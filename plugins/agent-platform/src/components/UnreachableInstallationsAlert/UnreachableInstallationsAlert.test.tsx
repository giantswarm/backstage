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
        resourceName="agents"
      />,
    );

    expect(
      screen.getByText('Could not read 2 environments'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The agents on gremlin and gauss could not be read. The environments may be unreachable, or your account may lack permission there.',
      ),
    ).toBeInTheDocument();
  });

  it('says what the failure means where it shows', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss']}
        resourceName="model configs"
        consequence="They are not offered for this agent."
      />,
    );

    expect(
      screen.getByText(
        /could not be read\. .* lack permission there\. They are not offered for this agent\.$/,
      ),
    ).toBeInTheDocument();
  });

  it('reads as one for a single installation, as under a pinned scope', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin']}
        resourceName="served models"
      />,
    );

    expect(
      screen.getByText('Could not read 1 environment'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The served models on gremlin could not be read. The environment may be unreachable, or your account may lack permission there.',
      ),
    ).toBeInTheDocument();
  });

  it('names the reason and the request id of a single installation', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin']}
        resourceName="sessions"
        failures={{
          gremlin: { reason: 'authentication failed', requestId: 'req-1' },
        }}
      />,
    );

    expect(
      screen.getByText(
        'The sessions could not be read on gremlin (authentication failed, request id req-1).',
      ),
    ).toBeInTheDocument();
  });

  it('names the reason and the request id per installation', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss']}
        resourceName="sessions"
        failures={{
          gremlin: { reason: 'authentication failed', requestId: 'req-1' },
          gauss: { reason: 'timed out' },
        }}
      />,
    );

    expect(
      screen.getByText(
        'The sessions could not be read on these environments: gremlin (authentication failed, request id req-1); gauss (timed out).',
      ),
    ).toBeInTheDocument();
  });

  it('names three installations in full, with no disclosure', async () => {
    await renderInTestApp(
      <UnreachableInstallationsAlert
        installations={['gremlin', 'gauss', 'golem']}
      />,
    );

    expect(
      screen.getByText(
        /^The kagent resources on gremlin, gauss and golem could not be read\./,
      ),
    ).toBeInTheDocument();
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
        /^The kagent resources on inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more could not be read\. The environments may be unreachable/,
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
        resourceName="sessions"
        failures={failures}
      />,
    );

    expect(
      screen.getByText(
        'The sessions could not be read on these environments: inst-1, inst-3, inst-5, inst-7, inst-9 and 145 more (timed out); inst-2, inst-4, inst-6, inst-8, inst-10 and 145 more (permission denied).',
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

  it('waits while the list it reports on is loading', async () => {
    const { rerender } = await renderInTestApp(
      <UnreachableInstallationsAlert installations={['gremlin']} isLoading />,
    );
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <UnreachableInstallationsAlert
        installations={['gremlin']}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read 1 environment',
    );
  });

  describe('closing', () => {
    it('stays closed when the list loads again and fails the same way', async () => {
      const { rerender } = await renderInTestApp(
        <UnreachableInstallationsAlert installations={['gremlin']} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      rerender(
        <UnreachableInstallationsAlert installations={['gremlin']} isLoading />,
      );
      rerender(<UnreachableInstallationsAlert installations={[]} />);
      rerender(<UnreachableInstallationsAlert installations={['gremlin']} />);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('announces as an alert and closes with its close button', async () => {
      await renderInTestApp(
        <UnreachableInstallationsAlert installations={['gremlin', 'gauss']} />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Could not read 2 environments');

      await userEvent.click(
        within(alert).getByRole('button', { name: 'Close' }),
      );

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Could not read 2 environments')).toBeNull();
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
        'Could not read 2 environments',
      );
    });
  });
});
