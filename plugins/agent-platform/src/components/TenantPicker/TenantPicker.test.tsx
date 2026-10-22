import { useEffect, useRef } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusFirstInvalidField } from '@giantswarm/backstage-plugin-ui-react';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { TenantPicker } from './TenantPicker';

/** What agent-manager's `get_info` answers for the person: where they may create. */
let mockManaged: string[] | undefined;
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => ({
    info:
      installation && mockManaged
        ? { namespaces: { default: 'kagent', managed: mockManaged } }
        : undefined,
    isLoading: false,
    error: null,
  }),
}));

/**
 * Picks the environment, as the environment select does, and once a model of
 * the platform tenant, as the model picker preselects one before the tenants
 * are known; prints what the form holds.
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
    <output aria-label="form">
      {`tenant=${state.tenant ?? ''} model=${
        state.modelConfigNamespace ?? ''
      }/${state.modelConfigName ?? ''} error=${fieldErrors.tenant ?? ''}`}
    </output>
  );
}

/** The picker with the form's own problem shown, as a blocked Continue does. */
function ShownPicker() {
  const { fieldErrors } = useNewAgentForm();
  return <TenantPicker error={fieldErrors.tenant} />;
}

async function renderPicker() {
  await renderInTestApp(
    <NewAgentFormProvider>
      <FormProbe />
      <ShownPicker />
    </NewAgentFormProvider>,
  );
}

const form = () => screen.getByRole('status', { name: 'form' });
const kinds = () =>
  screen.getByRole('radiogroup', { name: 'Platform or organization' });
const organizationSelect = () =>
  screen.getByRole('button', { name: /Organization$/ });

describe('TenantPicker', () => {
  it('names and picks the only organization the person may create in', async () => {
    mockManaged = ['org-acme'];
    await renderPicker();

    expect(
      await screen.findByText(/you may create agents only there/),
    ).toHaveTextContent(
      'The agent belongs to the acme organization: on gazelle, you may create agents only there.',
    );
    // The platform tenant's model is not the new agent's: the picker
    // preselects the organization's own instead.
    expect(form()).toHaveTextContent('tenant=org-acme model=/ error=');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: /Organization/ })).toBeNull();
    // The probe prints `tenant=`; the picker never says tenant.
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
  });

  it('names the platform where the person may create only there', async () => {
    mockManaged = ['kagent'];
    await renderPicker();

    expect(
      await screen.findByText(/you may create agents only there/),
    ).toHaveTextContent('The agent belongs to the platform');
    expect(form()).toHaveTextContent('tenant=kagent');
  });

  it('offers Platform beside the organizations, and Organization the organizations by name', async () => {
    mockManaged = ['kagent', 'org-acme', 'org-beta'];
    await renderPicker();

    expect(
      await screen.findByRole('heading', { name: 'Organization' }),
    ).toBeInTheDocument();
    // The probe prints `tenant=`; the picker never says tenant.
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
    // Nothing is chosen for the person, and the form says what to choose,
    // on the radio group.
    expect(form()).toHaveTextContent('error=Choose Platform or Organization.');
    expect(kinds()).toHaveAttribute('data-invalid');
    expect(kinds()).toHaveAccessibleDescription(
      'Choose Platform or Organization.',
    );
    // A blocked Continue lands on the group's first choice.
    expect(focusFirstInvalidField()).toBe(true);
    expect(
      within(kinds()).getByRole('radio', { name: /^Platform/ }),
    ).toHaveFocus();
    // The organizations wait for Organization.
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();

    await userEvent.click(
      within(kinds()).getByRole('radio', { name: /^Platform/ }),
    );
    expect(form()).toHaveTextContent('tenant=kagent');
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();

    await userEvent.click(
      within(kinds()).getByRole('radio', { name: /^Organization/ }),
    );
    // Organization over Platform: no organization is picked for the person.
    expect(form()).toHaveTextContent(
      /^tenant= .*error=Choose Platform or Organization\.$/,
    );
    expect(screen.getByText('Choose an organization.')).toBeInTheDocument();
    await userEvent.click(organizationSelect());
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['acme', 'beta']);

    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    expect(form()).toHaveTextContent('tenant=org-beta model=/ error=');
    // The selected value reads as the plain name too.
    expect(organizationSelect()).toHaveTextContent(/^beta/);
    expect(screen.queryByText(/organization beta/)).toBeNull();
    expect(screen.queryByText('Choose an organization.')).toBeNull();
  });

  it('picks the one organization beside the platform once Organization is chosen', async () => {
    mockManaged = ['kagent', 'org-acme'];
    await renderPicker();

    await userEvent.click(
      within(await screen.findByRole('radiogroup')).getByRole('radio', {
        name: /^Organization/,
      }),
    );
    expect(form()).toHaveTextContent('tenant=org-acme');
    expect(organizationSelect()).toHaveTextContent(/^acme/);
  });

  it('offers organizations only, without Platform, where the platform is not the person’s', async () => {
    mockManaged = ['org-acme', 'org-beta'];
    await renderPicker();

    expect(
      await screen.findByText('Choose an organization.'),
    ).toBeInTheDocument();
    expect(form()).toHaveTextContent('error=Choose an organization.');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(organizationSelect());
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['acme', 'beta']);
  });

  it('says who grants access where the person may create in no organization, and blocks the form', async () => {
    mockManaged = [];
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
    mockManaged = ['kagent', 'org-acme'];
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
        <TenantPicker />
      </NewAgentFormProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'Organization' })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
