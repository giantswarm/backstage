import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Definition, platformCapabilitiesApiRef, VerifyResult } from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  CUSTOMER_PORTAL_DEFINITION,
  FakeApi,
  FakeOptions,
  installation,
  PORTAL_ON_RECORD,
} from '../fixtures/fakeApi';
import { CapabilityCard } from './CapabilityCard';
import { CapabilityDialog } from './CapabilityDialog';
import {
  PlatformCapabilitiesProviders,
  platformCapabilitiesQueryClient,
} from './Providers';
import { REQUIRED_MESSAGE } from './SchemaForm';

jest.mock('./connectBounce', () => ({
  ...jest.requireActual('./connectBounce'),
  bounceToConnect: jest.fn(),
}));

/** rowan with its portal on record. */
const PORTAL = installation({
  capabilities: [
    {
      name: 'customer-portal',
      state: 'enabled',
      enabled: true,
      lastAction: null,
    },
  ],
});

/** The dialog alone, opened with a comparison or none. */
async function renderDialog(
  definition: Definition,
  comparison?: VerifyResult,
  options: FakeOptions = {},
) {
  const api = new FakeApi({ definitions: [definition], ...options });
  const target = installation({
    capabilities: [
      {
        name: definition.name,
        state: 'enabled',
        enabled: true,
        lastAction: null,
      },
    ],
  });
  await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <PlatformCapabilitiesProviders>
        <CapabilityDialog
          kind="reconcile"
          installation={target}
          capability={target.capabilities[0]}
          definition={definition}
          comparison={comparison}
          isOpen
          onClose={() => undefined}
        />
      </PlatformCapabilitiesProviders>
    </TestApiProvider>,
  );
  return { api, form: screen.getByRole('form') };
}

const textbox = (name: string) => screen.getByRole('textbox', { name });
/** A select's trigger, named by its value and its label. */
const select = (label: string) =>
  screen.getByRole('button', { name: n => n.endsWith(` ${label}`) });
/** The form's groups and fields, without the dialog's own heading. */
const fields = () => within(screen.getByTestId('group-root'));

describe('CapabilityDialog', () => {
  beforeEach(() => {
    platformCapabilitiesQueryClient.clear();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it("Apply changes opens with the card's comparison: the choices on record, no schema default as a value", async () => {
    const api = new FakeApi({
      definitions: [CUSTOMER_PORTAL_DEFINITION],
      verified: PORTAL_ON_RECORD,
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <PlatformCapabilitiesProviders>
          <CapabilityCard
            installation={PORTAL}
            capability={PORTAL.capabilities[0]}
            definition={CUSTOMER_PORTAL_DEFINITION}
          />
        </PlatformCapabilitiesProviders>
      </TestApiProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );
    const dialog = screen.getByRole('form', {
      name: 'Apply changes to customer-portal on rowan',
    });
    // Title, Domain and Organization from the record: the title reads what
    // the portal's files say, not the schema's Dev Portal.
    expect(textbox('Title')).toHaveValue('Backstage');
    expect(textbox('Domain')).toHaveValue('portal.rowan.example.test');
    expect(textbox('Organization')).toHaveValue('Example');
    expect(textbox('Line')).toHaveValue('>=1.0.0 <2.0.0');
    expect(select('Github')).toHaveTextContent('yes');
    expect(select('Grafana')).toHaveTextContent('no');
    // The form asks the person's choices only: not the record's facts, not
    // the domain the manager reads, not the app id supplied at commit.
    expect(within(dialog).queryByLabelText(/base domain/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/app id/i)).toBeNull();
    expect(within(dialog).queryByLabelText(/key id/i)).toBeNull();
    expect(
      within(dialog).queryByRole('heading', { name: 'Installation' }),
    ).toBeNull();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Review' }),
    );
    await waitFor(() => expect(api.verifies).toHaveLength(2));
    // The review carries the choices the form holds and nothing the manager
    // reads itself.
    expect(api.verifies[1].args?.inputs).toEqual({
      portal: {
        domain: 'portal.rowan.example.test',
        title: 'Backstage',
        organization: 'Example',
      },
      chart: { line: '>=1.0.0 <2.0.0' },
      plugins: {
        github: { enabled: true },
        grafana: { enabled: false },
        sentry: { enabled: true },
      },
    });
  });

  it('shows a schema default as the placeholder of the empty field and submits nothing for it', async () => {
    const { api, form } = await renderDialog(AGENT_PLATFORM_DEFINITION);
    const serving = select('Model serving');
    expect(serving).toHaveTextContent('no (default)');
    // The one choice of the definition, without its group's heading said twice.
    expect(fields().queryByRole('heading')).toBeNull();
    await userEvent.click(within(form).getByRole('button', { name: 'Review' }));
    await waitFor(() => expect(api.verifies).toHaveLength(1));
    expect(api.verifies[0].args?.inputs).toEqual({});

    const withoutTitle: VerifyResult = {
      ...PORTAL_ON_RECORD,
      inputs: {
        ...PORTAL_ON_RECORD.inputs!,
        values: {
          ...PORTAL_ON_RECORD.inputs!.values,
          portal: { domain: 'portal.rowan.example.test', organization: 'Ex' },
        },
      },
    };
    platformCapabilitiesQueryClient.clear();
    await renderDialog(CUSTOMER_PORTAL_DEFINITION, withoutTitle);
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Dev Portal (default)');
  });

  it('gives every control its own name and every group its heading', async () => {
    const { form } = await renderDialog(CUSTOMER_PORTAL_DEFINITION);
    // Each label names exactly one control (getByRole throws on two); the
    // four switches named enabled in the schema are named by their groups.
    for (const name of ['Domain', 'Title', 'Organization', 'Support url']) {
      expect(textbox(name)).toBeVisible();
    }
    expect(textbox('Line')).toBeVisible();
    for (const name of ['Github', 'Grafana', 'Sentry', 'Tunnel']) {
      expect(select(name)).toBeVisible();
    }
    expect(within(form).queryByLabelText(/^enabled/i)).toBeNull();
    expect(within(form).getAllByRole('textbox')).toHaveLength(5);
    expect(
      fields()
        .getAllByRole('heading', { level: 3 })
        .map(h => h.textContent),
    ).toEqual(['Portal', 'Chart', 'Plugins']);
    // A plugin's one switch is the plugin: no h4 repeating its name.
    expect(fields().queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });

  it('marks a required choice without a value on the field and names it next to Review, leading to it', async () => {
    const { form } = await renderDialog(
      CUSTOMER_PORTAL_DEFINITION,
      PORTAL_ON_RECORD,
    );
    const tunnel = form.querySelector('[data-field="tunnel.enabled"]')!;
    expect(tunnel).toHaveTextContent(REQUIRED_MESSAGE);
    const domainField = form.querySelector('[data-field="portal.domain"]')!;
    expect(domainField).not.toHaveTextContent(REQUIRED_MESSAGE);
    const summary = screen.getByTestId('missing-required');
    expect(summary).toHaveTextContent(/Required, not chosen yet:\s*Tunnel$/);
    expect(summary).not.toHaveTextContent('tunnel.enabled');

    // Clearing a required field marks it too, and the summary names it.
    await userEvent.clear(textbox('Domain'));
    expect(textbox('Domain')).toBeInvalid();
    expect(domainField).toHaveTextContent(REQUIRED_MESSAGE);
    expect(summary).toHaveTextContent(
      /Required, not chosen yet:\s*Domain\s*Tunnel$/,
    );

    // The name in the summary leads to the field.
    await userEvent.click(
      within(summary).getByRole('button', { name: 'Tunnel' }),
    );
    expect(select('Tunnel')).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // Choosing clears the mark and the name.
    await userEvent.click(select('Tunnel'));
    await userEvent.click(screen.getByRole('option', { name: 'yes' }));
    expect(tunnel).not.toHaveTextContent(REQUIRED_MESSAGE);
    expect(summary).not.toHaveTextContent('Tunnel');
  });
});
