import { useEffect, useRef } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFieldValidation } from '@giantswarm/backstage-plugin-ui-react';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import {
  type OrganizationFieldOptions,
  useOrganizationField,
} from './useOrganizationField';

/**
 * The field in a region named by where it puts the pair: `main`, or `line`
 * (wherever the other field goes).
 */
function OrganizationFieldHarness(props: OrganizationFieldOptions) {
  const { inMain, field } = useOrganizationField(props);
  return field ? (
    <section aria-label={inMain ? 'main' : 'line'}>{field}</section>
  ) : null;
}

/**
 * What agent-manager's `get_info` answers for the person on each
 * environment: where they may create.
 */
let mockManaged: Record<string, string[] | undefined> = {};
/** get_info still in flight: no answer yet. */
let mockReading = false;
const mockRefetch = jest.fn();
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => {
    const managed =
      installation && !mockReading ? mockManaged[installation] : undefined;
    return {
      info: managed
        ? { namespaces: { default: 'kagent', managed } }
        : undefined,
      isLoading: mockReading,
      error: null,
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
  const { state, setInstallation, selectModelConfig, fieldErrors } =
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
      selectModelConfig('default-model-config', 'kagent');
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
    </>
  );
}

/** Every problem shows at once. */
const shown = (_field: string, problem: string | undefined) => problem;

async function renderPicker() {
  await renderInTestApp(
    <NewAgentFormProvider>
      <FormProbe />
      <OrganizationFieldHarness errorFor={shown} />
    </NewAgentFormProvider>,
  );
}

/** The picker under the form's own validation, with a Continue. */
function ValidatedPicker() {
  const validation = useFieldValidation();
  return (
    <>
      <FormProbe />
      <OrganizationFieldHarness errorFor={validation.errorFor} />
      <button type="button" onClick={validation.reveal}>
        Continue
      </button>
    </>
  );
}

const form = () => screen.getByRole('status', { name: 'form' });
const dropdown = () => screen.getByRole('button', { name: /Organization$/ });
const options = () =>
  screen.getAllByRole('option').map(option => option.textContent);
const DESCRIPTION = 'Who can use the agent, and whose editors can change it.';

describe('useOrganizationField', () => {
  beforeEach(() => {
    mockManaged = {};
    mockReading = false;
  });

  it('picks the only organization and states it in a line under More options', async () => {
    mockManaged = { gazelle: ['org-acme'] };
    await renderPicker();

    const field = await screen.findByRole('region', { name: 'line' });
    expect(field).toHaveTextContent(
      'Belongs to acme, the only place on gazelle where you may create agents.',
    );
    // The platform tenant's model is not the new agent's: the picker
    // preselects the organization's own instead.
    expect(form()).toHaveTextContent('tenant=org-acme model=/ error=');
    // Informational only: no control.
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    // The probe prints `tenant=`; the picker never says tenant.
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
  });

  it('states the platform where the person may create only there', async () => {
    mockManaged = { gazelle: ['kagent'] };
    await renderPicker();

    expect(
      await screen.findByRole('region', { name: 'line' }),
    ).toHaveTextContent('Belongs to Platform, the only place on gazelle');
    expect(form()).toHaveTextContent('tenant=kagent');
  });

  it('offers Platform and the organizations by name in one dropdown, Platform picked', async () => {
    mockManaged = { gazelle: ['org-acme', 'kagent', 'org-beta'] };
    await renderPicker();

    expect(
      await screen.findByRole('region', { name: 'main' }),
    ).toContainElement(dropdown());
    // Labelled like the form's other fields, no heading, no radio.
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
    // The first offered is picked, and never a placeholder.
    expect(form()).toHaveTextContent(
      'tenant=kagent model=kagent/default-model-config error=',
    );
    expect(dropdown()).toHaveTextContent(/^Platform/);
    expect(dropdown()).not.toHaveTextContent(/Select an option/);

    await userEvent.click(dropdown());
    expect(options()).toEqual([
      'PlatformAvailable to all organizations.',
      'acme',
      'beta',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    // Organization over the platform's preselected model: it goes.
    expect(form()).toHaveTextContent('tenant=org-beta model=/ error=');
    expect(dropdown()).toHaveTextContent(/^beta/);
    expect(screen.queryByText(/organization beta/)).toBeNull();
  });

  it('picks the first organization where the platform is not the person’s', async () => {
    mockManaged = { gazelle: ['org-acme', 'org-beta'] };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent('tenant=org-acme');
    await userEvent.click(dropdown());
    expect(options()).toEqual(['acme', 'beta']);
  });

  it('sections organizations and other namespaces where both are offered', async () => {
    mockManaged = { gazelle: ['team-a', 'org-acme', 'team-b'] };
    await renderPicker();

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent('tenant=org-acme');
    await userEvent.click(dropdown());
    expect(options()).toEqual(['acme', 'team-a', 'team-b']);
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Other namespaces')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'team-b' }));
    expect(form()).toHaveTextContent('tenant=team-b');
  });

  it('keeps the person’s pick with the environment where it is offered there too', async () => {
    mockManaged = {
      gazelle: ['kagent', 'org-acme', 'org-beta'],
      golem: ['kagent', 'org-beta'],
    };
    await renderPicker();

    await userEvent.click(
      await screen.findByRole('button', { name: /Organization$/ }),
    );
    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent('tenant=org-beta');
    expect(dropdown()).toHaveTextContent(/^beta/);
  });

  it('picks the new environment’s first where it does not offer the pick', async () => {
    mockManaged = {
      gazelle: ['kagent', 'org-acme', 'org-beta'],
      golem: ['org-zeta', 'org-eta'],
    };
    await renderPicker();

    await userEvent.click(
      await screen.findByRole('button', { name: /Organization$/ }),
    );
    await userEvent.click(screen.getByRole('option', { name: 'acme' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );

    await screen.findByRole('region', { name: 'main' });
    expect(form()).toHaveTextContent(/^tenant=org-zeta .*error=$/);
    expect(dropdown()).toHaveTextContent(/^zeta/);
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
    expect(screen.getByRole('group', { name: 'Organization' })).toHaveAttribute(
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

  it('lets Continue through with the default picked', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'org-beta'] };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await screen.findByRole('region', { name: 'main' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(dropdown()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Choose an organization.')).toBeNull();
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

  it('offers nothing while editing: the agent stays in its organization', async () => {
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
        <OrganizationFieldHarness errorFor={shown} />
      </NewAgentFormProvider>,
    );

    expect(screen.queryByRole('region', { name: /^(main|line)$/ })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
