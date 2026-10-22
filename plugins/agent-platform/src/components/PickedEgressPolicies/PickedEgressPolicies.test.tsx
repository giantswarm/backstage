import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { PickedEgressPolicies } from './PickedEgressPolicies';

let mockState: {
  egressPolicies: { name: string; namespace: string; destinations: any[] }[];
  isLoading: boolean;
  failure?: { kind: 'error'; message: string };
};
jest.mock('../../hooks/useAgentManagerEgressPolicies', () => ({
  useAgentManagerEgressPolicies: () => ({ supported: true, ...mockState }),
}));

describe('PickedEgressPolicies', () => {
  it('names each picked policy with its origins, and one the namespace no longer holds', async () => {
    mockState = {
      isLoading: false,
      egressPolicies: [
        {
          name: 'iana',
          namespace: 'org-otter',
          destinations: [
            { origin: 'https://www.iana.org', credentialHeader: 'X-Api-Key' },
          ],
        },
      ],
    };
    await renderInTestApp(
      <PickedEgressPolicies
        installation="gazelle"
        namespace="org-otter"
        names={['iana', 'gone']}
      />,
    );

    expect(screen.getByText('iana')).toBeInTheDocument();
    expect(
      screen.getByText('https://www.iana.org (adds X-Api-Key)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Not in org-otter: the agent reaches none of its origins',
      ),
    ).toBeInTheDocument();
  });

  it('shows the names alone while the list is not read', async () => {
    mockState = { isLoading: true, egressPolicies: [] };
    await renderInTestApp(
      <PickedEgressPolicies
        installation="gazelle"
        namespace="org-otter"
        names={['gone']}
      />,
    );

    expect(screen.getByText('gone')).toBeInTheDocument();
    expect(screen.queryByText(/Not in org-otter/)).not.toBeInTheDocument();
  });
});
