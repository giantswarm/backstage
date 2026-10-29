import { useEffect, useRef } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  focusFirstInvalidField,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { TenantPicker } from './TenantPicker';

/**
 * What agent-manager's `get_info` answers for the person on each
 * environment: where they may create.
 */
let mockManaged: Record<string, string[] | undefined> = {};
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => {
    const managed = installation ? mockManaged[installation] : undefined;
    return {
      info: managed
        ? { namespaces: { default: 'kagent', managed } }
        : undefined,
      isLoading: false,
      error: null,
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
        {`tenant=${state.tenant ?? ''} kind=${state.tenantKind ?? ''} model=${
          state.modelConfigNamespace ?? ''
        }/${state.modelConfigName ?? ''} error=${
          fieldErrors.tenant ?? ''
        } pick=${fieldErrors.tenantPick ?? ''}`}
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
      <TenantPicker errorFor={shown} />
    </NewAgentFormProvider>,
  );
}

/** The picker under the form's own validation, with a Continue. */
function ValidatedPicker() {
  const validation = useFieldValidation();
  return (
    <>
      <FormProbe />
      <TenantPicker errorFor={validation.errorFor} />
      <button type="button" onClick={validation.reveal}>
        Continue
      </button>
    </>
  );
}

const form = () => screen.getByRole('status', { name: 'form' });
const kinds = () =>
  screen.getByRole('radiogroup', { name: 'Who the agent belongs to' });
const kind = (name: RegExp) => within(kinds()).getByRole('radio', { name });
const dropdown = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`${name}$`) });
const options = () =>
  screen.getAllByRole('option').map(option => option.textContent);
const kindLabels = () =>
  within(kinds())
    .getAllByRole('radio')
    .map(radio => radio.closest('label')?.textContent);

describe('TenantPicker', () => {
  beforeEach(() => {
    mockManaged = {};
  });

  it('names and picks the only organization the person may create in', async () => {
    mockManaged = { gazelle: ['org-acme'] };
    await renderPicker();

    expect(
      await screen.findByText(/you may create agents only there/),
    ).toHaveTextContent(
      'The agent belongs to the acme organization: on gazelle, you may create agents only there.',
    );
    // The platform tenant's model is not the new agent's: the picker
    // preselects the organization's own instead.
    expect(form()).toHaveTextContent(
      'tenant=org-acme kind=organization model=/ error= pick=',
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();
    // The probe prints `tenant=`; the picker never says tenant.
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
  });

  it('names the platform where the person may create only there', async () => {
    mockManaged = { gazelle: ['kagent'] };
    await renderPicker();

    expect(
      await screen.findByText(/you may create agents only there/),
    ).toHaveTextContent('The agent belongs to the platform');
    expect(form()).toHaveTextContent('tenant=kagent');
  });

  it('offers Platform beside the organizations, and Organization the organizations by name', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'org-beta'] };
    await renderPicker();

    expect(
      await screen.findByRole('heading', { name: 'Organization' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tenant|tenant /)).toBeNull();
    expect(kindLabels()).toEqual([
      'Platform — the platform’s agents, for everyone',
      'Organization — one organization’s agents, for its people',
    ]);
    // Nothing is chosen for the person, and the form says what to choose,
    // on the radio group.
    expect(form()).toHaveTextContent(
      'kind= model=kagent/default-model-config error=Choose Platform or Organization. pick=',
    );
    expect(kinds()).toHaveAttribute('data-invalid');
    expect(kinds()).toHaveAccessibleDescription(
      'Choose Platform or Organization.',
    );
    // A blocked Continue lands on the group's first choice.
    expect(focusFirstInvalidField()).toBe(true);
    expect(kind(/^Platform/)).toHaveFocus();
    // The organizations wait for Organization.
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();

    await userEvent.click(kind(/^Platform/));
    expect(form()).toHaveTextContent('tenant=kagent kind=platform');
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();

    await userEvent.click(kind(/^Organization/));
    // Organization over Platform: no organization is picked for the person,
    // and the form's problem is the dropdown's, not the choice's.
    expect(form()).toHaveTextContent(
      /^tenant= kind=organization .* error= pick=Choose an organization\.$/,
    );
    expect(kinds()).not.toHaveAttribute('data-invalid');
    expect(dropdown('Organization')).toHaveAccessibleDescription(
      'Choose an organization.',
    );
    await userEvent.click(dropdown('Organization'));
    expect(options()).toEqual(['acme', 'beta']);

    await userEvent.click(screen.getByRole('option', { name: 'beta' }));
    expect(form()).toHaveTextContent(
      'tenant=org-beta kind=organization model=/ error= pick=',
    );
    // The selected value reads as the plain name too.
    expect(dropdown('Organization')).toHaveTextContent(/^beta/);
    expect(screen.queryByText(/organization beta/)).toBeNull();
    expect(screen.queryByText('Choose an organization.')).toBeNull();
  });

  it('picks the one organization beside the platform once Organization is chosen', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme'] };
    await renderPicker();

    await screen.findByRole('radiogroup');
    await userEvent.click(kind(/^Organization/));
    expect(form()).toHaveTextContent('tenant=org-acme kind=organization');
    expect(dropdown('Organization')).toHaveTextContent(/^acme/);
  });

  it('offers organizations only, without Platform, where the platform is not the person’s', async () => {
    mockManaged = { gazelle: ['org-acme', 'org-beta'] };
    await renderPicker();

    expect(
      await screen.findByText('Choose an organization.'),
    ).toBeInTheDocument();
    expect(form()).toHaveTextContent('error= pick=Choose an organization.');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(dropdown('Organization'));
    expect(options()).toEqual(['acme', 'beta']);
  });

  it('offers a namespace that is no organization as Other namespace, never under Organization', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'team-a', 'team-b'] };
    await renderPicker();

    await screen.findByRole('radiogroup');
    expect(kindLabels()).toEqual([
      'Platform — the platform’s agents, for everyone',
      'Organization — one organization’s agents, for its people',
      'Other namespace — the agents of a namespace that is no organization',
    ]);
    expect(form()).toHaveTextContent(
      'error=Choose Platform, Organization or Other namespace.',
    );

    // Organization's only organization is acme, not a team namespace.
    await userEvent.click(kind(/^Organization/));
    expect(form()).toHaveTextContent('tenant=org-acme kind=organization');
    await userEvent.click(dropdown('Organization'));
    expect(options()).toEqual(['acme']);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(kind(/^Other namespace/));
    expect(form()).toHaveTextContent(
      /^tenant= kind=namespace .* pick=Choose a namespace\.$/,
    );
    await userEvent.click(dropdown('Other namespace'));
    expect(options()).toEqual(['team-a', 'team-b']);
    await userEvent.click(screen.getByRole('option', { name: 'team-b' }));
    expect(form()).toHaveTextContent('tenant=team-b kind=namespace');
  });

  it('offers no Organization where the only other place is a namespace that is none', async () => {
    mockManaged = { gazelle: ['kagent', 'team-a'] };
    await renderPicker();

    await screen.findByRole('radiogroup');
    expect(kindLabels().map(label => label?.split(' — ')[0])).toEqual([
      'Platform',
      'Other namespace',
    ]);
    await userEvent.click(kind(/^Other namespace/));
    expect(form()).toHaveTextContent('tenant=team-a kind=namespace');
  });

  it('forgets the choice with the environment, and picks the new one’s only organization once chosen', async () => {
    mockManaged = {
      gazelle: ['kagent', 'org-acme', 'org-beta'],
      golem: ['kagent', 'org-zeta'],
    };
    await renderPicker();

    await screen.findByRole('radiogroup');
    await userEvent.click(kind(/^Organization/));
    expect(form()).toHaveTextContent('kind=organization');

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to golem' }),
    );
    // Nothing is chosen on golem for the person.
    expect(form()).toHaveTextContent(
      /^tenant= kind= .*error=Choose Platform or Organization\./,
    );
    expect(kind(/^Organization/)).not.toBeChecked();
    expect(kind(/^Platform/)).not.toBeChecked();

    await userEvent.click(kind(/^Organization/));
    expect(form()).toHaveTextContent('tenant=org-zeta kind=organization');
    expect(dropdown('Organization')).toHaveTextContent(/^zeta/);
  });

  it('keeps the dropdown that appears after a blocked Continue quiet until the next', async () => {
    mockManaged = { gazelle: ['kagent', 'org-acme', 'org-beta'] };
    await renderInTestApp(
      <NewAgentFormProvider>
        <ValidatedPicker />
      </NewAgentFormProvider>,
    );

    await screen.findByRole('radiogroup');
    expect(kinds()).not.toHaveAttribute('data-invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Choose Platform or Organization.'),
    ).toBeInTheDocument();
    expect(kinds()).toHaveAttribute('data-invalid');

    await userEvent.click(kind(/^Organization/));
    // The choice is fixed; the dropdown is new and not in error yet.
    expect(screen.queryByText('Choose Platform or Organization.')).toBeNull();
    expect(screen.queryByText('Choose an organization.')).toBeNull();
    expect(dropdown('Organization')).not.toHaveAttribute('aria-describedby');

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('Choose an organization.'),
    ).toBeInTheDocument();
    expect(dropdown('Organization')).toHaveAccessibleDescription(
      'Choose an organization.',
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
        <TenantPicker errorFor={shown} />
      </NewAgentFormProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'Organization' })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});
