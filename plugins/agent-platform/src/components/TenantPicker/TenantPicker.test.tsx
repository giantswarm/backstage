import { useEffect, useRef } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

async function renderPicker() {
  await renderInTestApp(
    <NewAgentFormProvider>
      <FormProbe />
      <TenantPicker />
    </NewAgentFormProvider>,
  );
}

const form = () => screen.getByRole('status', { name: 'form' });

describe('TenantPicker', () => {
  it('names and picks the only tenant the person may create in', async () => {
    mockManaged = ['org-acme'];
    await renderPicker();

    expect(
      await screen.findByText(/the only tenant you may create agents in/),
    ).toHaveTextContent('Created in organization acme');
    // The platform tenant's model is not the new agent's: the picker
    // preselects the tenant's own instead.
    expect(form()).toHaveTextContent('tenant=org-acme model=/ error=');
    expect(screen.queryByRole('button', { name: /Tenant/ })).toBeNull();
  });

  it('offers only the tenants the person may create in, the platform tenant picked', async () => {
    mockManaged = ['kagent', 'org-acme'];
    await renderPicker();

    expect(await screen.findByText(/tenant=kagent/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tenant/ }));
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['platform', 'organization acme']);

    await userEvent.click(
      screen.getByRole('option', { name: 'organization acme' }),
    );
    expect(form()).toHaveTextContent('tenant=org-acme');
  });

  it('says who grants access where the person may create in no tenant, and blocks the form', async () => {
    mockManaged = [];
    await renderPicker();

    expect(
      await screen.findByText('You may not create agents here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /no tenant on gazelle\. Access to agents .*agent-platform:editor/,
      ),
    ).toBeInTheDocument();
    expect(form()).toHaveTextContent(
      'error=You may create agents in no tenant on gazelle.',
    );
  });
});
