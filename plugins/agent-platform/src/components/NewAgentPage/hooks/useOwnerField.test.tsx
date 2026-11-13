import { useEffect, useRef } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFieldValidation } from '@giantswarm/backstage-plugin-ui-react';

import {
  NewAgentFormProvider,
  useNewAgentForm,
  useTenantChoicesSync,
} from '../../NewAgentFormProvider';
import { type OwnerFieldOptions, useOwnerField } from './useOwnerField';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

/**
 * The field in a region named by where it puts the pair: `main`, or `line`
 * (wherever the other field goes), with the form taking agent-manager's
 * answer as every step of the wizard does (`NewAgentStep`).
 */
function OwnerFieldHarness(props: OwnerFieldOptions) {
  useTenantChoicesSync();
  const { inMain, field } = useOwnerField(props);
  return field ? (
    <section aria-label={inMain ? 'main' : 'line'}>{field}</section>
  ) : null;
}

/**
 * What agent-manager's `get_info` answers for the person on each
 * environment: where they may create; `null` for an answer without a
 * `managed` list, `undefined` for none (the read failed).
 */
let mockManaged: Record<string, string[] | null | undefined> = {};
/** get_info still in flight: no answer yet. */
let mockReading = false;
const mockRefetch = jest.fn();
/** Whether there is a muster plugin to ask. */
let mockCanRead = true;
jest.mock('../../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => {
    const managed =
      installation && !mockReading ? mockManaged[installation] : undefined;
    let info;
    if (managed === null) {
      info = { namespaces: { default: 'kagent' } };
    } else if (managed) {
      info = { namespaces: { default: 'kagent', managed } };
    }
    return {
      info,
      isLoading: mockReading,
      error: null,
      canRead: mockCanRead,
      refetch: mockRefetch,
    };
  },
}));

/**
 * Picks the environment, as the environment select does, and once a model of
 * the platform tenant, as the model picker preselects one before the tenants
 * are known; prints what the form holds, and switches the environment.
 */
function FormProbe() {
  const { state, setInstallation, selectModelConfig, fieldErrors, reset } =
    useNewAgentForm();
  useEffect(() => {
    if (!state.installation) {
      setInstallation('gazelle');
    }
  }, [state.installation, setInstallation]);
  const picked = useRef(false);
  useEffect(() => {
    if (state.installation && !picked.current) {
      picked.current = true;
      selectModelConfig('anthropic-main', 'kagent');
    }
  }, [state.installation, selectModelConfig]);
  return (
    <>
      <output aria-label="form">
        {`tenant=${state.tenant ?? ''} model=${
          state.modelConfigNamespace ?? ''
        }/${state.modelConfigName ?? ''} error=${fieldErrors.tenant ?? ''}`}
      </output>
      <button type="button" onClick={() => setInstallation('golem')}>
        Switch to golem
      </button>
      <button type="button" onClick={() => setInstallation('gazelle')}>
        Switch to gazelle
      </button>
      <button
        type="button"
        onClick={() => {
          picked.current = false;
          reset();
        }}
      >
        Start over
      </button>
    </>
  );
}

/** Every problem shows at once. */
const shown = (_field: string, problem: string | undefined) => problem;

async function renderPicker() {
  await renderInTestApp(
    <NewAgentFormProvider>
      <FormProbe />
      <OwnerFieldHarness errorFor={shown} />
    </NewAgentFormProvider>,
  );
}

/** The picker under the form's own validation, with a Continue. */
function ValidatedPicker() {
  const validation = useFieldValidation();
  return (
    <>
      <FormProbe />
      <OwnerFieldHarness errorFor={validation.errorFor} />
      <button type="button" onClick={validation.reveal}>
        Continue
      </button>
    </>
  );
}

const form = () => screen.getByRole('status', { name: 'form' });
const owner = () => screen.getByRole('radiogroup', { name: 'Owner' });
const radio = (name: RegExp) => screen.getByRole('radio', { name });
/** The organization dropdown under the radio group, by its radio's name. */
const organizations = () =>
  screen.getByRole('button', { name: /Organization$/ });
const options = () =>
  screen.getAllByRole('option').map(option => option.textContent);
const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

describe('useOwnerField', () => {
  beforeEach(() => {
    mockManaged = {};
    mockReading = false;
    mockCanRead = true;
  });

  it('picks the only organization and states it in a line under More options', async () => {
    mockManaged = { gazelle: ['org-acme'] };
    await renderPicker();

    const field = await screen.findByRole('region', { name: 'line' });
    expect(field).toHaveTextContent(
      'Owner: acme, the only one you may create agents for on gazelle.',
    );
    // The platform tenant's model is not the new agent's: the picker
    // preselects the organization's own instead.
    expect(form()).toHaveTextContent('tenant=org-acme model=/ error=');
    // Informational only: no control.
    expect(
      screen.queryByRole('button', { name: /Owner|Organization/ }),
    ).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    // The probe prints `tenant=`; the picker never says tenant.
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
  });

  it('states the platform where the person may create only there', async () => {
    mockManaged = { gazelle: ['kagent'] };
    await renderPicker();

    expect(
      await screen.findByRole('region', { name: 'line' }),
    ).toHaveTextContent(
      'Owner: Platform, the only one you may create agents for on gazelle.',
    );
    expect(form()).toHaveTextContent('tenant=kagent');
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('offers Platform or Organization as radios, Platform picked, the organizations only once Organization is chosen', async () => {
    mockManaged = { gazelle: ['org-acme', 'kagent', 'org-beta'] };
    await renderPicker();

    expect(
      await screen.findByRole('region', { name: 'main' }),
    ).toContainElement(owner());
    // Labelled like the form's other fields, no heading.
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
    expect(
      screen
        .getAllByRole('radio')
        .map(option => option.closest('label')?.textContent),
    ).toEqual([
      'Platform — the platform’s agents, for everyone',
      'Organization — one organization’s agents, for its people',
    ]);
    // The platform by default; no organization dropdown with it.
    expect(radio(/^Platform/)).toBeChecked();
    expect(form()).toHaveTextContent(
      'tenant=kagent model=kagent/anthropic-main error=',
    );
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();

    // Organization brings its dropdown, the first organization picked, never
    // a placeholder.
    await userEvent.click(radio(/^Organization/));
    expect(radio(/^Organization/)).toBeChecked();
    // Organization over the platform's preselected model: it goes.
    expect(form()).toHaveTextContent('tenant=org-acme model=/ error=');
    expect(organizations()).toHaveTextContent(/^acme/);
    expect(organizations()).not.toHaveTextContent(/Select an option/);
    await userEvent.click(organizations());
    expect(options()).toEqual(['acme', 'beta']);
    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    expect(form()).toHaveTextContent('tenant=org-beta');
    expect(organizations()).toHaveTextContent(/^beta/);

    // Back to the platform, and back again: the person's organization returns.
    await userEvent.click(radio(/^Platform/));
    expect(form()).toHaveTextContent('tenant=kagent');
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();
    await userEvent.click(radio(/^Organization/));
    expect(form()).toHaveTextContent('tenant=org-beta');
  });

  it('offers the organizations alone where the platform is not the person’s, the first picked', async () => {
    mockManaged = { gazelle: ['org-acme', 'org-beta'] };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(form()).toHaveTextContent('tenant=org-acme');
    const dropdown = screen.getByRole('button', { name: /Owner$/ });
    expect(dropdown).toHaveTextContent(/^acme/);
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    await userEvent.click(dropdown);
    expect(options()).toEqual(['acme', 'beta']);
  });

  it('offers Other namespace as a third radio, its namespaces by their own name', async () => {
    mockManaged = { gazelle: ['team-a', 'kagent', 'org-acme', 'team-b'] };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(form()).toHaveTextContent('tenant=kagent');
    await userEvent.click(radio(/^Other namespace/));
    expect(form()).toHaveTextContent('tenant=team-a');
    const dropdown = screen.getByRole('button', { name: /Other namespace$/ });
    await userEvent.click(dropdown);
    expect(options()).toEqual(['team-a', 'team-b']);
    await userEvent.click(screen.getByRole('option', { name: 'team-b' }));
    expect(form()).toHaveTextContent('tenant=team-b');
  });

  it('keeps the person’s pick with the environment where it is offered there too', async () => {
    mockManaged = {
      gazelle: ['kagent', 'org-acme', 'org-beta'],
      golem: ['kagent', 'org-beta'],
    };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    await userEvent.click(radio(/^Organization/));
    await userEvent.click(organizations());
    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent('tenant=org-beta');
    expect(radio(/^Organization/)).toBeChecked();
    expect(organizations()).toHaveTextContent(/^beta/);
  });

  it('picks the platform on the new environment where it does not offer the pick', async () => {
    mockManaged = {
      gazelle: ['kagent', 'org-acme', 'org-beta'],
      golem: ['kagent', 'org-zeta'],
    };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    await userEvent.click(radio(/^Organization/));
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent(/^tenant=kagent .*error=$/);
    expect(radio(/^Platform/)).toBeChecked();
  });

  it('takes the answer again on switching back to an environment that answers the same', async () => {
    // A platform-only person: the same answer everywhere, cached, so it
    // arrives in the render of the switch itself.
    mockManaged = { gazelle: ['kagent'], golem: ['kagent'] };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await screen.findByRole('region', { name: 'line' });
    expect(form()).toHaveTextContent(/^tenant=kagent .*error=$/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to gazelle' }),
    );

    expect(
      await screen.findByRole('region', { name: 'line' }),
    ).toHaveTextContent(
      'Owner: Platform, the only one you may create agents for on gazelle.',
    );
    expect(form()).toHaveTextContent(/^tenant=kagent .*error=$/);
  });

  it('forgets the person’s pick on Start over, and preselects Platform again', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'org-beta'] };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    await userEvent.click(radio(/^Organization/));
    await userEvent.click(organizations());
    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    expect(form()).toHaveTextContent('tenant=org-beta');

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent('tenant=kagent');
    expect(radio(/^Platform/)).toBeChecked();
    // Nor does Organization bring back the discarded pick.
    await userEvent.click(radio(/^Organization/));
    expect(form()).toHaveTextContent('tenant=org-acme');
  });

  it('asks for no owner where agent-manager answers without a list, and lets Continue through', async () => {
    mockManaged = { gazelle: null };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // The create call gets agent-manager's own answer.
    expect(form()).toHaveTextContent(/^tenant= .*error=$/);
    expect(screen.queryByRole('region', { name: /^(main|line)$/ })).toBeNull();
    expect(screen.queryByText(/where you may create agents/)).toBeNull();
  });

  it('blocks Continue while reading where the person may create, and says so', async () => {
    mockManaged = { gazelle: ['org-acme', 'org-beta'] };
    mockReading = true;
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    expect(form()).toHaveTextContent(
      'error=Still reading where you may create agents.',
    );
    // Nothing shows until Continue asks for the place.
    expect(screen.queryByRole('region', { name: /^(main|line)$/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const field = await screen.findByRole('region', { name: 'main' });
    expect(field).toHaveTextContent(
      'Still reading where you may create agents.',
    );
    expect(screen.getByRole('group', { name: 'Owner' })).toHaveAttribute(
      'data-invalid',
    );
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('blocks Continue where it could not read where the person may create, offering Check again', async () => {
    mockManaged = { gazelle: undefined };
    mockRefetch.mockClear();
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Could not read where you may create agents.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('offers no Check again without a muster plugin to ask', async () => {
    mockManaged = { gazelle: undefined };
    mockCanRead = false;
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Could not read where you may create agents.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('lets Continue through with the default picked', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'org-beta'] };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await screen.findByRole('region', { name: 'main' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(radio(/^Platform/)).toBeChecked();
    expect(owner()).not.toHaveAttribute('data-invalid');
    expect(form()).toHaveTextContent(/error=$/);
    expect(screen.queryByText('Choose an owner.')).toBeNull();
  });

  it('ties the blocked Continue to the field where the person may create nowhere, and focuses it', async () => {
    mockManaged = { gazelle: [] };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await screen.findByText('You may not create agents here');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const group = screen.getByRole('group', { name: 'Owner' });
    expect(group).toHaveAttribute('data-invalid');
    expect(group).toHaveFocus();
    expect(group).toHaveAccessibleDescription(
      /^You may not create agents on gazelle\. Choose another environment/,
    );
  });

  it('says who grants access where the person may create in no organization, and blocks the form', async () => {
    mockManaged = { gazelle: [] };
    await renderPicker();

    expect(
      await screen.findByText('You may not create agents here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /On gazelle, you may create agents neither for the platform nor for an organization\. Access to agents is granted per organization: .*agent-platform:editor/,
      ),
    ).toBeInTheDocument();
    expect(form()).toHaveTextContent(
      'error=You may not create agents on gazelle.',
    );
  });

  it('offers nothing while editing: the agent keeps its owner', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme'] };
    await renderInTestApp(
      <NewAgentFormProvider
        edit={{
          agent: {
            name: 'billing',
            namespace: 'org-acme',
            exists: true,
            ready: true,
            managed: 'helmrelease',
          },
          installation: 'gazelle',
          writeMode: 'apply',
          detailHref: undefined,
        }}
      >
        <OwnerFieldHarness errorFor={shown} />
      </NewAgentFormProvider>,
    );

    expect(screen.queryByRole('region', { name: /^(main|line)$/ })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
